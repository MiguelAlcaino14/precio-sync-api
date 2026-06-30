const Anthropic = require('@anthropic-ai/sdk');
const XLSX      = require('xlsx');
const pdfParse  = require('pdf-parse');

const client = new Anthropic();

async function parsearConIA(buffer, tipo) {
  if (['xlsx', 'xls', 'csv'].includes(tipo)) {
    return parsearExcelConIA(buffer);
  } else if (tipo === 'pdf') {
    return parsearPDFConIA(buffer);
  }
  throw new Error(`Tipo no soportado para IA: ${tipo}`);
}

async function parsearExcelConIA(buffer) {
  const wb        = XLSX.read(buffer, { type: 'buffer' });
  const hojaIndex = 0;
  const ws        = wb.Sheets[wb.SheetNames[hojaIndex]];
  const filas     = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const contenido = XLSX.utils.sheet_to_csv(ws);

  // Encontrar la primera fila con al menos 3 celdas no vacías (candidata a header)
  let encabezados = [];
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const celdas = filas[i].map(c => String(c).trim()).filter(Boolean);
    if (celdas.length >= 3) { encabezados = celdas; break; }
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Eres un extractor de datos de listas de precios de proveedores chilenos.

Analiza este documento y:
1. Extrae TODOS los productos con su código SKU, nombre y precio neto (sin IVA).
2. Identifica qué encabezados de columna corresponden al SKU, nombre y precio.

Encabezados detectados en la hoja: ${encabezados.length ? encabezados.join(' | ') : 'no identificados'}

Reglas para extracción:
- El SKU puede ser numérico o alfanumérico (ej: 29705, 13092-3, 701AZ)
- El precio debe ser numérico sin puntos de miles ni símbolo $ (ej: 1250)
- Si el precio incluye IVA, divídelo por 1.19 y redondea
- Omite filas de encabezado, subtotales o filas vacías
- Si no puedes determinar SKU o precio de una fila, omítela

Devuelve ÚNICAMENTE este JSON sin texto adicional:
{
  "productos": [{"sku":"código","nombre":"descripción","precio":1234}],
  "sugerencia": {
    "colSku": "nombre exacto del encabezado que contiene el SKU",
    "colNombre": "nombre exacto del encabezado que contiene el nombre o descripción",
    "colPrecio": "nombre exacto del encabezado que contiene el precio",
    "precioIncluyeIVA": false
  }
}

Si no puedes identificar las columnas con certeza, omite el campo "sugerencia".

Documento:
${contenido.slice(0, 60000)}`,
    }],
  });

  const texto = message.content[0].text.trim();

  let productos = [], sugerencia = null;

  // Intentar parsear objeto con productos + sugerencia
  try {
    const objMatch = texto.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.productos)) {
        productos = parsed.productos;
        if (parsed.sugerencia?.colSku && parsed.sugerencia?.colPrecio) {
          sugerencia = { tipo: 'excel', hoja: hojaIndex, ...parsed.sugerencia };
        }
      }
    }
  } catch {}

  // Fallback: formato antiguo (array directo)
  if (!productos.length) {
    try {
      const arrMatch = texto.match(/\[[\s\S]*\]/);
      if (arrMatch) productos = JSON.parse(arrMatch[0]);
    } catch {}
  }

  if (!productos.length) throw new Error('El agente IA no devolvió un JSON válido');

  return {
    productos: productos
      .filter(p => p.sku && p.precio && Number(p.precio) > 0)
      .map(p => ({
        sku:    String(p.sku).trim(),
        nombre: String(p.nombre || '').trim(),
        marca:  null,
        barras: null,
        costo:  Math.round(Number(p.precio)),
      })),
    sugerencia,
  };
}

async function parsearPDFConIA(buffer) {
  const data      = await pdfParse(buffer);
  const contenido = data.text;

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

  return {
    productos: JSON.parse(match[0])
      .filter(p => p.sku && p.precio && Number(p.precio) > 0)
      .map(p => ({
        sku:    String(p.sku).trim(),
        nombre: String(p.nombre || '').trim(),
        marca:  null,
        barras: null,
        costo:  Math.round(Number(p.precio)),
      })),
    sugerencia: null,
  };
}

module.exports = { parsearConIA };
