const pdfParse = require('pdf-parse');

/**
 * Parser para PDFs de lista de precios.
 * Asume estructura: CODIGO  DESCRIPCION  ...  PRECIO
 * Detecta filas con código numérico al inicio de línea.
 */
async function parsearPDF(buffer, config) {
  const data = await pdfParse(buffer);
  const lineas = data.text.split('\n').map(l => l.trim()).filter(Boolean);

  const regexCodigo = new RegExp(config.patronCodigo || '^\\d{6,7}');
  const productos = [];

  for (const linea of lineas) {
    if (!regexCodigo.test(linea)) continue;

    const partes = linea.split(/\s+/);
    if (partes.length < 2) continue;

    const sku = partes[0];
    // El precio es el último token numérico (puede tener punto como separador de miles)
    let precioStr = partes[partes.length - 1];
    let costo = parseFloat(precioStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(costo) || costo <= 0) continue;

    // Aplicar IVA si el precio viene neto
    if (!config.precioIncluyeIVA && config.factorIVA) {
      costo = costo * config.factorIVA;
    }

    // El nombre es todo lo que queda entre código y precio
    const nombre = partes.slice(1, -1).join(' ');

    productos.push({
      sku,
      nombre,
      marca: null,
      barras: null,
      costo: Math.round(costo),
    });
  }

  return productos;
}

module.exports = { parsearPDF };
