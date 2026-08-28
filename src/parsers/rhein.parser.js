const XLSX = require('xlsx');
const { buildProduct, findCol, findHeaderRow, parsePrecio, parseUnidades, text } = require('./parser-utils');

const PRICE_HEADERS = ['C Y A', 'COSTO C Y A', 'COSTO CYA'];

function parsearRhein(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const productos = [];
  const skusVistos = new Set();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headerRow = findHeaderRow(rows, ['COD', 'DESCRIPCIÓN', PRICE_HEADERS]);
    if (headerRow === -1) continue;

    const headers = rows[headerRow];
    const iSku = findCol(headers, 'COD');
    const iNombre = findCol(headers, 'DESCRIPCIÓN');
    const iPrecio = findCol(headers, PRICE_HEADERS);
    const iMarca = findCol(headers, 'MARCA');
    const iBarras = findCol(headers, 'BARRAS');
    const iUnidadesCaja = findCol(headers, 'SUB');
    const iUnidadesPallet = findCol(headers, 'EMB');

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const sku = text(row[iSku]);
      const nombre = text(row[iNombre]);
      const costo = parsePrecio(row[iPrecio], { round: true });

      if (!sku || !nombre || costo == null || skusVistos.has(sku)) continue;

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

module.exports = { parsearRhein };
