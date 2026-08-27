const pdfParse = require('pdf-parse');

/**
 * Parser Llabres — lista de precios PDF.
 * Formato: {SKU}{NOMBRE}${PRECIO} — SKU pegado al nombre sin delimitador fijo.
 * SKU: 1-5 letras/Ñ + 0-3 dígitos + opcional -N (ej: DEP1, CLOGL1, CERK-1, CLOR).
 * Precio: siempre al final tras el último $.
 * Nota: ~15 productos 4-letra-solo (CERH, CLOR, BPHB) capturan 1 letra extra del nombre
 * en el SKU — son estables entre importaciones, precios siempre correctos.
 */

const SKU_RE = /^([A-ZÑ]{1,5}[0-9]{0,3}(?:-\d+)?)\s*(.*?)\$([0-9,.]+)\s*$/;

async function parsearLlabres(buffer) {
  const data   = await pdfParse(buffer);
  const lineas = data.text.split('\n').map(l => l.trim()).filter(Boolean);

  const productos  = [];
  const skusVistos = new Set();

  for (const linea of lineas) {
    const m = linea.match(SKU_RE);
    if (!m) continue;

    const sku    = m[1].trim();
    const nombre = m[2].trim();
    const costo  = parseFloat(m[3].replace(/,/g, ''));

    if (!sku || !nombre || !costo || costo <= 0) continue;
    if (skusVistos.has(sku)) continue;
    skusVistos.add(sku);

    productos.push({ sku, nombre, costo, marca: 'Llabres', barras: null });
  }

  if (!productos.length) throw new Error('LLABRES: no se extrajeron productos del PDF');
  console.log(`[llabres] ${productos.length} productos parseados`);
  return productos;
}

module.exports = { parsearLlabres };
