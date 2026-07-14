const { parsearExcel }       = require('./excel.parser');
const { parsearPDF }         = require('./pdf.parser');
const { parsearConIA }       = require('./ia.parser');
const { parsearPPT }         = require('./ppt.parser');
const { parsearEngatel }     = require('./engatel.parser');
const { parsearCarlosGardy } = require('./carlos-gardy.parser');
const { parsearAccoBrand }   = require('./acco-brand.parser');
const { parsearScai }        = require('./scai.parser');
const { parsearCambiaso }    = require('./cambiaso.parser');
const { parsearWinnex }      = require('./winnex.parser');
const { parsearRommel }      = require('./rommel.parser');
const { parsearAutodetect }  = require('./autodetect.parser');

const tieneApiKey = () => !!process.env.OPENAI_API_KEY;

/**
 * Parsea un archivo según la config del proveedor.
 * Siempre devuelve { productos, sugerencia }.
 * sugerencia es null salvo cuando el parser ia detecta columnas estructuradas.
 * Si tipo=ia pero no hay OPENAI_API_KEY, intenta autodetección de columnas Excel.
 */
async function parsearArchivo(buffer, tipo, config, proveedorSlug) {
  if (config?.tipo === 'engatel')      return { productos: await parsearEngatel(buffer),             sugerencia: null };
  if (config?.tipo === 'carlos-gardy') return { productos: parsearCarlosGardy(buffer),               sugerencia: null };
  if (config?.tipo === 'acco-brand')   return { productos: parsearAccoBrand(buffer),                 sugerencia: null };
  if (config?.tipo === 'scai')         return { productos: await parsearScai(buffer, proveedorSlug), sugerencia: null };
  if (config?.tipo === 'cambiaso')     return { productos: parsearCambiaso(buffer),                  sugerencia: null };
  if (config?.tipo === 'winnex')       return { productos: parsearWinnex(buffer),                    sugerencia: null };
  if (config?.tipo === 'rommel')       return { productos: parsearRommel(buffer, config),            sugerencia: null };

  if (config?.tipo === 'ia') {
    // PPT/PPTX: parsearConIA no los soporta; extraer texto localmente + IA
    if (['ppt', 'pptx'].includes(tipo.toLowerCase())) {
      return await parsearPPT(buffer, config?.hint ?? null);
    }
    if (tieneApiKey()) return await parsearConIA(buffer, tipo, config?.hint ?? null);
    // Sin API key: autodetección para Excel, PDF falla
    if (['xlsx', 'xls', 'csv'].includes(tipo.toLowerCase())) {
      console.warn(`[parser] OPENAI_API_KEY no configurada, usando autodetección para ${tipo}`);
      return { productos: parsearAutodetect(buffer, proveedorSlug), sugerencia: null };
    }
    throw new Error(`Parser IA requerido para "${tipo}" pero OPENAI_API_KEY no está configurada`);
  }

  switch (tipo.toLowerCase()) {
    case 'xlsx':
    case 'xls':
    case 'csv':
      if ((config?.colSku && config?.colPrecio) || Array.isArray(config?.configs)) {
        try {
          const productos = parsearExcel(buffer, config);
          if (productos.length === 0 && config?.hint && tieneApiKey()) {
            console.warn(`[parser] Excel retornó 0 productos, reintentando con IA hint`);
            return await parsearConIA(buffer, tipo, config.hint);
          }
          return { productos, sugerencia: null };
        } catch (excelErr) {
          if (config?.hint && tieneApiKey()) {
            console.warn(`[parser] Excel falló (${excelErr.message.slice(0, 80)}), reintentando con IA hint`);
            return await parsearConIA(buffer, tipo, config.hint);
          }
          throw excelErr;
        }
      }
      // Sin columnas configuradas: autodetección
      if (!tieneApiKey()) {
        console.warn(`[parser] Sin colSku/colPrecio y sin OPENAI_API_KEY, usando autodetección`);
        return { productos: parsearAutodetect(buffer, proveedorSlug), sugerencia: null };
      }
      return await parsearConIA(buffer, tipo, config?.hint ?? null);
    case 'pdf':
      return { productos: await parsearPDF(buffer, config), sugerencia: null };
    case 'ppt':
    case 'pptx':
      return await parsearPPT(buffer, config?.hint ?? null);
    default:
      if (tieneApiKey()) return await parsearConIA(buffer, tipo, config?.hint ?? null);
      throw new Error(`Tipo "${tipo}" requiere OPENAI_API_KEY para parsear`);
  }
}

function detectarTipo(nombreArchivo) {
  return nombreArchivo.split('.').pop().toLowerCase();
}

module.exports = { parsearArchivo, detectarTipo };
