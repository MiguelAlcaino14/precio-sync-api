const { parsearExcel }       = require('./excel.parser');
const { parsearPDF }         = require('./pdf.parser');
const { parsearConIA }       = require('./ia.parser');
const { parsearEngatel }     = require('./engatel.parser');
const { parsearCarlosGardy } = require('./carlos-gardy.parser');
const { parsearAccoBrand }   = require('./acco-brand.parser');
const { parsearScai }        = require('./scai.parser');
const { parsearAutodetect }  = require('./autodetect.parser');

const tieneApiKey = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * Parsea un archivo según la config del proveedor.
 * Siempre devuelve { productos, sugerencia }.
 * sugerencia es null salvo cuando el parser ia detecta columnas estructuradas.
 * Si tipo=ia pero no hay ANTHROPIC_API_KEY, intenta autodetección de columnas Excel.
 */
async function parsearArchivo(buffer, tipo, config, proveedorSlug) {
  if (config?.tipo === 'engatel')      return { productos: await parsearEngatel(buffer),             sugerencia: null };
  if (config?.tipo === 'carlos-gardy') return { productos: parsearCarlosGardy(buffer),               sugerencia: null };
  if (config?.tipo === 'acco-brand')   return { productos: parsearAccoBrand(buffer),                 sugerencia: null };
  if (config?.tipo === 'scai')         return { productos: await parsearScai(buffer, proveedorSlug), sugerencia: null };

  if (config?.tipo === 'ia') {
    if (tieneApiKey()) return await parsearConIA(buffer, tipo);
    // Sin API key: autodetección para Excel, PDF falla
    if (['xlsx', 'xls', 'csv'].includes(tipo.toLowerCase())) {
      console.warn(`[parser] ANTHROPIC_API_KEY no configurada, usando autodetección para ${tipo}`);
      return { productos: parsearAutodetect(buffer, proveedorSlug), sugerencia: null };
    }
    throw new Error('Parser IA requerido para PDF pero ANTHROPIC_API_KEY no está configurada');
  }

  switch (tipo.toLowerCase()) {
    case 'xlsx':
    case 'xls':
    case 'csv':
      if (config?.colSku && config?.colPrecio) {
        return { productos: parsearExcel(buffer, config), sugerencia: null };
      }
      // Sin columnas configuradas: autodetección
      if (!tieneApiKey()) {
        console.warn(`[parser] Sin colSku/colPrecio y sin ANTHROPIC_API_KEY, usando autodetección`);
        return { productos: parsearAutodetect(buffer, proveedorSlug), sugerencia: null };
      }
      return await parsearConIA(buffer, tipo);
    case 'pdf':
      return { productos: await parsearPDF(buffer, config), sugerencia: null };
    default:
      if (tieneApiKey()) return await parsearConIA(buffer, tipo);
      throw new Error(`Tipo "${tipo}" requiere ANTHROPIC_API_KEY para parsear`);
  }
}

function detectarTipo(nombreArchivo) {
  return nombreArchivo.split('.').pop().toLowerCase();
}

module.exports = { parsearArchivo, detectarTipo };
