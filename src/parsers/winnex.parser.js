const { extraerTextoPPT } = require('./ppt.parser');

// Parser determinístico para GREEN WORLD CHILE (WINNEX).
// El PPT tiene bloques regulares por producto:
//   [categoría]
//   NOMBRE PRODUCTO
//   PRECIO UNITARIO
//   PRECIO X CAJA | X PALLET
//   PRECIO NETO
//   $ <precio_unitario_neto>   ← costo que usamos
//   $ <precio_bundle_neto>
//   PACK x CAJA | x BOLSA | x PALLET
//   PRECIOS CON IVA
//   $ <unit_con_iva>  $ <bundle_con_iva>
//   <n° unidades por caja/pallet>   (opcional)
// El archivo no trae SKU: se genera uno interno estable desde el nombre
// (el match final a JumpSeller se hace por nombre en sync.js).

const parseNum = (s) => parseInt(String(s).replace(/[^\d.,]/g, '').replace(/[.,]/g, ''), 10);

// Normaliza nombre a MAYÚSCULAS, colapsa espacios, saca tildes para el slug del SKU.
const aMayus = (s) => String(s).replace(/\s+/g, ' ').trim().toUpperCase();

function generarSku(nombre) {
  const slug = String(nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return `WNX-${slug}`;
}

function esKeyword(l) {
  return /^PRECIO\b/i.test(l) || /^PRECIOS CON IVA/i.test(l) || /^PACK/i.test(l) ||
         /^\$/.test(l) || /^\d+$/.test(l) ||
         /Haga clic|Editar el estilo|nivel$/i.test(l) || /^Lista de Precios/i.test(l);
}

function parsearWinnex(buffer) {
  const texto = extraerTextoPPT(buffer);
  const lines = texto.split('\n').map(l => l.trim()).filter(Boolean);

  const productos = [];
  const skusVistos = new Set();
  let lastName = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    if (/^PRECIO UNITARIO/i.test(l)) {
      // Buscar "PRECIO NETO" y los dos $ siguientes (unitario, bundle)
      let j = i;
      while (j < lines.length && !/^PRECIO NETO/i.test(lines[j])) j++;
      const nets = [];
      for (let k = j + 1; k < lines.length && nets.length < 2; k++) {
        if (/^\$/.test(lines[k])) nets.push(parseNum(lines[k]));
        else if (/^PRECIO|^PACK|^PRECIOS/i.test(lines[k])) break;
      }
      const costo     = nets[0] ?? null;
      const netBundle = nets[1] ?? null;

      // Línea "PACK x ..." decide caja vs pallet (más confiable que "PRECIO X ...")
      let m = j;
      while (m < lines.length && !/^PACK/i.test(lines[m])) m++;
      const esPallet = m < lines.length && /PALLET/i.test(lines[m]);

      // Nº de unidades: primer número suelto tras "PRECIOS CON IVA"; si no, derivar bundle/unit
      let p = j;
      while (p < lines.length && !/^PRECIOS CON IVA/i.test(lines[p])) p++;
      let unidades = null;
      for (let k = p + 1; k < lines.length; k++) {
        if (/^\d+$/.test(lines[k])) { unidades = parseInt(lines[k], 10); break; }
        if (/^PRECIO UNITARIO/i.test(lines[k])) break;
      }
      if (!unidades && costo && netBundle) unidades = Math.round(netBundle / costo);
      if (unidades && (unidades <= 1 || unidades > 10000)) unidades = unidades <= 1 ? null : unidades;

      if (lastName && costo && costo > 0) {
        const nombre = aMayus(lastName);
        let sku = generarSku(nombre);
        // Garantizar unicidad ante nombres repetidos dentro del archivo
        if (skusVistos.has(sku)) { let n = 2; while (skusVistos.has(`${sku}-${n}`)) n++; sku = `${sku}-${n}`; }
        skusVistos.add(sku);

        productos.push({
          sku,
          nombre,
          marca:          'Winnex',
          barras:         null,
          costo:          Math.ceil(costo / 10) * 10,
          unidadesCaja:   esPallet ? null : (unidades || null),
          unidadesPallet: esPallet ? (unidades || null) : null,
          categoria:      esPallet ? 'pallet' : (unidades > 1 ? 'caja' : 'unidad'),
        });
      }

      lastName = null;
      i = j; // saltar al bloque de precios ya consumido
      continue;
    }

    if (!esKeyword(l)) lastName = l;
  }

  if (!productos.length) throw new Error('WINNEX: no se extrajeron productos del PPT');
  return productos;
}

module.exports = { parsearWinnex };
