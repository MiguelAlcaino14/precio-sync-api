const XLSX = require('xlsx');
const { buildProduct, findCol, findHeaderRow, norm, parsePrecio, parseUnidades, text } = require('./parser-utils');

function parsearMaxell(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const merges = ws['!merges'] || [];

  const headerRow = findHeaderRow(rows, ['COD', 'DESCRIPCIÓN', 'PRECIO NETO']);
  if (headerRow === -1) throw new Error('No se encontraron encabezados Maxell');

  const headers = rows[headerRow];
  const iSku = findCol(headers, 'COD');
  const iNombre = findCol(headers, 'DESCRIPCIÓN');
  const iBarras = findCol(headers, 'CÓDIGO DE BARRA');
  const iUnidadesCaja = findCol(headers, 'SUB MASTER');
  const iUnidadesPallet = findCol(headers, 'MASTER');
  const iPrecio = findCol(headers, 'PRECIO NETO');

  const productos = [];
  const skusVistos = new Set();

  for (let i = headerRow + 1; i < rows.length; i++) {
    const sku = text(valueAt(rows, merges, i, iSku));
    const nombre = text(valueAt(rows, merges, i, iNombre));
    const costo = parsePrecio(valueAt(rows, merges, i, iPrecio), { round: true });

    if (!sku || !nombre || costo == null || skusVistos.has(sku)) continue;
    if (norm(sku) === 'cod') continue;

    skusVistos.add(sku);
    productos.push(buildProduct({
      sku,
      nombre,
      costo,
      marca: 'MAXELL',
      barras: text(valueAt(rows, merges, i, iBarras)) || null,
      unidadesCaja: parseUnidades(valueAt(rows, merges, i, iUnidadesCaja)),
      unidadesPallet: parseUnidades(valueAt(rows, merges, i, iUnidadesPallet)),
    }));
  }

  return productos;
}

function valueAt(rows, merges, row, col) {
  if (col < 0) return '';
  const value = rows[row]?.[col];
  if (value !== '' && value != null) return value;

  const merge = merges.find(m =>
    row >= m.s.r && row <= m.e.r &&
    col >= m.s.c && col <= m.e.c
  );
  return merge ? rows[merge.s.r]?.[merge.s.c] : value;
}

module.exports = { parsearMaxell };
