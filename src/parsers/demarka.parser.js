const XLSX = require('xlsx');

const HOJAS_SKIP = ['Lista', 'barra'];
const FACTOR_IVA = 1.19;

const norm = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^[^\p{L}\d]+/u, '')
  .trim()
  .toLowerCase();

function encontrarHeader(filas) {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const lower = filas[i].map(c => norm(String(c)));
    if (lower.includes(norm('CODIGO ADETEC')) && lower.includes(norm('PRECIO LISTA C/DSCT'))) {
      return i;
    }
  }
  return -1;
}

function parsearHoja(filas, nombreHoja) {
  const idxHeader = encontrarHeader(filas);
  if (idxHeader === -1) return [];

  const headers = filas[idxHeader].map(c => norm(String(c)));

  const iSku     = headers.findIndex(h => h === norm('CODIGO ADETEC'));
  const iNombre  = headers.findIndex(h => h === norm('DESCRIPCION'));
  const iPrecio  = headers.findIndex(h => h === norm('PRECIO LISTA C/DSCT'));
  const iCaja    = headers.findIndex(h => h === norm('UNID MIN DESPACHO'));
  const iPallet  = headers.findIndex(h => h === norm('CAJA MASTER'));

  if (iSku === -1 || iNombre === -1 || iPrecio === -1) return [];

  const productos = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f   = filas[i];
    const sku = String(f[iSku] || '').trim();
    if (!sku) continue;

    let costo = Number(String(f[iPrecio] || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
    if (!costo || isNaN(costo) || costo <= 0) continue;

    costo = Math.round(costo * FACTOR_IVA);

    const unidadesCaja   = iCaja   >= 0 ? (parseInt(f[iCaja],   10) || null) : null;
    const unidadesPallet = iPallet >= 0 ? (parseInt(f[iPallet], 10) || null) : null;

    productos.push({
      sku,
      nombre:        String(f[iNombre] || '').trim(),
      marca:         nombreHoja,
      categoria:     null,
      barras:        null,
      costo,
      unidadesCaja:   unidadesCaja   > 0 ? unidadesCaja   : null,
      unidadesPallet: unidadesPallet > 0 ? unidadesPallet : null,
    });
  }
  return productos;
}

function parsearDemarka(buffer) {
  const wb  = XLSX.read(buffer, { type: 'buffer' });
  const resultado = [];

  for (const nombre of wb.SheetNames) {
    if (HOJAS_SKIP.includes(nombre)) continue;
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '' });
    resultado.push(...parsearHoja(filas, nombre));
  }

  return resultado;
}

module.exports = { parsearDemarka };
