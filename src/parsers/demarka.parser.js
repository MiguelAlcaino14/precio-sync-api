const XLSX = require('xlsx');

const HOJAS_SKIP = ['Lista', 'barra'];

const norm = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim()
  .toLowerCase();

function encontrarHeader(filas) {
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const lower = filas[i].map(c => norm(String(c)));
    if (lower.some(h => h.includes('codigo adetec'))) return i;
  }
  return -1;
}

function parsearHoja(filas, nombreHoja) {
  const idxHeader = encontrarHeader(filas);
  if (idxHeader === -1) {
    console.log(`[demarka] ${nombreHoja}: no se encontró fila de headers`);
    return [];
  }

  const headers = filas[idxHeader].map(c => norm(String(c)));
  console.log(`[demarka] ${nombreHoja}: headers encontrados en fila ${idxHeader}:`, headers.filter(Boolean));

  const iSku    = headers.findIndex(h => h.includes('codigo adetec'));
  const iNombre = headers.findIndex(h => h.includes('descripcion'));
  // Preferir columna con descuento (contiene 'dsct'), si no la última que contenga 'lista'
  const iDsct   = headers.findIndex(h => h.includes('lista') && h.includes('dsct'));
  const iListas = headers.reduce((acc, h, i) => { if (h.includes('lista')) acc.push(i); return acc; }, []);
  const iPrecio = iDsct !== -1 ? iDsct : (iListas.length > 0 ? iListas[iListas.length - 1] : -1);
  const iCaja   = headers.findIndex(h => h.includes('unid min'));
  const iPallet = headers.findIndex(h => h.includes('caja master'));

  console.log(`[demarka] ${nombreHoja}: iSku=${iSku} iNombre=${iNombre} iPrecio=${iPrecio}(dsct=${iDsct}) iCaja=${iCaja} iPallet=${iPallet}`);

  if (iSku === -1 || iNombre === -1 || iPrecio === -1) return [];

  const productos = [];
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f   = filas[i];
    const sku = String(f[iSku] || '').trim();
    if (!sku) continue;

    let costo = Number(String(f[iPrecio] || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
    if (!costo || isNaN(costo) || costo <= 0) continue;

    costo = Math.round(costo);

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
