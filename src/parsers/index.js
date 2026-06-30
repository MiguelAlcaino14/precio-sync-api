const { parsearExcel }       = require('./excel.parser');
const { parsearPDF }         = require('./pdf.parser');
const { parsearConIA }       = require('./ia.parser');
const { parsearEngatel }     = require('./engatel.parser');
const { parsearCarlosGardy } = require('./carlos-gardy.parser');
const { parsearAccoBrand }   = require('./acco-brand.parser');
const { parsearScai }        = require('./scai.parser');

/**
 * Parsea un archivo según la config del proveedor.
 * Siempre devuelve { productos, sugerencia }.
 * sugerencia es null salvo cuando el parser ia detecta columnas estructuradas.
 */
async function parsearArchivo(buffer, tipo, config, proveedorSlug) {
  if (config?.tipo === 'ia')           return await parsearConIA(buffer, tipo);
  if (config?.tipo === 'engatel')      return { productos: await parsearEngatel(buffer),             sugerencia: null };
  if (config?.tipo === 'carlos-gardy') return { productos: parsearCarlosGardy(buffer),               sugerencia: null };
  if (config?.tipo === 'acco-brand')   return { productos: parsearAccoBrand(buffer),                 sugerencia: null };
  if (config?.tipo === 'scai')         return { productos: await parsearScai(buffer, proveedorSlug), sugerencia: null };

  switch (tipo.toLowerCase()) {
    case 'xlsx':
    case 'xls':
    case 'csv':
      return { productos: parsearExcel(buffer, config), sugerencia: null };
    case 'pdf':
      return { productos: await parsearPDF(buffer, config), sugerencia: null };
    default:
      return await parsearConIA(buffer, tipo);
  }
}

function detectarTipo(nombreArchivo) {
  return nombreArchivo.split('.').pop().toLowerCase();
}

module.exports = { parsearArchivo, detectarTipo };
