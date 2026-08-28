const XLSX = require('xlsx');
const { buildProduct, findCol, findHeaderRow, norm, parsePrecio, parseUnidades, text } = require('./parser-utils');

function parsearTeknofas(buffer, config = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = config.hoja && wb.Sheets[config.hoja] ? config.hoja : 'Lista de Precios';
  const ws = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const headerRow = findHeaderRow(rows, ['CODIGO', 'DESCRIPCION', config.colPrecio || 'Precio unit.']);
  if (headerRow === -1) throw new Error('No se encontraron encabezados Teknofas');

  const headers = rows[headerRow];
  const iSku = findCol(headers, 'CODIGO');
  const iNombre = findCol(headers, 'DESCRIPCION');
  const iPrecio = findCol(headers, config.colPrecio || 'Precio unit.');
  const iUnidadesCaja = findCol(headers, 'UNID X CAJA');

  const productos = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = text(row[iSku]);
    const nombre = text(row[iNombre]);
    const costo = parsePrecio(row[iPrecio]);

    if (!sku || !nombre || costo == null) continue;
    if (norm(sku) === 'codigo') continue;

    const unidadesCaja = parseUnidades(row[iUnidadesCaja]);
    productos.push(buildProduct({ sku, nombre, costo, unidadesCaja }));
  }

  return productos;
}

module.exports = { parsearTeknofas };
