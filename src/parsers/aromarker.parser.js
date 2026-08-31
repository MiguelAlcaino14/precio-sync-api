const pdfParse = require('pdf-parse');

// Formato PDF AROMARKER (por línea):
//   NOMBRE + FC##### + $DETALLE_IVA + NETO_DETALLE + $?MAYOR_IVA + NETO_MAYOR
// El costo siempre es el 4° número (NETO del precio mayor/mayorista).
// Nombres multi-línea: las líneas previas al FC se acumulan como nombre.

const PRICE_SEQ  = String.raw`\$?(\d+\.\d{3})(\d+\.\d{3})\$?(\d+\.\d{3})(\d+\.\d{3})`;
const INLINE_RE  = new RegExp(String.raw`^(.+?)(FC\d+)` + PRICE_SEQ);
const SKU_ONLY_RE = new RegExp(String.raw`^(FC\d+)` + PRICE_SEQ);
const SKIP_RE    = /^(DESCRIPCION|SKU|PRECIO|NETO|IMAGEN|OBSERVACIONES|MAYOR DESDE|AGOTADO|POCO STOCK|AVISO|COLOR EN|CELDAS|>>>>|UNIDADES|\d+$|\*|a Cambio|Precio y Stock|CATÁLOGO|aromaker)/i;

function parsearPrecio(s) {
  return parseInt(s.replace('.', ''), 10);
}

async function parsearAromarker(buffer) {
  const data    = await pdfParse(buffer);
  const lineas  = data.text.split('\n').map(l => l.trim()).filter(Boolean);
  const productos  = [];
  let   nombreAcum = [];

  for (const linea of lineas) {
    if (SKIP_RE.test(linea)) { nombreAcum = []; continue; }

    // Caso 1: NOMBRE + SKU + 4 precios en la misma línea
    const m1 = linea.match(INLINE_RE);
    if (m1) {
      const nombre = m1[1].trim();
      const sku    = m1[2];
      const costo  = parsearPrecio(m1[6]); // neto mayor (4° número)
      if (nombre && sku && costo > 0) {
        productos.push({ sku, nombre: nombre.slice(0, 255), costo, marca: 'Aromarker', barras: null });
      }
      nombreAcum = [];
      continue;
    }

    // Caso 2: SKU + 4 precios al inicio (nombre en líneas anteriores)
    const m2 = linea.match(SKU_ONLY_RE);
    if (m2) {
      const sku    = m2[1];
      const costo  = parsearPrecio(m2[5]); // neto mayor (4° número)
      const nombre = nombreAcum.join(' ').trim();
      if (sku && costo > 0 && nombre) {
        productos.push({ sku, nombre: nombre.slice(0, 255), costo, marca: 'Aromarker', barras: null });
      }
      nombreAcum = [];
      continue;
    }

    // Acumular como parte del nombre (producto multi-línea)
    nombreAcum.push(linea);
  }

  if (!productos.length) throw new Error('AROMARKER: no se extrajeron productos del PDF');
  console.log(`[aromarker] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearAromarker };
