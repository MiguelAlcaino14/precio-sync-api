const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ── Proveedores librería ──────────────────────────────────────────────────────
const LIBRERIA = [
  // Parsers especiales
  { nombre: 'ACCO Brand',      slug: 'acco-brand',   config: { tipo: 'acco-brand' } },
  { nombre: 'Carlos Gardy',    slug: 'carlos-gardy', config: { tipo: 'ia', hint: 'Listado con dos columnas de precio: "PRECIO" (precio lista) y "Precio con Descuento" (precio real). Usa siempre la columna "Precio con Descuento". Los precios son netos sin IVA. Formato: "$320" → 320 (ignorar $). No hay SKU numérico; genera un código corto desde las primeras palabras del nombre del producto.' } },
  { nombre: 'ENGATEL',         slug: 'engatel',      config: { tipo: 'engatel' } },
  { nombre: 'SCAI',            slug: 'scai',         config: { tipo: 'scai' } },

  // PDF / IA
  { nombre: 'Halley',   slug: 'halley',   config: { tipo: 'ia', hint: 'El encabezado dice "VALORES MAS IVA", lo que significa que los precios listados YA INCLUYEN IVA. Divide cada precio por 1.19 para obtener el precio neto. Formato de precio: "$755" → divide por 1.19 → 635 neto. No hay SKU numérico; genera un código corto desde las primeras palabras del nombre del producto.' } },
  { nombre: 'REM MAX',  slug: 'rem-max',  config: { tipo: 'ia', hint: 'Lista tabulada con columna "UNIT. NETO" que contiene el precio NETO sin IVA (no dividir por 1.19, el encabezado "+19% IVA" indica que IVA se agrega al facturar, no está incluido). SKU es el código numérico de 7 dígitos al inicio de cada fila (ej: 7100592). Precios con punto como separador de miles (ej: 14.879 = 14879 pesos).' } },
  { nombre: 'TECNIGOM', slug: 'tecnigom', config: { tipo: 'ia', hint: 'Catálogo en formato de bloques (no tabular). Cada producto tiene: "COD. XXXXXX" (SKU), "PRECIO: $ YYY" (precio unitario neto sin IVA), y un nombre de producto en el bloque. Extrae el SKU del campo "COD.", el precio del campo "PRECIO:", y el nombre del encabezado del bloque o línea descriptiva.' } },

  // IA (multi-hoja o estructura variable)
  {
    nombre: 'Demarka', slug: 'demarka',
    config: { colSku: 'CODIGO ADETEC', colNombre: 'DESCRIPCION', colPrecio: 'PRECIO LISTA' },
  },
  { nombre: 'Devoto', slug: 'devoto', config: { tipo: 'ia', hint: 'El archivo tiene varias hojas; la hoja con precios tiene nombre de fecha (ej: "JUEVES 02-04"). En esa hoja la primera fila es un título ("LISTA DE PRECIOS...") y la segunda fila tiene los encabezados: BARRAS, CÓDIGO, DESCRIPCIÓN, ÍTEM, PRECIO. colSku="CÓDIGO", colNombre="DESCRIPCIÓN", colPrecio="PRECIO". Ignorar hojas de stock (tienen columnas "En stock", "Picking", "Disponible" pero sin precio).' } },
  {
    nombre: 'Libesa', slug: 'libesa',
    config: { tipo: 'ia', hint: 'Puede tener dos formatos. Formato 1 (normal): colSku="Código", colNombre="Descripcion", colPrecio="Precio". Formato 2 (licitaciones): colSku es la columna con códigos alfanuméricos cortos (ej: 9031-K, 27241-8), colNombre="Descripción", colPrecio="Precio Neto". El precio siempre es neto sin IVA.' },
  },
  {
    nombre: 'Pronobel', slug: 'pronobel',
    config: { tipo: 'ia', hint: 'Formato A: colSku="CODIGO", colPrecio="FINAL NETO", colNombre="Texto breve material", colMarca="Marca". Formato B (Castilla y Aragón): colSku="Material", colPrecio="CASTILLA Y ARAGON", colNombre="Texto breve material", colMarca="Marca". Detecta cuál formato aplica según los encabezados presentes. Precio siempre neto sin IVA.' },
  },
  {
    nombre: 'Teknofas', slug: 'teknofas',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'Precio unit.' },
  },

  // Excel genérico
  {
    nombre: 'Adioffice', slug: 'adioffice',
    config: { colSku: 'GP', colNombre: 'DESCRIPCIÓN', colPrecio: 'CC' },
  },
  {
    nombre: 'ARON', slug: 'aron',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION ARTICULO', colPrecio: 'Neto Final $' },
  },
  {
    nombre: 'Artel', slug: 'artel',
    config: { colSku: 'Material', colNombre: 'Descripcion', colPrecio: 'Precio', colMarca: 'Categoria' },
  },
  {
    nombre: 'Diazol', slug: 'diazol',
    config: { colSku: 'ITEM', colNombre: 'GLOSA', colPrecio: 'PRECIO' },
  },
  {
    nombre: 'FDS', slug: 'fds',
    config: { tipo: 'ia', hint: 'El archivo tiene múltiples hojas por categoría/marca (ej: CALCULADORAS, STUDMARK, MAS ARTE, MISTER OFFICE, HAVIT). En cada hoja: colSku="CODIGO", colNombre="DESCRIPCION", colPrecio="Precio Final" (precio neto ya con descuento aplicado, sin IVA). Ignorar columnas "LISTA PRECIO" (precio bruto) y "Desc" (factor de descuento).' },
  },
  {
    nombre: 'IMEX', slug: 'imex',
    config: { colSku: 'CODIGO NUEVO', colNombre: 'DESCRIPCIÓN', colPrecio: 'LPGOB c/Dcto. TO' },
  },
  {
    nombre: 'JM Azcorbebeitia', slug: 'jm-azcorbebeitia',
    config: { colSku: 'Código', colNombre: 'Descripción', colPrecio: 'Precio Neto', colBarras: 'Ean', colMarca: 'SuperFamilia' },
  },
  {
    nombre: 'Offione', slug: 'offione',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'Costo Neto', hoja: 'LISTA GRAL' },
  },
  {
    nombre: 'Vieri', slug: 'vieri',
    config: { colSku: 'SKU', colNombre: 'DESCRIPCIÓN', colPrecio: 'NETO 01P', colMarca: 'SÚPERFAMILIA' },
  },

  // Configs detalladas (xlsx con precioIncluyeIVA)
  {
    nombre: 'Torre y Colón', slug: 'torre-colon',
    config: {
      tipo: 'xlsx', hoja: 0,
      colSku: 'Cod.', colPrecio: 'PVC MAYORISTA',
      colNombre: 'Descripción Material', colMarca: 'Sector',
      precioIncluyeIVA: false,
    },
  },
];

// ── Proveedores aseo ──────────────────────────────────────────────────────────
const ASEO = [
  {
    nombre: 'BRILLEX', slug: 'brillex',
    config: { colSku: 'Codigo Odoo', colNombre: 'DESCRIPCION', colPrecio: 'precio neto unitario' },
  },
  { nombre: 'CHIPRO',   slug: 'chipro',   config: { tipo: 'ia', hint: 'El precio unitario está en una columna sin encabezado visible (aprox. columna 11-12). El código de producto está en la columna A.' } },
  {
    nombre: 'DURANDIN', slug: 'durandin',
    config: { colSku: 'Código\r\nPT', colNombre: 'Descripción', colPrecio: 'Precio de Facturación Lista Actual' },
  },
  {
    nombre: 'ELITE', slug: 'elite',
    config: { colSku: 'Sku', colNombre: 'Descripción', colPrecio: 'PRECIO LISTA DISTRIBUIDOR CAPILAR' },
  },
  {
    nombre: 'FIBRO', slug: 'fibro',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCIÓN', colPrecio: 'L1', colMarca: 'MARCA', colBarras: 'EAN' },
  },
  {
    nombre: 'IMPOEX', slug: 'impoex',
    config: { colSku: 'N° SAP', colNombre: 'DESCRIPCION', colPrecio: 'COSTO CASTILLA', colMarca: 'MARCA' },
  },
  {
    nombre: 'LIBESA (Aseo)', slug: 'libesa-aseo',
    config: { colSku: 'Código', colNombre: 'Descripción', colPrecio: 'Precio', hoja: 0 },
  },
  { nombre: 'LLABRES', slug: 'llabres', config: { tipo: 'ia', hint: 'PDF bien estructurado con columnas: SKU corto (ej: DEP1, MUH2), Descripción, "$ Neto" (precio neto sin IVA). Los precios usan coma como separador de miles (ej: "$5,621" = 5621 pesos, no 5.621). Tomar el número ignorando "$" y coma de miles.' } },
  { nombre: 'MGP', slug: 'mgp', config: { tipo: 'ia', hint: 'Lista con tres columnas de precio: "PRECIO NORMAL NETO", "POR MAYOR NETO" (desde 4 unidades), "PRECIO X CANTIDAD NETO" (desde 15+ unidades). El pie dice "VALORES NETOS SIN IVA". Usa la columna "POR MAYOR NETO". No hay SKU numérico; genera un código corto desde el nombre del producto.' } },
  {
    nombre: 'NEO', slug: 'neo',
    config: { colSku: 'COD', colNombre: 'Descripción', colPrecio: 'Valor Neto' },
  },
  {
    nombre: 'ROMMEL', slug: 'rommel',
    config: { colSku: 'N°', colNombre: 'DESCRIPCION', colPrecio: 'VALOR' },
  },
  {
    nombre: 'SAFE PRO', slug: 'safe-pro',
    config: { colSku: 'Código', colNombre: 'Producto', colPrecio: 'Venta sobre 1MM', colUnidadesCaja: 'Und. por Caja' },
  },
  {
    nombre: 'SAN REMO', slug: 'san-remo',
    config: { colSku: 'Cod. Prov.', colNombre: 'Descripción', colPrecio: 'PRECIO  NETO UNIDAD', colMarca: 'Linea' },
  },
  { nombre: 'VIRUTEX', slug: 'virutex', config: { tipo: 'ia', hint: 'Archivo de lista de precios Virutex (LP CONSOLIDADA). Los encabezados reales están aproximadamente en la fila 8 del archivo; las primeras filas son metadata (RAZON SOCIAL, RUT, etc.). colSku="CÓDIGO", colNombre="DESCRIPCION PRODUCTO", colMarca="MARCA", colPrecio: columna con encabezado que contiene "LP UN" seguido del mes (ej: "LP UN.   SEPT", "LP UN. JUN") — precio lista unitario neto sin IVA. Ignorar columnas de stock, caja y descuento.' } },
  {
    nombre: 'GREEN WORLD CHILE', slug: 'green-world-chile',
    config: { tipo: 'ia' },
  },
];

// ── Proveedores alimentos ─────────────────────────────────────────────────────
const ALIMENTOS = [
  { nombre: '4M ALIMENTOS', slug: '4m-alimentos', config: { tipo: 'ia', hint: 'PDF con columnas: SKU (código largo alfanumérico, ej: 1111001102101), nombre del producto, "Precio neto" (precio NETO sin IVA — es la primera columna numérica y la más baja), "IVA", "Precio Bruto", "Neto Formato" (precio total del formato/caja), y "precio de venta Sugerido" (NO usar). Usar colPrecio="Precio neto" (precio unitario neto). El SKU es el código numérico largo al inicio de cada fila.' } },
  { nombre: 'CAMBIASO',     slug: 'cambiaso',     config: { tipo: 'cambiaso' } },
  { nombre: 'COLISEO',      slug: 'coliseo',      config: { tipo: 'ia', hint: 'Lista con 4 columnas de precio según volumen: "1 PALLET" (mínimo), "1/2 PALLET", "CAMADA" y "REPARTO SMALL" (máximo). Precios netos sin IVA. Usar la columna "REPARTO SMALL" (la última, más cara, para pedidos pequeños). Formato de precio: "1.180$" → 1180 (punto es miles, ignorar $). No hay SKU numérico; genera un código desde las palabras clave del nombre del producto.' } },
  {
    nombre: 'TRES MONTES', slug: 'tres-montes',
    config: { colSku: 'Cod. Material', colNombre: 'Material', colPrecio: 'Precio Neto x Unidad', colMarca: 'Marca' },
  },
];

async function main() {
  // ── Usuario admin por defecto ────────────────────────────────────────────────
  // Cambiar la contraseña desde el panel (Usuarios) después del primer login.
  const hash = await bcrypt.hash('Admin2026!', 10);
  await prisma.usuario.upsert({
    where:  { usuario: 'admin' },
    update: {},
    create: {
      nombre:   'Administrador',
      email:    'admin@chilenamayorista.cl',
      usuario:  'admin',
      password: hash,
      rol:      'admin',
    },
  });
  console.log('Admin seed: admin / Admin2026!');

  // ── Proveedores librería ────────────────────────────────────────────────────
  console.log(`\nInsertando ${LIBRERIA.length} proveedores de librería...`);
  for (const p of LIBRERIA) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: 'libreria', config: p.config },
      create: { nombre: p.nombre, slug: p.slug, tema: 'libreria', descuento: 0, config: p.config, activo: true },
    });
    console.log(`  ✓ ${result.nombre} (${result.slug})`);
  }

  // ── Proveedores aseo ────────────────────────────────────────────────────────
  console.log(`\nInsertando ${ASEO.length} proveedores de aseo...`);
  for (const p of ASEO) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: 'aseo', config: p.config },
      create: { nombre: p.nombre, slug: p.slug, tema: 'aseo', descuento: 0, config: p.config, activo: p.activo ?? true },
    });
    const estado = result.activo ? '✓' : '○ (inactivo)';
    console.log(`  ${estado} ${result.nombre} (${result.slug})`);
  }

  // ── Proveedores alimentos ────────────────────────────────────────────────────
  console.log(`\nInsertando ${ALIMENTOS.length} proveedores de alimentos...`);
  for (const p of ALIMENTOS) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: 'alimentos', config: p.config },
      create: { nombre: p.nombre, slug: p.slug, tema: 'alimentos', descuento: 0, config: p.config, activo: true },
    });
    console.log(`  ✓ ${result.nombre} (${result.slug})`);
  }

  // ── Regla de markup por defecto ─────────────────────────────────────────────
  await prisma.reglaMarkup.upsert({
    where:  { id: 'default' },
    update: {},
    create: {
      id:         'default',
      nombre:     'Markup general (default)',
      markupPct:  47,
      prioridad:  0,
      activa:     true,
    },
  });

  console.log(`\nSeed completado: ${LIBRERIA.length} librería + ${ASEO.length} aseo + ${ALIMENTOS.length} alimentos + 1 regla markup`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
