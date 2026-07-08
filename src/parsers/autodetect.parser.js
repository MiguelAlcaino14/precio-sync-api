const XLSX = require('xlsx');

const PATRONES_SKU    = ['codigo', 'cod', 'sku', 'item', 'gp', 'ref', 'referencia', 'material', 'art', 'id'];
const PATRONES_PRECIO = ['neto', 'precio', 'costo', 'valor', 'cc', 'tarifa', 'p.neto', 'pvp'];
const PATRONES_NOMBRE = ['descripcion', 'descripcion', 'glosa', 'nombre', 'articulo', 'producto', 'detalle', 'denominacion'];
const PATRONES_MARCA  = ['marca', 'fabricante', 'familia', 'superfamilia', 'categoria', 'linea', 'rubro'];
const PATRONES_BARRAS = ['ean', 'barras', 'barra', 'codebar', 'codigo barra', 'cb'];

const norm = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s.]/g, '').trim();

function matchScore(header, patrones) {
  const h = norm(header);
  for (const p of patrones) {
    if (h === p) return 3;
    if (h.startsWith(p) || h.endsWith(p)) return 2;
    if (h.includes(p)) return 1;
  }
  return 0;
}

function detectarIndices(headers) {
  const best = (patrones) => {
    let bestIdx = -1, bestScore = 0;
    headers.forEach((h, i) => {
      const s = matchScore(h, patrones);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return bestScore > 0 ? bestIdx : -1;
  };
  return {
    iSku:    best(PATRONES_SKU),
    iPrecio: best(PATRONES_PRECIO),
    iNombre: best(PATRONES_NOMBRE),
    iMarca:  best(PATRONES_MARCA),
    iBarras: best(PATRONES_BARRAS),
  };
}

function parsearAutodetect(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Encuentra la primera fila candidata a header (>= 3 celdas no vacías)
  let idxHeader = -1;
  let indices = null;
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const fila = filas[i].map(c => String(c).trim()).filter(Boolean);
    if (fila.length < 3) continue;
    const idx = detectarIndices(filas[i]);
    if (idx.iSku >= 0 && idx.iPrecio >= 0) {
      idxHeader = i;
      indices = idx;
      break;
    }
  }

  if (!indices || idxHeader === -1) {
    const encabezados = filas.slice(0, 5).map(f => f.filter(Boolean).join(' | ')).join('\n');
    throw new Error(`Auto-detección no encontró columnas de SKU y Precio. Primeras filas:\n${encabezados}`);
  }

  const { iSku, iPrecio, iNombre, iMarca, iBarras } = indices;
  const productos = [];

  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    const sku = String(f[iSku] || '').trim();
    if (!sku || sku.length > 100) continue;

    let costo = f[iPrecio];
    if (typeof costo === 'string') {
      costo = parseFloat(costo.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim());
    }
    if (!costo || isNaN(costo) || costo <= 0) continue;

    productos.push({
      sku,
      nombre:        iNombre >= 0 ? String(f[iNombre] || '').trim().slice(0, 500) : '',
      marca:         iMarca  >= 0 ? String(f[iMarca]  || '').trim().slice(0, 100) || null : null,
      barras:        iBarras >= 0 ? String(f[iBarras] || '').trim() || null : null,
      costo:         Math.round(costo),
      unidadesCaja:  null,
      unidadesPallet: null,
      categoria:     'unidad',
    });
  }

  return productos;
}

module.exports = { parsearAutodetect };
