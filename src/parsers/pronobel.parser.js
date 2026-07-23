const XLSX = require('xlsx');

/**
 * Parser Pronobel — detecta automáticamente el formato según cabeceras.
 *
 * Formato USAR  ("Comercio ... USAR.xlsx"):
 *   Filas 0-1 vacías, headers fila 2, datos desde fila 3.
 *   col0=CODIGO(SKU), col2=Texto breve material, col3=Marca, col5=EMB, col7=FINAL NETO
 *
 * Formato LEO  ("Comercio ... LEO.xlsx"):
 *   Headers fila 0, datos desde fila 1.
 *   col1=Material(SKU), col3=Texto breve material, col4=Marca, col5=EMB, col8=CASTILLA Y ARAGON
 *
 * Formato TECNOLOGIA  ("LP Tecnología ... .xlsx"):
 *   Hoja "LP", headers fila 2, datos desde fila 3.
 *   col1=CÓDIGO(SKU), col3=DESCRIPCIÓN, col6=EMB, col7=$ NETO
 */
function parsearPronobel(buffer) {
  const wb    = XLSX.read(buffer, { type: 'buffer' });
  const hojas = wb.SheetNames;

  // Tecnología: tiene hoja "LP"
  if (hojas.includes('LP')) {
    return parsearFormato(wb.Sheets['LP'], {
      headerFila: 2,
      colSku:     1,
      colNombre:  3,
      colMarca:   null,
      colEMB:     6,
      colPrecio:  7,
    });
  }

  const ws   = wb.Sheets[hojas[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // LEO: headers en fila 0 y primera columna dice "SKU NUEVOS"
  if (String(rows[0]?.[0] || '').includes('SKU')) {
    return parsearFormato(ws, {
      headerFila: 0,
      colSku:     1,
      colNombre:  3,
      colMarca:   4,
      colEMB:     5,
      colPrecio:  8,
    });
  }

  // USAR: headers en fila 2 (filas 0-1 vacías)
  return parsearFormato(ws, {
    headerFila: 2,
    colSku:     0,
    colNombre:  2,
    colMarca:   3,
    colEMB:     5,
    colPrecio:  7,
  });
}

function parsearFormato(ws, { headerFila, colSku, colNombre, colMarca, colEMB, colPrecio }) {
  const rows     = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const productos = [];

  for (let i = headerFila + 1; i < rows.length; i++) {
    const r      = rows[i];
    const sku    = String(r[colSku]    || '').trim();
    const nombre = String(r[colNombre] || '').trim().replace(/^[\s*]+/, '');
    const precio = Number(r[colPrecio]) || 0;

    if (!sku || !nombre || precio <= 0) continue;

    productos.push({
      sku,
      nombre,
      costo:        Math.round(precio),
      marca:        colMarca != null ? (String(r[colMarca] || '').trim() || null) : null,
      unidadesCaja: Number(r[colEMB]) > 0 ? Number(r[colEMB]) : null,
    });
  }

  console.log(`[pronobel] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearPronobel };
