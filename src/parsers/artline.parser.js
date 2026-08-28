const XLSX = require('xlsx');

const HOJAS = ['SETS DE REGALO', 'LIBROS', 'IMPULSIVOS', 'FILGO', 'ARTLINE', 'MOOVING', 'WERO'];

const norm = s => String(s || '').trim();

function parsearArtline(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const productos = [];

  for (const nombre of HOJAS) {
    const ws = wb.Sheets[nombre];
    if (!ws) continue;

    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hIdx = filas.findIndex(r => r.some(c => String(c).trim() === 'CODIGO INTERNO'));
    if (hIdx === -1) continue;

    const headers = filas[hIdx];
    const iSku      = headers.indexOf('CODIGO INTERNO');
    const iNombre   = headers.indexOf('DESCRIPCION');
    const iPrecio   = headers.indexOf('PRECIO NETO (s/IVA)');
    const iMarca    = headers.indexOf('MARCA');
    const iBarras   = headers.indexOf('EAN13 Principal');
    const iStatus   = headers.indexOf('STATUS');
    const iInner    = headers.indexOf('INNER COM');

    if (iSku === -1 || iNombre === -1 || iPrecio === -1) continue;

    for (let i = hIdx + 1; i < filas.length; i++) {
      const f = filas[i];
      const sku = norm(f[iSku]);
      if (!sku) continue;

      const status = iStatus >= 0 ? norm(f[iStatus]) : '';
      if (status.includes('AGOTADO')) continue;

      let costoRaw = f[iPrecio];
      if (typeof costoRaw === 'string') {
        costoRaw = parseFloat(costoRaw.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim());
      }
      const costo = costoRaw && !isNaN(costoRaw) && costoRaw > 0 ? costoRaw : null;

      const parseUnidades = v => { const n = parseInt(v); return n > 1 && n <= 10000 ? n : null; };
      const unidadesCaja = iInner >= 0 ? parseUnidades(f[iInner]) : null;

      productos.push({
        sku,
        nombre:       norm(f[iNombre]),
        marca:        iMarca  >= 0 ? norm(f[iMarca])  : null,
        barras:       iBarras >= 0 ? String(f[iBarras] || '').trim() : null,
        costo,
        unidadesCaja,
        unidadesPallet: null,
        categoria:    unidadesCaja > 1 ? 'caja' : 'unidad',
      });
    }
  }

  return productos;
}

module.exports = { parsearArtline };
