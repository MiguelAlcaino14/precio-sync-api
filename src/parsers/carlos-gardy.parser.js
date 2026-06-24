const XLSX = require('xlsx');

/**
 * Normaliza un string para comparación: minúsculas, espacios colapsados, sin puntuación extra.
 */
function normalizar(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Parser para CARLOS GARDY.
 *
 * Hoja1 "Lista de Precios ": col0=nombre genérico, col2=costo neto con 10% descuento.
 * Hoja2 "Listado de códigos": col0=SKU, col1=descripción completa (nombre+variante).
 *
 * Cross-reference: el nombre de hoja2 comienza con el nombre de hoja1 como prefijo.
 * Retorna una entrada por cada SKU de hoja2 que tenga match en hoja1.
 *
 * @param {Buffer} buffer
 * @returns {Array<{ sku, nombre, marca, barras, costo }>}
 */
function parsearCarlosGardy(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // ── Hoja 1: precios ──────────────────────────────────────────────────────────
  const wsPrecios = wb.Sheets[wb.SheetNames[0]];
  const rowsPrecios = XLSX.utils.sheet_to_json(wsPrecios, { header: 1, defval: '' });

  // { nombreNorm → costo }
  const mapaPrecios = new Map();

  // Fila 0 = headers, fila 1+ = datos
  for (let i = 1; i < rowsPrecios.length; i++) {
    const row = rowsPrecios[i];
    const nombre = String(row[0] || '').trim();
    if (!nombre) continue;

    const rawCosto = row[2]; // col2 = costo con 10% descuento
    const costo = parseFloat(String(rawCosto).replace(/,/g, '.'));
    if (!costo || isNaN(costo) || costo <= 0) continue;

    mapaPrecios.set(normalizar(nombre), { nombre, costo: Math.round(costo) });
  }

  // Ordenar las claves de mayor a menor longitud para que el prefijo más largo tenga prioridad
  const clavesPrecios = [...mapaPrecios.keys()].sort((a, b) => b.length - a.length);

  // ── Hoja 2: SKUs ─────────────────────────────────────────────────────────────
  const wsCodigos = wb.Sheets[wb.SheetNames[1]];
  const rowsCodigos = XLSX.utils.sheet_to_json(wsCodigos, { header: 1, defval: '' });

  const resultado = [];

  // Fila 0 = headers, fila 1+ = datos
  for (let i = 1; i < rowsCodigos.length; i++) {
    const row = rowsCodigos[i];
    const sku = String(row[0] || '').trim();
    const nombreCompleto = String(row[1] || '').trim();

    if (!sku || !nombreCompleto) continue;

    const nombreNorm = normalizar(nombreCompleto);

    // Buscar el prefijo más largo que coincida en hoja1
    let match = null;
    for (const clave of clavesPrecios) {
      if (nombreNorm.startsWith(clave)) {
        match = mapaPrecios.get(clave);
        break;
      }
    }

    if (!match) continue;

    resultado.push({
      sku:    sku.slice(0, 100),
      nombre: nombreCompleto.slice(0, 255),
      marca:  'Carlos Gardy',
      barras: null,
      costo:  match.costo,
    });
  }

  return resultado;
}

module.exports = { parsearCarlosGardy };
