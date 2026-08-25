const XLSX = require('xlsx');

// Retorna true si el valor de celda es un error de fórmula Excel (no un precio 0 real)
function esCeldaError(v) {
  return typeof v === 'string' && /^(#|ERROR)/i.test(v.trim());
}

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

  // Paso 1: pre-escanear Libreria — sus precios de licitación tienen prioridad
  const preciosLiberia = new Map(); // sku → { precio, nombre, marca, unidadesCaja }
  const ws2 = wb.Sheets['Libreria'];
  if (ws2) {
    const filas = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
    for (let i = 2; i < filas.length; i++) {
      const r      = filas[i];
      const sku    = String(r[2] || '').trim();
      const nombre = String(r[3] || '').trim().replace(/^[\s*]+/, '');
      if (!sku || !nombre) continue;
      const rawLicit = r[13];
      const rawNeto  = r[12];
      const licit    = esCeldaError(rawLicit) ? 0 : (Number(rawLicit) || 0);
      const neto     = esCeldaError(rawNeto)  ? 0 : (Number(rawNeto)  || 0);
      const precio   = licit > 0 ? licit : neto;
      const hayError = esCeldaError(rawLicit) || esCeldaError(rawNeto);
      if (!hayError && precio <= 0) continue;
      preciosLiberia.set(sku, {
        precio:        precio > 0 ? precio : null,
        nombre,
        marca:         String(r[1] || '').trim() || null,
        unidadesCaja:  Number(r[4]) > 0 ? Number(r[4]) : null,
      });
    }
  }

  // Paso 2: Hoja1 — precio de Libreria (P.LICITACIÓN) toma prioridad cuando existe
  const ws1 = wb.Sheets['Hoja1'];
  if (ws1) {
    const filas = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
    for (let i = 2; i < filas.length; i++) {
      const r      = filas[i];
      const sku    = String(r[4] || '').trim();
      const nombre = String(r[5] || '').trim().replace(/^[\s*]+/, '');
      if (!sku || !nombre) continue;

      let costo;
      const lib = preciosLiberia.get(sku);
      if (lib && lib.precio != null) {
        // Libreria tiene P.LICITACIÓN válido — usarlo
        costo = lib.precio;
      } else {
        const rawLicit = r[11];
        const rawNeto  = r[10];
        const licit    = esCeldaError(rawLicit) ? 0 : (Number(rawLicit) || 0);
        const neto     = esCeldaError(rawNeto)  ? 0 : (Number(rawNeto)  || 0);
        const precio   = licit > 0 ? licit : neto;
        const hayError = esCeldaError(rawLicit) || esCeldaError(rawNeto);
        if (!hayError && precio <= 0) continue;
        costo = precio > 0 ? precio : null;
      }

      skusVistos.add(sku);
      productos.push({ sku, nombre, costo, marca: String(r[2] || '').trim() || null, unidadesCaja: Number(r[7]) > 0 ? Number(r[7]) : null });
    }
  }

  // Paso 3: productos únicos de Libreria (no presentes en Hoja1)
  for (const [sku, entry] of preciosLiberia) {
    if (skusVistos.has(sku)) continue;
    skusVistos.add(sku);
    productos.push({ sku, nombre: entry.nombre, costo: entry.precio, marca: entry.marca, unidadesCaja: entry.unidadesCaja });
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
      const rawLicit  = licitCol != null ? r[licitCol] : null;
      const rawPrecio = r[precioCol];
      const licit     = rawLicit  && !esCeldaError(rawLicit)  ? (Number(rawLicit)  || 0) : 0;
      const precioVal = rawPrecio && !esCeldaError(rawPrecio) ? (Number(rawPrecio) || 0) : 0;
      const precio    = licit > 0 ? licit : precioVal;
      const hayError  = esCeldaError(rawLicit) || esCeldaError(rawPrecio);
      if (!sku || skusVistos.has(sku) || !nombre) continue;
      if (!hayError && precio <= 0) continue;
      skusVistos.add(sku);
      productos.push({ sku, nombre, costo: precio > 0 ? precio : null, marca: null, unidadesCaja: Number(r[ldvCol]) > 0 ? Number(r[ldvCol]) : null });
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
