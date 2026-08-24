const XLSX = require('xlsx');

const norm = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim()
  .toLowerCase();

function esHeaderRow(fila) {
  const normed = fila.map(norm);
  return normed.includes('sku') && normed.some(c => c.includes('costo actual'));
}

function mapearColumnas(fila) {
  const normed = fila.map(norm);
  return {
    iSku:    normed.findIndex(c => c === 'sku'),
    iNombre: normed.findIndex(c => c === 'producto'),
    iPrecio: normed.findIndex(c => c.includes('costo actual')),
    iCaja:   normed.findIndex(c =>
      c.includes('rollos por caja') ||
      c.includes('unidades por caja') ||
      c.includes('cantidad minima')
    ),
    iPallet: normed.findIndex(c => c.includes('cajas por pallet')),
  };
}

const parseUnidades = v => { const n = parseInt(v); return n > 1 && n <= 10000 ? n : null; };

/**
 * Parser ChilenaMayorista.
 * El Excel tiene múltiples secciones (resmas, bolsas, tissue, etc.),
 * cada una con su propio header row y columnas de unidades distintas.
 * Detecta cada header row y procesa la sección correspondiente.
 */
function parsearChilena(buffer) {
  const wb    = XLSX.read(buffer, { type: 'buffer' });
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const mapa    = new Map();
  let seccion   = null;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];

    if (esHeaderRow(fila)) {
      seccion = mapearColumnas(fila);
      continue;
    }

    if (!seccion) continue;

    const { iSku, iNombre, iPrecio, iCaja, iPallet } = seccion;

    const skuRaw = String(fila[iSku] || '').trim();
    if (!skuRaw) continue;

    const costoRaw = fila[iPrecio];
    const costoNum = parseFloat(String(costoRaw).replace(/[^\d.,]/g, '').replace(',', '.'));
    const costo    = (!isNaN(costoNum) && costoNum > 0) ? costoNum : null;

    const nombre = String(fila[iNombre] || '').trim();

    mapa.set(skuRaw, {
      sku:            skuRaw.slice(0, 100),
      nombre:         nombre.slice(0, 255),
      marca:          null,
      barras:         null,
      costo:          costo,
      unidadesCaja:   iCaja   >= 0 ? parseUnidades(fila[iCaja])   : null,
      unidadesPallet: iPallet >= 0 ? parseUnidades(fila[iPallet]) : null,
    });
  }

  const productos = Array.from(mapa.values());
  if (!productos.length) throw new Error('ChilenaMayorista: no se encontraron productos en el archivo');
  return productos;
}

module.exports = { parsearChilena };
