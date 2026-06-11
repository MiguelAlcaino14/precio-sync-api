const { parsearExcel } = require('./excel.parser');
const { parsearPDF }   = require('./pdf.parser');

/**
 * Parsea un archivo según la config del proveedor.
 * @param {Buffer} buffer  - contenido del archivo
 * @param {string} tipo    - 'xlsx' | 'csv' | 'pdf'
 * @param {object} config  - config del proveedor (viene de DB)
 * @returns {Array}        - [{ sku, nombre, marca, barras, costo }]
 */
async function parsearArchivo(buffer, tipo, config) {
  switch (tipo.toLowerCase()) {
    case 'xlsx':
    case 'xls':
    case 'csv':
      return parsearExcel(buffer, config);
    case 'pdf':
      return await parsearPDF(buffer, config);
    default:
      throw new Error(`Tipo de archivo no soportado: ${tipo}`);
  }
}

/**
 * Detecta el tipo de archivo por su nombre.
 */
function detectarTipo(nombreArchivo) {
  const ext = nombreArchivo.split('.').pop().toLowerCase();
  return ext;
}

module.exports = { parsearArchivo, detectarTipo };
