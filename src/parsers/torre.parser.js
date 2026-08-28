const XLSX = require('xlsx');
const { buildProduct, findCol, findHeaderRow, norm, parsePrecio, parseUnidades, text } = require('./parser-utils');

function parsearTorre(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = wb.Sheets['PRECIOS VIGENTE'] ? ['PRECIOS VIGENTE'] : wb.SheetNames;
  const productos = [];
  const skusVistos = new Set();

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerRow = findHeaderRow(rows, ['Cod.', 'Descripción Material']);
    if (headerRow === -1) continue;

    const headers = rows[headerRow];
    const iSku = findCol(headers, 'Cod.');
    const iNombre = findCol(headers, 'Descripción Material');
    const iPrecio = headers.findIndex(h => {
      const normalized = norm(h);
      return normalized.startsWith('precio') && !normalized.includes('antiguo');
    });
    const iMarca = findCol(headers, ['Sector', 'Marca']);
    const iBarras = findCol(headers, 'Codigo EAN');
    const iUnidadesCaja = findCol(headers, 'Uni Caja');
    const iUnidadesPallet = findCol(headers, 'Uni Pallet');

    if (iPrecio === -1) continue;

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const sku = text(row[iSku]);
      const nombre = text(row[iNombre]);
      const costo = parsePrecio(row[iPrecio], { round: true });

      if (!sku || !nombre || costo == null || skusVistos.has(sku)) continue;
      if (norm(sku) === 'cod.') continue;

      skusVistos.add(sku);
      productos.push(buildProduct({
        sku,
        nombre,
        costo,
        marca: text(row[iMarca]) || null,
        barras: text(row[iBarras]) || null,
        unidadesCaja: parseUnidades(row[iUnidadesCaja]),
        unidadesPallet: parseUnidades(row[iUnidadesPallet]),
      }));
    }
  }

  return productos;
}

module.exports = { parsearTorre };
