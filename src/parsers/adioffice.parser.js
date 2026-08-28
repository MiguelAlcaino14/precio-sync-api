const XLSX = require('xlsx');
const { buildProduct, findCol, findHeaderRow, norm, parsePrecio, parseUnidades, text } = require('./parser-utils');

function parsearAdioffice(buffer, config = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headerRow = findHeaderRow(rows, ['GP', 'DESCRIPCIÓN', config.colPrecio || 'CC']);
  if (headerRow === -1) throw new Error('No se encontraron encabezados Adioffice');

  const headers = rows[headerRow];
  const iSku = findCol(headers, 'GP');
  const iNombre = findCol(headers, 'DESCRIPCIÓN');
  const iPrecio = findCol(headers, config.colPrecio || 'CC');
  const iUnidadesCaja = findCol(headers, 'U X CAJA');

  const productos = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = text(row[iSku]);
    const nombre = text(row[iNombre]);
    const costo = parsePrecio(row[iPrecio], { round: true });

    if (!sku || !nombre || costo == null) continue;
    if (norm(sku) === 'gp') continue;

    const unidadesCaja = parseUnidades(row[iUnidadesCaja]);
    productos.push(buildProduct({ sku, nombre, costo, unidadesCaja }));
  }

  return productos;
}

module.exports = { parsearAdioffice };
