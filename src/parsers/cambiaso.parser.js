const XLSX = require('xlsx');

const HOJA_OBJETIVO = 'bolsas de aseo';

/**
 * Detecta la fila de encabezado buscando "código" + ("caja" o "unitario").
 * Devuelve { headerRow, iCodigo, iNombre, iPrecio } o null.
 * Regla: nombre está siempre en la columna inmediatamente anterior a "Caja".
 */
function detectarHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const lower = rows[i].map(c => String(c).toLowerCase().trim());
    const cIdx  = lower.findIndex(c => c === 'código');
    if (cIdx === -1) continue;
    const cajaIdx = lower.findIndex(c => c === 'caja');
    const unitIdx = lower.findIndex(c => c === 'unitario');
    const priceIdx = unitIdx !== -1 ? unitIdx : cajaIdx;
    if (priceIdx === -1 || cajaIdx === -1) continue;
    return { headerRow: i, iCodigo: cIdx, iNombre: cajaIdx - 1, iPrecio: priceIdx };
  }
  return null;
}

/**
 * Parser CAMBIASO.
 * Lee todas las hojas del .xlsx (excepto Hoja1, Hoja2, pdf).
 * Deduplicar por SKU: la hoja más reciente (mayor índice) sobrescribe.
 *
 * @param {Buffer} buffer
 * @returns {Array<{ sku, nombre, marca, barras, costo }>}
 */
function parsearCambiaso(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const mapa = new Map();

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().trim() !== HOJA_OBJETIVO) continue;

    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const info = detectarHeader(rows);
    if (!info) continue;

    const { headerRow, iCodigo, iNombre, iPrecio } = info;

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row       = rows[i];
      const codigoRaw = String(row[iCodigo] || '').trim();
      const nombre    = String(row[iNombre]  || '').trim();
      const precioRaw = row[iPrecio];

      const codigoNum = Number(codigoRaw);
      if (!codigoRaw || isNaN(codigoNum) || codigoNum <= 0) continue;

      const costo = parseFloat(String(precioRaw).replace(/[^\d.,]/g, '').replace(',', '.'));
      if (isNaN(costo) || costo <= 0) continue;

      mapa.set(codigoRaw, {
        sku:    codigoRaw.slice(0, 100),
        nombre: nombre.slice(0, 255),
        marca:  sheetName,
        barras: null,
        costo:  Math.round(costo),
      });
    }
  }

  const productos = Array.from(mapa.values());
  if (!productos.length) throw new Error('CAMBIASO: no se encontraron productos en el documento');
  return productos;
}

module.exports = { parsearCambiaso };
