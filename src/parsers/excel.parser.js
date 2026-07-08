const XLSX = require('xlsx');

/**
 * Parser genérico para archivos Excel.
 * El comportamiento se controla por la config del proveedor en DB.
 */
function parsearExcel(buffer, config) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const hojaIndex = typeof config.hoja === 'string'
    ? wb.SheetNames.indexOf(config.hoja)
    : (config.hoja ?? 0);
  if (hojaIndex === -1) throw new Error(`No se encontró la hoja "${config.hoja}" en el Excel`);
  const ws = wb.Sheets[wb.SheetNames[hojaIndex]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Normaliza: quita chars no-letra/dígito al inicio (ej: ´PRECIO → PRECIO), trim, lowercase
  const norm = s => String(s).replace(/^[^\p{L}\d]+/u, '').trim().toLowerCase();

  // Encontrar fila de header automáticamente (case-insensitive)
  let idxHeader = -1;
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    if (filas[i].some(c => norm(c) === norm(config.colSku))) { idxHeader = i; break; }
  }
  if (idxHeader === -1) {
    const primeras = filas.slice(0, 5).map(f => f.filter(Boolean).join(' | ')).join('\n');
    throw new Error(`No se encontró columna "${config.colSku}". Primeras filas:\n${primeras}`);
  }

  const headers = filas[idxHeader];
  const iSku           = headers.findIndex(h => norm(h) === norm(config.colSku));
  const iPrecio        = headers.findIndex(h => norm(h) === norm(config.colPrecio));
  const iNombre        = headers.findIndex(h => norm(h) === norm(config.colNombre));
  const iMarca         = config.colMarca         ? headers.findIndex(h => norm(h) === norm(config.colMarca))         : -1;
  const iBarras        = config.colBarras        ? headers.findIndex(h => norm(h) === norm(config.colBarras))        : -1;
  const iUnidadesCaja  = config.colUnidadesCaja  ? headers.findIndex(h => norm(h) === norm(config.colUnidadesCaja))  : -1;
  const iUnidadesPallet = config.colUnidadesPallet ? headers.findIndex(h => norm(h) === norm(config.colUnidadesPallet)) : -1;

  if (iPrecio === -1) throw new Error(`No se encontró columna "${config.colPrecio}". Headers encontrados: ${headers.filter(Boolean).join(', ')}`);

  const productos = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    const sku = String(f[iSku] || '').trim();
    if (!sku) continue;

    let costo = f[iPrecio];
    if (typeof costo === 'string') {
      costo = parseFloat(
        costo.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim()
      );
    }
    if (!costo || isNaN(costo) || costo <= 0) continue;

    // Aplicar IVA si el precio es neto
    if (!config.precioIncluyeIVA && config.factorIVA) {
      costo = costo * config.factorIVA;
    }

    const parseUnidades = v => { const n = parseInt(v); return n > 1 && n <= 10000 ? n : null; };
    const unidadesCaja   = iUnidadesCaja  >= 0 ? parseUnidades(f[iUnidadesCaja])  : null;
    const unidadesPallet = iUnidadesPallet >= 0 ? parseUnidades(f[iUnidadesPallet]) : null;

    productos.push({
      sku,
      nombre:        String(f[iNombre] || '').trim(),
      marca:         iMarca  >= 0 ? String(f[iMarca]  || '').trim() : null,
      barras:        iBarras >= 0 ? String(f[iBarras] || '').trim() : null,
      costo:         Math.round(costo),
      unidadesCaja,
      unidadesPallet,
      categoria:     unidadesCaja > 1 ? 'caja' : 'unidad',
    });
  }

  return productos;
}

module.exports = { parsearExcel };
