const XLSX = require('xlsx');

/**
 * Parser Libesa — detecta automáticamente el formato según hojas presentes.
 *
 * Formato A ("LP LIBESA LICITACIONES..."):
 *   Hoja "Hoja1" (principal): col4=SKU, col5=Nombre, col2=Marca, col7=LDV
 *     Precio: col11(LICITACIONES) si >0, sino col10(Precio Neto). Headers fila 1.
 *   Hoja "Libreria" (complemento ~7 prods): col2=SKU, col3=Nombre, col1=Marca, col4=LDV
 *     Precio: col13(P.LICITACIÓN) si >0, sino col12(P.NETO ANTERIOR). Headers fila 1.
 *
 * Formato B ("PLANILLA ACTUALIZADA CON STOCK..."):
 *   Hoja "GENERAL 2024 - 2025": col1=SKU, col2=Nombre, col3=LDV, col7=Licit si >0 else col4=Precio
 *   Hoja "NUEVO HOGAR":         col1=SKU, col2=Nombre, col3=LDV, col4=Precio
 *   Hoja "SALDOS COLECCIONES":  col0=SKU, col1=Nombre, col2=LDV, col3=Precio
 *   Hoja "CD FSC":              col0=SKU, col1=Nombre, col2=LDV, col3=Precio
 */
function parsearLibesa(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  if (wb.Sheets['Hoja1'] || wb.Sheets['Libreria']) {
    return parsearFormatoA(wb);
  }
  return parsearFormatoB(wb);
}

// ── Formato A ─────────────────────────────────────────────────────────────────
function parsearFormatoA(wb) {
  const productos  = [];
  const skusVistos = new Set();

  const ws1 = wb.Sheets['Hoja1'];
  if (ws1) {
    const filas = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
    for (let i = 2; i < filas.length; i++) {
      const r      = filas[i];
      const sku    = String(r[4] || '').trim();
      const nombre = String(r[5] || '').trim().replace(/^[\s*]+/, '');
      const licit  = Number(r[11]) || 0;
      const neto   = Number(r[10]) || 0;
      const precio = licit > 0 ? licit : neto;
      if (!sku || !nombre || precio <= 0) continue;
      skusVistos.add(sku);
      productos.push({ sku, nombre, costo: Math.round(precio), marca: String(r[2] || '').trim() || null, unidadesCaja: Number(r[7]) > 0 ? Number(r[7]) : null });
    }
  }

  const ws2 = wb.Sheets['Libreria'];
  if (ws2) {
    const filas = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
    for (let i = 2; i < filas.length; i++) {
      const r      = filas[i];
      const sku    = String(r[2] || '').trim();
      const nombre = String(r[3] || '').trim().replace(/^[\s*]+/, '');
      const licit  = Number(r[13]) || 0;
      const neto   = Number(r[12]) || 0;
      const precio = licit > 0 ? licit : neto;
      if (!sku || skusVistos.has(sku) || !nombre || precio <= 0) continue;
      skusVistos.add(sku);
      productos.push({ sku, nombre, costo: Math.round(precio), marca: String(r[1] || '').trim() || null, unidadesCaja: Number(r[4]) > 0 ? Number(r[4]) : null });
    }
  }

  console.log(`[libesa-A] ${productos.length} productos parseados`);
  return productos;
}

// ── Formato B ─────────────────────────────────────────────────────────────────
function parsearFormatoB(wb) {
  const productos  = [];
  const skusVistos = new Set();

  console.log(`[libesa-B] hojas disponibles: ${wb.SheetNames.join(', ')}`);

  // Busca hoja cuyo nombre contenga la keyword (case-insensitive)
  function hoja(keyword) {
    const nombre = wb.SheetNames.find(n => n.toUpperCase().includes(keyword.toUpperCase()));
    return nombre ? wb.Sheets[nombre] : null;
  }

  function agregarHoja(ws, { skuCol, nombreCol, ldvCol, precioCol, licitCol, headerFila }) {
    if (!ws) return;
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let i = headerFila + 1; i < filas.length; i++) {
      const r      = filas[i];
      const sku    = String(r[skuCol]    || '').trim();
      const nombre = String(r[nombreCol] || '').trim().replace(/^[\s*]+/, '');
      const licit  = licitCol != null ? (Number(r[licitCol]) || 0) : 0;
      const precio = licit > 0 ? licit : (Number(r[precioCol]) || 0);
      if (!sku || skusVistos.has(sku) || !nombre || precio <= 0) continue;
      skusVistos.add(sku);
      productos.push({ sku, nombre, costo: Math.round(precio), marca: null, unidadesCaja: Number(r[ldvCol]) > 0 ? Number(r[ldvCol]) : null });
    }
  }

  agregarHoja(hoja('GENERAL'),    { skuCol: 1, nombreCol: 2, ldvCol: 3, precioCol: 4, licitCol: 7, headerFila: 0 });
  agregarHoja(hoja('HOGAR'),      { skuCol: 1, nombreCol: 2, ldvCol: 3, precioCol: 4, licitCol: null, headerFila: 0 });
  agregarHoja(hoja('SALDOS'),     { skuCol: 0, nombreCol: 1, ldvCol: 2, precioCol: 3, licitCol: null, headerFila: 0 });
  agregarHoja(hoja('FSC'),        { skuCol: 0, nombreCol: 1, ldvCol: 2, precioCol: 3, licitCol: null, headerFila: 0 });

  console.log(`[libesa-B] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearLibesa };
