const XLSX = require('xlsx');

/**
 * Parser Libesa — LP LIBESA LICITACIONES 2024-2026
 *
 * Hoja1 (fuente principal, 1491 productos):
 *   col4=Código(SKU), col5=Descripción, col2=Marca, col7=Lote Venta
 *   Precio: col11 (LICITACIONES) si >0, sino col10 (Precio Neto)
 *   Headers en fila 1, datos desde fila 2.
 *
 * Librería (complemento, ~7 productos no presentes en Hoja1):
 *   col2=SKU, col3=Descripción, col1=Marca, col4=Lote Venta
 *   Precio: col12 (P.NETO ANTERIOR) si >0, sino col13 (P.LICITACIÓN)
 *   Headers en fila 1, datos desde fila 2.
 */
function parsearLibesa(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const productos = [];
  const skusVistos = new Set();

  // ── Hoja1 ──────────────────────────────────────────────────────────────────
  const ws1 = wb.Sheets['Hoja1'];
  if (ws1) {
    const filas = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
    for (let i = 2; i < filas.length; i++) {
      const r   = filas[i];
      const sku = String(r[4] || '').trim();
      if (!sku) continue;

      const precioLicit = Number(r[11]) || 0;
      const precioNeto  = Number(r[10]) || 0;
      const precio      = precioLicit > 0 ? precioLicit : precioNeto;
      if (precio <= 0) continue;

      const nombre = String(r[5] || '').trim().replace(/^[\s*]+/, '');
      if (!nombre) continue;

      skusVistos.add(sku);
      productos.push({
        sku,
        nombre,
        costo:        Math.round(precio),
        marca:        String(r[2] || '').trim() || null,
        unidadesCaja: Number(r[7]) > 0 ? Number(r[7]) : null,
      });
    }
  }

  // ── Librería (productos adicionales no en Hoja1) ───────────────────────────
  const ws2 = wb.Sheets['Libreria'];
  if (ws2) {
    const filas = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
    for (let i = 2; i < filas.length; i++) {
      const r   = filas[i];
      const sku = String(r[2] || '').trim();
      if (!sku || skusVistos.has(sku)) continue;

      const precioLicit = Number(r[13]) || 0;
      const precioNeto  = Number(r[12]) || 0;
      const precio      = precioLicit > 0 ? precioLicit : precioNeto;
      if (precio <= 0) continue;

      const nombre = String(r[3] || '').trim().replace(/^[\s*]+/, '');
      if (!nombre) continue;

      skusVistos.add(sku);
      productos.push({
        sku,
        nombre,
        costo:        Math.round(precio),
        marca:        String(r[1] || '').trim() || null,
        unidadesCaja: Number(r[4]) > 0 ? Number(r[4]) : null,
      });
    }
  }

  console.log(`[libesa] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearLibesa };
