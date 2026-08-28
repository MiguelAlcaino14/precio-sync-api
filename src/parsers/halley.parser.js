const XLSX = require('xlsx');

function parsearPrecio(v) {
  const n = Number(v);
  return (!n || isNaN(n) || n <= 0) ? null : n;
}

function parsearHalley(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let idx  = 1;
  const mk = (nombre, precioConIva) => ({
    sku:    `HAL-${String(idx++).padStart(3, '0')}`,
    nombre: String(nombre).trim().slice(0, 255),
    marca:  'Halley',
    barras: null,
    costo:  parsearPrecio(precioConIva),
  });

  const productos = [];

  // ── Sección 1: filas 12–32, 2 productos por fila (col 0-3 y col 4-7) ──
  for (let i = 12; i <= 32; i++) {
    const r = rows[i];
    if (!r) continue;
    if (r[1] && r[3]) productos.push(mk(r[1], r[3]));
    if (r[5] && r[7]) productos.push(mk(r[5], r[7]));
  }

  // ── Sección 2: filas 37–53, 4 grupos de 4 cols (0-3, 4-7, 8-11, 12-15) ──
  // Nombres de sección en fila 35
  const secRow  = rows[35] || [];
  const secNombres = [secRow[0], secRow[4], secRow[8], secRow[12]].map(s => String(s || '').trim());

  for (let i = 37; i <= 53; i++) {
    const r = rows[i];
    if (!r) continue;
    const grupos = [
      { nombre: r[1], precio: r[3], sec: secNombres[0] },
      { nombre: r[5], precio: r[7], sec: secNombres[1] },
      { nombre: r[9], precio: r[11], sec: secNombres[2] },
      { nombre: r[13], precio: r[15], sec: secNombres[3] },
    ];
    for (const g of grupos) {
      if (g.nombre && g.precio) {
        const esPapel9 = /PAPEL\s+#?\s*9/i.test(g.sec);
        const sep = esPapel9 ? ' COLOR ' : ' ';
        const nombreCompleto = g.sec ? `${g.sec}${sep}${g.nombre}` : g.nombre;
        productos.push(mk(nombreCompleto, g.precio));
      }
    }
  }

  // ── Sección 3: filas 57–66, CARTÓN PINTADO por color (col 0-3) ──
  for (let i = 57; i <= 66; i++) {
    const r = rows[i];
    if (!r) continue;
    if (r[1] && r[3]) productos.push(mk(`CARTON PINTADO ${r[1]}`, r[3]));
  }

  console.log(`[halley] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearHalley };
