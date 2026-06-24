const mammoth  = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');
const prisma    = require('../db');

const BASE_JS = 'https://api.jumpseller.com/v1';
const DELAY   = 650;
const SLUG    = 'scai';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function authQuery() {
  const login = process.env.JUMPSELLER_LOGIN;
  const token = process.env.JUMPSELLER_TOKEN;
  if (!login || !token) throw new Error('JUMPSELLER_LOGIN y JUMPSELLER_TOKEN no configurados');
  return `login=${encodeURIComponent(login)}&authtoken=${encodeURIComponent(token)}`;
}

/**
 * Extrae texto del .docx y parsea bloques de 6 líneas por producto.
 * Las primeras ~9 líneas son encabezado del documento.
 *
 * Estructura de cada bloque:
 *  [0] nombre
 *  [1] modelo
 *  [2] UND PILAS BLISTER
 *  [3] BLISTER PEQUEÑO
 *  [4] EMPAQUE
 *  [5] precio  ($5,767)
 *
 * @param {Buffer} buffer
 * @returns {Array<{ nombre: string, costo: number }>}
 */
async function extraerProductosDocx(buffer) {
  const { value: texto } = await mammoth.extractRawText({ buffer });

  const lineas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Saltar encabezado (primeras 9 líneas)
  const HEADER_LINES = 9;
  const datos = lineas.slice(HEADER_LINES);

  const productos = [];
  const BLOQUE = 6;

  for (let i = 0; i + BLOQUE <= datos.length; i += BLOQUE) {
    const nombre  = datos[i].slice(0, 255).trim();
    const rawPrecio = datos[i + 5];

    if (!nombre || !rawPrecio) continue; // bloque incompleto/vacío

    // Parsear precio: "$5,767" → 5767
    const costoNum = parseFloat(
      String(rawPrecio)
        .replace(/\$/g, '')
        .replace(/\./g, '')   // separador miles chileno (punto)
        .replace(/,/g, '.')   // decimal si aplica
        .trim()
    );

    if (isNaN(costoNum) || costoNum <= 0) continue;

    productos.push({ nombre, costo: Math.round(costoNum) });
  }

  return productos;
}

/**
 * Trae todos los productos de JumpSeller (paginado).
 */
async function traerProductosJumpseller() {
  const todos = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const url = `${BASE_JS}/products.json?${authQuery()}&limit=${limit}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`JumpSeller ${res.status} GET /products.json`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const p of data) {
      todos.push({
        id:     p.id,
        sku:    String(p.sku || '').trim(),
        nombre: String(p.name || '').trim(),
      });
    }
    if (data.length < limit) break;
    page++;
    await sleep(DELAY);
  }
  return todos;
}

/**
 * Llama a Claude Haiku para hacer matching entre nombres SCAI y productos JumpSeller.
 * SCAI vende pilas/baterías Duracell y afines.
 *
 * @param {Array<{ nombre, costo }>} productosSinMapeo
 * @param {Array<{ id, sku, nombre }>} productosJS
 * @returns {Array<{ nombreScai, sku, jumpsellerProductId }>}
 */
async function matchConIA(productosSinMapeo, productosJS) {
  const client = new Anthropic();

  const listaScai = productosSinMapeo.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
  const listaJS   = productosJS.map(p => `ID:${p.id} SKU:${p.sku || 'sin-sku'} | ${p.nombre}`).join('\n');

  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Eres un experto en matching de nombres de productos de pilas y baterías (Duracell, Energizer, etc.) en Chile.

LISTA SCAI (proveedor, nombres del documento):
${listaScai}

LISTA JUMPSELLER (tienda, nombres completos):
${listaJS.slice(0, 40000)}

Reglas de matching:
- Los productos son principalmente pilas y baterías Duracell
- El tipo de pila debe coincidir exactamente (AA, AAA, C, D, 9V, etc.)
- La cantidad de unidades por paquete debe coincidir (x2, x4, x8, x12, etc.)
- "Prepicado" o "Tira" indica presentación especial en tira
- "Alcalina" es el tipo más común; "Litio" o "Lithium" son distintos
- Si no encuentras match claro, omite ese producto

Devuelve SOLO un JSON array sin texto adicional:
[{"nombreScai":"nombre exacto de SCAI","sku":"sku de JumpSeller","jumpsellerProductId":ID_numerico}]`,
    }],
  });

  const texto = msg.content[0].text.trim();
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('IA no devolvió JSON válido para matching SCAI');
  return JSON.parse(match[0]);
}

/**
 * Parser principal SCAI.
 * 1. Extrae productos del .docx
 * 2. Busca mappings existentes en DB
 * 3. Para los sin mapping: trae JumpSeller + llama IA + guarda mapping
 * 4. Retorna productos con SKU resuelto
 *
 * @param {Buffer} buffer
 * @param {string} proveedorSlug  - slug del proveedor (esperado 'scai')
 * @returns {Array<{ sku, nombre, marca, barras, costo }>}
 */
async function parsearScai(buffer, proveedorSlug) {
  const slug = proveedorSlug || SLUG;

  const productosDocx = await extraerProductosDocx(buffer);
  if (!productosDocx.length) throw new Error('SCAI: no se encontraron productos en el documento');

  // Buscar mappings ya guardados
  const nombres = productosDocx.map(p => p.nombre);
  const mapeosExistentes = await prisma.nombreMapeo.findMany({
    where: { proveedorSlug: slug, nombreProveedor: { in: nombres } },
  });
  const mapaExistente = Object.fromEntries(mapeosExistentes.map(m => [m.nombreProveedor, m]));

  const sinMapping = productosDocx.filter(p => !mapaExistente[p.nombre]);

  // Matching con IA para los productos sin mapping
  if (sinMapping.length > 0) {
    console.log(`[SCAI] ${sinMapping.length} productos sin mapping → iniciando matching con IA`);
    const productosJS = await traerProductosJumpseller();
    const matches = await matchConIA(sinMapping, productosJS);

    for (const m of matches) {
      if (!m.nombreScai || !m.sku) continue;
      const nombreLimpio = String(m.nombreScai).trim().slice(0, 255);
      const skuLimpio    = String(m.sku).trim().slice(0, 100);
      await prisma.nombreMapeo.upsert({
        where:  { proveedorSlug_nombreProveedor: { proveedorSlug: slug, nombreProveedor: nombreLimpio } },
        update: { sku: skuLimpio, jumpsellerProductId: m.jumpsellerProductId ?? null },
        create: { proveedorSlug: slug, nombreProveedor: nombreLimpio, sku: skuLimpio, jumpsellerProductId: m.jumpsellerProductId ?? null },
      });
      mapaExistente[nombreLimpio] = { sku: skuLimpio };
    }
    console.log(`[SCAI] ${matches.length} mappings guardados`);
  }

  // Construir resultado final (solo los que tienen SKU resuelto)
  const resultado = [];
  for (const p of productosDocx) {
    const mapeo = mapaExistente[p.nombre];
    if (!mapeo?.sku) continue;
    resultado.push({
      sku:    mapeo.sku,
      nombre: p.nombre,
      marca:  'Duracell',
      barras: null,
      costo:  p.costo,
    });
  }

  return resultado;
}

module.exports = { parsearScai };
