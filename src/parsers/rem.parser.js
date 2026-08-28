const XLSX = require('xlsx');
const { buildProduct, findCol, findHeaderRow, norm, parsePrecio, parseUnidades, text } = require('./parser-utils');

function parsearRem(buffer, config = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const precioHeader = config.colPrecio || 'PRECIO CON DESCUENTO 20%';
  const headerRow = findHeaderRow(rows, ['Código', 'Descripción', precioHeader]);
  if (headerRow === -1) throw new Error('No se encontraron encabezados REM');

  const headers = rows[headerRow];
  const iSku = findCol(headers, 'Código');
  const iNombre = findCol(headers, 'Descripción');
  const iPrecio = findCol(headers, precioHeader);
  const iUnidadesCaja = findCol(headers, 'u/Pqte.');

  const productos = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = text(row[iSku]);
    const nombre = text(row[iNombre]);
    const costo = parsePrecio(row[iPrecio], { round: true });

    if (!sku || !nombre || costo == null) continue;
    if (norm(sku) === 'codigo' || /^familia:/i.test(sku)) continue;

    const unidadesCaja = parseUnidades(row[iUnidadesCaja]);
    productos.push(buildProduct({ sku, nombre, costo, unidadesCaja }));
  }

  return productos;
}

module.exports = { parsearRem };
