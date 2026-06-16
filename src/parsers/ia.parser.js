const Anthropic = require('@anthropic-ai/sdk');
const XLSX      = require('xlsx');
const pdfParse  = require('pdf-parse');

const client = new Anthropic();

async function parsearConIA(buffer, tipo) {
  let contenido = '';

  if (['xlsx', 'xls', 'csv'].includes(tipo)) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    contenido = XLSX.utils.sheet_to_csv(ws);
  } else if (tipo === 'pdf') {
    const data = await pdfParse(buffer);
    contenido = data.text;
  } else {
    throw new Error(`Tipo no soportado para IA: ${tipo}`);
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Eres un extractor de datos de listas de precios de proveedores chilenos.

Analiza este documento y extrae TODOS los productos con su código SKU y precio neto (sin IVA).

Reglas:
- El SKU puede ser numérico o alfanumérico (ej: 29705, 13092-3, 701AZ)
- El precio debe ser numérico sin puntos de miles ni símbolo $ (ej: 1250)
- Si el precio incluye IVA, divídelo por 1.19 y redondea
- Omite filas de encabezado, subtotales o filas vacías
- Si no puedes determinar SKU o precio de una fila, omítela

Devuelve ÚNICAMENTE un JSON array, sin texto adicional:
[{"sku":"código","nombre":"descripción del producto","precio":1234}]

Documento:
${contenido.slice(0, 60000)}`,
    }],
  });

  const texto = message.content[0].text.trim();
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('El agente IA no devolvió un JSON válido');

  const productos = JSON.parse(match[0]);
  return productos
    .filter(p => p.sku && p.precio && Number(p.precio) > 0)
    .map(p => ({
      sku:    String(p.sku).trim(),
      nombre: String(p.nombre || '').trim(),
      marca:  null,
      barras: null,
      costo:  Math.round(Number(p.precio)),
    }));
}

module.exports = { parsearConIA };
