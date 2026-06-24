const XLSX = require('xlsx');

/**
 * Parsea un valor de precio que puede tener comas o puntos como separadores.
 * Retorna NaN si no es parseable como número positivo.
 */
function parsePrecio(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  // Si ya es número (celda numérica de Excel) úsalo directo
  if (typeof raw === 'number') return raw;
  // String: quitar signos de moneda y separadores de miles con coma, dejar punto decimal
  const limpio = String(raw)
    .replace(/[$\s]/g, '')
    .replace(/,/g, ''); // quitar comas (separador miles)
  return parseFloat(limpio);
}

/**
 * Parser para ACCO BRAND.
 *
 * Hoja "LP Febrero" (primera hoja):
 * - Filas 0-9: metadata
 * - Fila 10 (índice 10): headers
 * - Fila 11+: datos
 *
 * Columnas (0-based):
 *  0  CATEGORIA
 *  1  CÓDIGO ACCO  → SKU
 *  3  MARCA
 *  4  STATUS       → filtrar "VIGENTE"
 *  6  DESCRIPCIÓN PRODUCTO → nombre
 *  8  UNIDADES POR CAJA VL → unidadesCaja
 * 19  NETO FINAL (30%+10%) → precio
 *
 * @param {Buffer} buffer
 * @returns {Array<{ sku, nombre, marca, barras, costo }>}
 */
function parsearAccoBrand(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const resultado = [];
  const HEADER_ROW = 10; // índice 0-based
  const DATA_START = 11;

  for (let i = DATA_START; i < rows.length; i++) {
    const row = rows[i];

    const sku    = String(row[1] || '').trim();
    const status = String(row[4] || '').trim().toUpperCase();
    const nombre = String(row[6] || '').trim();
    const marca  = String(row[3] || '').trim();
    const rawCaja = row[8];
    const rawPrecio = row[19];

    // Filtros de validez
    if (!sku) continue;
    if (status !== 'VIGENTE') continue;
    if (!nombre) continue;

    const costo = parsePrecio(rawPrecio);
    if (isNaN(costo) || costo <= 0) continue;

    const unidadesCajaNum = parseInt(String(rawCaja).replace(/[^0-9]/g, ''), 10);
    const unidadesCaja = isNaN(unidadesCajaNum) || unidadesCajaNum <= 0 ? null : unidadesCajaNum;

    resultado.push({
      sku:    sku.slice(0, 100),
      nombre: nombre.slice(0, 255),
      marca:  marca.slice(0, 100) || 'ACCO Brand',
      barras: null,
      costo:  Math.round(costo),
      // unidadesCaja se retorna como campo extra; el servicio de importación lo ignora si no lo necesita
      unidadesCaja,
    });
  }

  return resultado;
}

module.exports = { parsearAccoBrand };
