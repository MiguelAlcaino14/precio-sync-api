const pdfParse = require('pdf-parse');

async function parsearPDF(buffer, config) {
  const data  = await pdfParse(buffer);
  const lineas = data.text.split('\n').map(l => l.trim()).filter(Boolean);

  const regexSku = new RegExp(config.patronCodigo || '^\\d{6,7}');

  // Unidades conocidas — se usan para detectar dónde termina el nombre
  const unidades = (config.unidades || ['C/u.', 'Pqte.', 'Resma', 'Unid.', 'Rollo', 'Caja', 'Metro'])
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Greedy (.*) → coincide con la ÚLTIMA ocurrencia de la unidad en la línea
  const regexLinea = new RegExp(`^(\\d{6,7})(.*)(${unidades})(.+)$`, 'i');

  const productos = [];

  for (const linea of lineas) {
    if (!regexSku.test(linea)) continue;

    const match = linea.match(regexLinea);
    if (!match) continue;

    const [, sku, nombre, , despuesUnidad] = match;

    const costo = extraerPrecio(despuesUnidad, config);
    if (!costo || costo <= 0) continue;

    productos.push({
      sku:    sku.trim(),
      nombre: nombre.trim(),
      marca:  null,
      barras: null,
      costo:  Math.round(costo),
    });
  }

  return productos;
}

// Cantidades de paquete conocidas (descendente para preferir el match más largo)
const QTYS = [200, 100, 60, 50, 48, 40, 25, 24, 20, 15, 12, 10, 6, 5, 4, 3, 2, 1];

// Extrae el precio de la cadena que viene después de la unidad (qty + precio concatenados)
// El PDF concatena qty y precio sin separador: "Pqte.52.916" = qty=5, precio=2.916
function extraerPrecio(str, config) {
  const soloDigitos = str.replace(/\D/g, '');
  if (!soloDigitos) return null;

  // Intentar separar qty conocida como prefijo, usar el resto como precio
  for (const qty of QTYS) {
    const qtyStr = String(qty);
    if (!soloDigitos.startsWith(qtyStr)) continue;
    const resto = soloDigitos.slice(qtyStr.length);
    const precio = digitosAPrecio(resto);
    if (precio !== null) return aplicarIVA(precio, config);
  }

  // Sin qty reconocible → el string completo es el precio
  const precio = digitosAPrecio(soloDigitos);
  return precio !== null ? aplicarIVA(precio, config) : null;
}

// 3 dígitos → precio <1.000; 4 dígitos → X.YYY (miles); 5 dígitos → XX.YYY
function digitosAPrecio(digits) {
  if (digits.length < 3 || digits.length > 5) return null;
  const valor = parseInt(digits, 10);
  return isNaN(valor) ? null : valor;
}

function aplicarIVA(valor, config) {
  if (!config.precioIncluyeIVA && config.factorIVA) {
    return valor * config.factorIVA;
  }
  return valor;
}

module.exports = { parsearPDF };
