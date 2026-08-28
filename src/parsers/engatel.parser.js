const XLSX = require('xlsx');

/**
 * Parser ENGATEL — determinístico, sin dependencia de IA ni DB.
 * Estructura: col0=nombre, col3=precio (numérico).
 * Filas de sección tienen col0 vacío o col3 con texto "Precio...".
 * Productos sin precio se incluyen con costo: null.
 * SKU generado secuencial ENG-001, ENG-002, ... porque el archivo no tiene SKU propio.
 */
function parsearEngatel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let skuIdx   = 1;
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

    productos.push({
      sku:    `ENG-${String(skuIdx++).padStart(3, '0')}`,
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
