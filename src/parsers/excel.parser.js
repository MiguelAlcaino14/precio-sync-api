const XLSX = require('xlsx');

/**
 * Parser genérico para archivos Excel.
 * El comportamiento se controla por la config del proveedor en DB.
 */
function parsearExcel(buffer, config) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const hojaIndex = typeof config.hoja === 'number' ? config.hoja : 0;
  const ws = wb.Sheets[wb.SheetNames[hojaIndex]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Encontrar fila de header automáticamente
  let idxHeader = -1;
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    if (filas[i].includes(config.colSku)) { idxHeader = i; break; }
  }
  if (idxHeader === -1) throw new Error(`No se encontró columna "${config.colSku}" en el Excel`);

  const headers = filas[idxHeader];
  const iSku    = headers.indexOf(config.colSku);
  const iPrecio = headers.indexOf(config.colPrecio);
  const iNombre = headers.indexOf(config.colNombre);
  const iMarca  = config.colMarca  ? headers.indexOf(config.colMarca)  : -1;
  const iBarras = config.colBarras ? headers.indexOf(config.colBarras) : -1;

  if (iPrecio === -1) throw new Error(`No se encontró columna "${config.colPrecio}" en el Excel`);

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

    productos.push({
      sku,
      nombre:  String(f[iNombre] || '').trim(),
      marca:   iMarca  >= 0 ? String(f[iMarca]  || '').trim() : null,
      barras:  iBarras >= 0 ? String(f[iBarras] || '').trim() : null,
      costo:   Math.round(costo),
    });
  }

  return productos;
}

module.exports = { parsearExcel };
