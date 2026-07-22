const XLSX = require('xlsx');

// Estructura CHIPRO (LISTA SANTIAGO):
//   Fila ~6  → DESCRIPCION [0], CODIGO [1], UNIDAD de CUENTA [2], Contenido caja maestra [3]
//   Fila ~11 → "Crédito" en alguna columna (precio que usamos), "Prepago" en col siguiente
//   Datos    → primera fila donde col 0 tiene texto y la col de precio tiene número

function parsearChipro(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const resultado = [];
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '' });
    resultado.push(...parsearHoja(filas, nombre));
  }
  return resultado;
}

function parsearHoja(filas, nombreHoja) {
  const norm = s => String(s).trim().toLowerCase();

  // 1. Encontrar col de precio buscando "crédito" en cualquier fila
  let iPrecio = -1;
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    const idx = filas[i].findIndex(c => norm(c).replace(/[áéíóú]/g, m => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'}[m])) === 'credito');
    if (idx >= 0) { iPrecio = idx; break; }
  }
  if (iPrecio === -1) {
    console.log(`[chipro] ${nombreHoja}: no se encontró columna "Crédito"`);
    return [];
  }

  // 2. Encontrar fila con DESCRIPCION → obtener iNombre, iSku, iCaja, iPallet
  let iNombre = 0, iSku = 1, iCaja = 2, iPallet = 3;
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    if (filas[i].some(c => norm(c).includes('descripcion') || norm(c).includes('descripción'))) {
      const row = filas[i];
      iNombre  = row.findIndex(c => norm(c).includes('descripci'));
      const iCod = row.findIndex(c => /^cod/i.test(norm(c)));
      if (iCod >= 0) iSku = iCod;
      const iUn = row.findIndex(c => norm(c).includes('unidad') || norm(c).includes('unid'));
      if (iUn >= 0) iCaja = iUn;
      const iCM = row.findIndex(c => norm(c).includes('caja maestra') || norm(c).includes('contenido'));
      if (iCM >= 0) iPallet = iCM;
      break;
    }
  }

  // 3. Encontrar primera fila de datos: col 0 no vacía + precio numérico
  let dataStart = -1;
  for (let i = 0; i < filas.length; i++) {
    const precio = Number(filas[i][iPrecio]);
    if (precio > 0 && String(filas[i][iNombre] || '').trim()) {
      dataStart = i;
      break;
    }
  }

  if (dataStart === -1) {
    console.log(`[chipro] ${nombreHoja}: no se encontró fila de datos`);
    return [];
  }

  console.log(`[chipro] ${nombreHoja}: iPrecio=${iPrecio} iNombre=${iNombre} iSku=${iSku} iCaja=${iCaja} iPallet=${iPallet} dataStart=${dataStart}`);

  const productos = [];
  for (let i = dataStart; i < filas.length; i++) {
    const f      = filas[i];
    const nombre = String(f[iNombre] || '').trim();
    const sku    = String(f[iSku]    || '').trim();
    if (!nombre || !sku) continue;

    const costo = Math.round(Number(f[iPrecio]) || 0);
    if (!costo || costo <= 0) continue;

    const unidadesCaja   = parseInt(f[iCaja],   10) || null;
    const unidadesPallet = parseInt(f[iPallet], 10) || null;

    productos.push({
      sku,
      nombre,
      marca:          null,
      categoria:      null,
      barras:         null,
      costo,
      unidadesCaja:   unidadesCaja   > 0 ? unidadesCaja   : null,
      unidadesPallet: unidadesPallet > 0 ? unidadesPallet : null,
    });
  }

  return productos;
}

module.exports = { parsearChipro };
