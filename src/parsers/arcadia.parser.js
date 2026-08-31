const XLSX = require('xlsx');

function parsearArcadia(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let idx = 1;
  const productos = [];

  for (const r of rows) {
    const nombre = String(r[0] || '').trim();
    if (!nombre) continue;
    if (nombre === 'DESCRIPTOR') continue; // fila header
    if (!r[1] && !r[2] && !r[3]) continue; // fila de sección (solo col[0])

    const precioRaw = r[3];
    const precio = typeof precioRaw === 'number' && precioRaw > 0 ? precioRaw : null;
    if (!precio) continue;

    const unidadesCaja = typeof r[1] === 'number' && r[1] > 1 ? r[1] : null;
    const unidadesPallet = typeof r[2] === 'number' && r[2] > 1 ? r[2] : null;

    productos.push({
      sku:    `ARC-${String(idx++).padStart(3, '0')}`,
      nombre: nombre.slice(0, 255),
      marca:  'Arcadia',
      barras: null,
      costo:  Math.round(precio),
      unidadesCaja,
      unidadesPallet,
      categoria: unidadesCaja > 1 ? 'caja' : 'unidad',
    });
  }

  console.log(`[arcadia] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearArcadia };
