const XLSX = require('xlsx');

// SKU interno estable: prefijo ENG- + slug desde el nombre
// El match a JumpSeller se hace por nombre en MapeoSku (igual que ROMMEL/WINNEX)
function generarSku(nombre) {
  const slug = String(nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return `ENG-${slug}`;
}

/**
 * Parser ENGATEL — determinístico, sin dependencia de IA ni DB.
 * Estructura: col0=nombre, col3=precio (numérico).
 * Filas de sección tienen col0 vacío o col3 con texto "Precio...".
 * Productos sin precio se incluyen con costo: null.
 */
function parsearEngatel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const skusVistos = new Set();
  const productos  = [];

  for (const row of rows) {
    const nombre = String(row[0] || '').trim();
    if (!nombre) continue;

    // Excluir filas de pie/encabezado sin datos de producto
    if (/^vigencia/i.test(nombre)) continue;

    const rawPrecio = row[3];
    // Filas de sección tienen "Precio..." como texto en col3
    if (typeof rawPrecio === 'string' && /precio/i.test(rawPrecio)) continue;

    const precioNum = Number(rawPrecio);
    const costo = (!isNaN(precioNum) && precioNum > 0) ? precioNum : null;

    let sku = generarSku(nombre);
    if (skusVistos.has(sku)) {
      let n = 2;
      while (skusVistos.has(`${sku}-${n}`)) n++;
      sku = `${sku}-${n}`;
    }
    skusVistos.add(sku);

    productos.push({
      sku,
      nombre,
      marca:  'Engatel',
      barras: null,
      costo,
    });
  }

  if (!productos.length) throw new Error('ENGATEL: no se encontraron productos en el Excel');
  console.log(`[engatel] ${productos.length} productos parseados (${productos.filter(p => p.costo != null).length} con precio)`);
  return productos;
}

module.exports = { parsearEngatel };
