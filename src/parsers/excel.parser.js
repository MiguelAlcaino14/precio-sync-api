const XLSX = require('xlsx');

// Normaliza: strip tildes, quita chars no-letra/dígito al inicio, trim, lowercase
// Permite que CÓDIGO === CODIGO, DESCRIPCIÓN === DESCRIPCION, etc.
const norm = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^[^\p{L}\d]+/u, '')
  .trim()
  .toLowerCase();

/**
 * Parser genérico para archivos Excel.
 * Soporta múltiples formatos vía config.configs (array): prueba cada uno en orden
 * hasta que uno funcione. Si falla con "No se encontró columna", intenta el siguiente.
 */
function parsearExcel(buffer, config) {
  if (Array.isArray(config.configs)) {
    let lastError;
    for (const cfg of config.configs) {
      try {
        return parsearExcelConConfig(buffer, cfg);
      } catch (e) {
        lastError = e;
        if (!e.message.startsWith('No se encontró columna') &&
            !e.message.startsWith('No se encontró la hoja')) throw e;
      }
    }
    throw lastError;
  }
  return parsearExcelConConfig(buffer, config);
}

// Busca en las primeras 15 filas la que contiene el header con colSku. -1 si no está.
function encontrarHeader(filas, colSku) {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    if (filas[i].some(c => norm(c) === norm(colSku))) return i;
  }
  return -1;
}

function parsearExcelConConfig(buffer, config) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  let filas, idxHeader;
  if (config.hoja === 'auto') {
    // Buscar en TODAS las hojas la primera que contenga la columna colSku
    // (útil cuando el nombre de la hoja de precios varía, ej: Devoto "JUEVES 02-04")
    for (const name of wb.SheetNames) {
      const f = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
      const idx = encontrarHeader(f, config.colSku);
      if (idx !== -1) { filas = f; idxHeader = idx; break; }
    }
    if (!filas) throw new Error(`No se encontró columna "${config.colSku}" en ninguna hoja del Excel`);
  } else {
    const hojaIndex = typeof config.hoja === 'string'
      ? wb.SheetNames.indexOf(config.hoja)
      : (config.hoja ?? 0);
    if (hojaIndex === -1) throw new Error(`No se encontró la hoja "${config.hoja}" en el Excel`);
    filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[hojaIndex]], { header: 1, defval: '' });
    idxHeader = encontrarHeader(filas, config.colSku);
    if (idxHeader === -1) {
      const primeras = filas.slice(0, 5).map(f => f.filter(Boolean).join(' | ')).join('\n');
      throw new Error(`No se encontró columna "${config.colSku}". Primeras filas:\n${primeras}`);
    }
  }

  const headers = filas[idxHeader];
  const iSku           = headers.findIndex(h => norm(h) === norm(config.colSku));
  const iNombre        = headers.findIndex(h => norm(h) === norm(config.colNombre));
  const iMarca         = config.colMarca         ? headers.findIndex(h => norm(h) === norm(config.colMarca))         : -1;
  const iBarras        = config.colBarras        ? headers.findIndex(h => norm(h) === norm(config.colBarras))        : -1;
  const iUnidadesCaja  = config.colUnidadesCaja  ? headers.findIndex(h => norm(h) === norm(config.colUnidadesCaja))  : -1;
  const iUnidadesPallet = config.colUnidadesPallet ? headers.findIndex(h => norm(h) === norm(config.colUnidadesPallet)) : -1;

  // colPrecio puede ser string o array (intenta en orden, ej: ['Precio Licitación', 'Precio Neto'])
  const precioOpciones = Array.isArray(config.colPrecio) ? config.colPrecio : [config.colPrecio];
  let iPrecio = -1;
  for (const col of precioOpciones) {
    const idx = headers.findIndex(h => norm(h) === norm(col));
    if (idx !== -1) { iPrecio = idx; break; }
  }

  if (iPrecio === -1) throw new Error(`No se encontró columna "${precioOpciones.join('" / "')}". Headers encontrados: ${headers.filter(Boolean).join(', ')}`);

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
      costo:         Math.ceil(costo / 10) * 10,
      unidadesCaja,
      unidadesPallet,
      categoria:     unidadesCaja > 1 ? 'caja' : 'unidad',
    });
  }

  return productos;
}

module.exports = { parsearExcel };
