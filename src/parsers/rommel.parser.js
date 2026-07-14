const XLSX = require('xlsx');

// Normaliza igual que excel.parser (tildes, char no-alfanum al inicio, lowercase)
const norm = s => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^[^\p{L}\d]+/u, '')
  .trim()
  .toLowerCase();

/**
 * Parser ROMMEL.
 * El archivo trae DOS (o más) tablas pegadas lado a lado en la misma hoja,
 * con el mismo header repetido: N° | DESCRIPCION | VALOR | (sep) | N° | DESCRIPCION | VALOR
 * El parser genérico solo leía el primer grupo de columnas → perdía la mitad de los productos.
 * Aquí se detectan todos los grupos de columnas y se leen todos.
 */
function parsearRommel(buffer, config = {}) {
  const colSku    = config.colSku    || 'N°';
  const colNombre = config.colNombre || 'DESCRIPCION';
  const colPrecio = config.colPrecio || 'VALOR';

  const wb    = XLSX.read(buffer, { type: 'buffer' });
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Fila de header: la que contiene colNombre y colPrecio
  let idxHeader = -1;
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const hs = filas[i].map(norm);
    if (hs.includes(norm(colNombre)) && hs.includes(norm(colPrecio))) { idxHeader = i; break; }
  }
  if (idxHeader === -1) throw new Error(`ROMMEL: no se encontró header con "${colNombre}"/"${colPrecio}"`);

  const headers = filas[idxHeader];
  const idxsSku    = headers.map((h, j) => norm(h) === norm(colSku)    ? j : -1).filter(j => j >= 0);
  const idxsNombre = headers.map((h, j) => norm(h) === norm(colNombre) ? j : -1).filter(j => j >= 0);
  const idxsPrecio = headers.map((h, j) => norm(h) === norm(colPrecio) ? j : -1).filter(j => j >= 0);

  // Emparejar grupos por orden izquierda→derecha
  const n = Math.min(idxsSku.length, idxsNombre.length, idxsPrecio.length);
  if (n === 0) throw new Error(`ROMMEL: no se encontraron columnas "${colSku}"/"${colNombre}"/"${colPrecio}"`);
  const grupos = [];
  for (let k = 0; k < n; k++) grupos.push({ s: idxsSku[k], no: idxsNombre[k], p: idxsPrecio[k] });

  const productos = [];
  const skusVistos = new Set();
  for (let i = idxHeader + 1; i < filas.length; i++) {
    const f = filas[i];
    for (const g of grupos) {
      const numero = String(f[g.s] || '').trim();
      const nombre = String(f[g.no] || '').trim();
      if (!numero || !nombre) continue;

      let costo = f[g.p];
      if (typeof costo === 'string') {
        costo = parseFloat(costo.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim());
      }
      if (!costo || isNaN(costo) || costo <= 0) continue;

      // SKU interno estable desde el nombre (el match a JumpSeller es por nombre);
      // el N° es solo posición y cambia entre listas, no sirve como código único.
      const slug = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
      let sku = `ROMMEL-${slug}`;
      if (skusVistos.has(sku)) { let x = 2; while (skusVistos.has(`${sku}-${x}`)) x++; sku = `${sku}-${x}`; }
      skusVistos.add(sku);

      productos.push({
        sku,
        nombre,
        marca:     'Rommel',
        barras:    null,
        costo:     Math.ceil(costo / 10) * 10,
        categoria: 'unidad',
      });
    }
  }

  if (!productos.length) throw new Error('ROMMEL: no se extrajeron productos');
  return productos;
}

module.exports = { parsearRommel };
