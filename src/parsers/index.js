const { parsearExcel }      = require('./excel.parser');
const { parsearPDF }        = require('./pdf.parser');
const { parsearConIA }      = require('./ia.parser');
const { parsearEngatel }    = require('./engatel.parser');
const { parsearCarlosGardy } = require('./carlos-gardy.parser');
const { parsearAccoBrand }  = require('./acco-brand.parser');
const { parsearScai }       = require('./scai.parser');

/**
 * Parsea un archivo según la config del proveedor.
 * @param {Buffer} buffer        - contenido del archivo
 * @param {string} tipo          - 'xlsx' | 'csv' | 'pdf' | 'docx'
 * @param {object} config        - config del proveedor (viene de DB)
 * @param {string} [proveedorSlug] - slug del proveedor (requerido para parsers con NombreMapeo)
 * @returns {Array}              - [{ sku, nombre, marca, barras, costo }]
 */
async function parsearArchivo(buffer, tipo, config, proveedorSlug) {
  if (config?.tipo === 'engatel')      return await parsearEngatel(buffer);
  if (config?.tipo === 'ia')           return await parsearConIA(buffer, tipo);
  if (config?.tipo === 'carlos-gardy') return parsearCarlosGardy(buffer);
  if (config?.tipo === 'acco-brand')   return parsearAccoBrand(buffer);
  if (config?.tipo === 'scai')         return await parsearScai(buffer, proveedorSlug);

  switch (tipo.toLowerCase()) {
    case 'xlsx':
    case 'xls':
    case 'csv':
      return parsearExcel(buffer, config);
    case 'pdf':
      return await parsearPDF(buffer, config);
    default:
      return await parsearConIA(buffer, tipo);
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
