const XLSX   = require('xlsx');
const OpenAI = require('openai');
const prisma = require('../db');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BASE_JS = 'https://api.jumpseller.com/v1';
const DELAY   = 650;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function authQuery() {
  const login = process.env.JUMPSELLER_LOGIN;
  const token = process.env.JUMPSELLER_TOKEN;
  if (!login || !token) throw new Error('JUMPSELLER_LOGIN y JUMPSELLER_TOKEN no configurados');
  return `login=${encodeURIComponent(login)}&authtoken=${encodeURIComponent(token)}`;
}

/**
 * Extrae productos del Excel de ENGATEL.
 * Estructura: col0=nombre, col3=precio (numérico). Sin headers formales — las filas
 * de categoría tienen texto en col0 y "Precio..." en col3/col4.
 */
function extraerProductosExcel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const productos = [];
  for (const row of rows) {
    const nombre = String(row[0] || '').trim();
    const rawPrecio = row[3];
    if (!nombre) continue;

    const precio = Number(rawPrecio);
    if (!precio || isNaN(precio) || precio <= 0) continue;

    // Filtrar filas de encabezado de sección (contienen "precio" en col3/col4 como texto)
    if (typeof rawPrecio === 'string' && /precio/i.test(rawPrecio)) continue;

    productos.push({ nombre, costo: Math.round(precio) });
  }
  return productos;
}

/**
 * Trae todos los productos de JumpSeller (paginado).
 * Retorna array de { id, sku, nombre }.
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
      todos.push({ id: p.id, sku: String(p.sku || '').trim(), nombre: String(p.name || '').trim() });
    }
    if (data.length < limit) break;
    page++;
    await sleep(DELAY);
  }
  return todos;
}

/**
 * Llama a Claude para hacer el matching entre nombres ENGATEL y productos JumpSeller.
 * Retorna array de { nombreEngatel, sku, jumpsellerProductId }.
 */
async function matchConIA(productosEngatel, productosJS) {
  const listaEngatel = productosEngatel.map((p, i) => `${i + 1}. ${p.nombre}`).join('\n');
  const listaJS = productosJS.map(p => `ID:${p.id} SKU:${p.sku || 'sin-sku'} | ${p.nombre}`).join('\n');

  const res = await client.chat.completions.create({
    model:      'gpt-4o-mini',
    max_tokens: 8192,
    messages: [{
      role:    'user',
      content: `Eres un experto en matching de nombres de productos de papelería y consumibles de oficina en Chile.

LISTA ENGATEL (proveedor, nombres abreviados):
${listaEngatel}

LISTA JUMPSELLER (tienda, nombres completos):
${listaJS.slice(0, 40000)}

Reglas de matching:
- "R.Term." = "Rollo Termico", "R.Reg." = "Rollo Regular", "R.Autoc." = "Rollo Autocopiativo", "R.Plotter" = "Rollo Plotter"
- "Form. Cont." = "Formulario Continuo"
- Las dimensiones (57x25, 80x40, etc.) deben coincidir
- El gramaje (55grs, 48grs, etc.) debe coincidir
- La cantidad "(10 unid.)" puede estar omitida en JumpSeller
- Si no encuentras match claro, omite ese producto

Devuelve SOLO un JSON array sin texto adicional:
[{"nombreEngatel":"nombre exacto de ENGATEL","sku":"sku de JumpSeller","jumpsellerProductId":ID_numerico}]`,
    }],
  });

  const texto = res.choices[0].message.content.trim();
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('IA no devolvió JSON válido para matching ENGATEL');
  return JSON.parse(match[0]);
}

/**
 * Parser principal ENGATEL.
 * 1. Extrae productos del Excel
 * 2. Busca mappings existentes en DB
 * 3. Para los sin mapping: trae JumpSeller + llama IA + guarda mapping
 * 4. Retorna productos con SKU resuelto
 */
async function parsearEngatel(buffer) {
  const productosExcel = extraerProductosExcel(buffer);
  if (!productosExcel.length) throw new Error('ENGATEL: no se encontraron productos en el Excel');

  const SLUG = 'engatel';

  // Buscar mappings ya guardados
  const nombresExcel = productosExcel.map(p => p.nombre);
  const mapeosExistentes = await prisma.nombreMapeo.findMany({
    where: { proveedorSlug: SLUG, nombreProveedor: { in: nombresExcel } },
  });
  const mapaExistente = Object.fromEntries(mapeosExistentes.map(m => [m.nombreProveedor, m]));

  const sinMapping = productosExcel.filter(p => !mapaExistente[p.nombre]);

  // Si hay productos sin mapping, hacer el matching con IA
  if (sinMapping.length > 0) {
    console.log(`[ENGATEL] ${sinMapping.length} productos sin mapping → iniciando matching con IA`);
    const productosJS = await traerProductosJumpseller();
    const matches = await matchConIA(sinMapping, productosJS);

    // Guardar nuevos mappings en DB
    for (const m of matches) {
      if (!m.nombreEngatel || !m.sku) continue;
      await prisma.nombreMapeo.upsert({
        where:  { proveedorSlug_nombreProveedor: { proveedorSlug: SLUG, nombreProveedor: m.nombreEngatel } },
        update: { sku: String(m.sku), jumpsellerProductId: m.jumpsellerProductId ?? null },
        create: { proveedorSlug: SLUG, nombreProveedor: m.nombreEngatel, sku: String(m.sku), jumpsellerProductId: m.jumpsellerProductId ?? null },
      });
      mapaExistente[m.nombreEngatel] = { sku: String(m.sku) };
    }
    console.log(`[ENGATEL] ${matches.length} mappings guardados`);
  }

  // Construir resultado final (solo los que tienen SKU resuelto)
  const resultado = [];
  for (const p of productosExcel) {
    const mapeo = mapaExistente[p.nombre] ?? mapaExistente[p.nombre];
    if (!mapeo?.sku) continue;
    resultado.push({
      sku:    mapeo.sku,
      nombre: p.nombre,
      marca:  'Engatel',
      barras: null,
      costo:  p.costo,
    });
  }

  return resultado;
}

module.exports = { parsearEngatel };
