const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ── Proveedores librería ──────────────────────────────────────────────────────
const LIBRERIA = [
  // Parsers especiales
  { nombre: 'ACCO Brand',      slug: 'acco-brand',   config: { tipo: 'acco-brand' } },
  { nombre: 'Carlos Gardy',    slug: 'carlos-gardy', config: { tipo: 'carlos-gardy' } },
  { nombre: 'ENGATEL',         slug: 'engatel',      config: { tipo: 'engatel' } },
  { nombre: 'SCAI',            slug: 'scai',         config: { tipo: 'scai' } },

  // PDF / IA
  { nombre: 'Halley',   slug: 'halley',   config: { tipo: 'ia' } },
  { nombre: 'REM MAX',  slug: 'rem-max',  config: { tipo: 'ia' } },
  { nombre: 'TECNIGOM', slug: 'tecnigom', config: { tipo: 'ia' } },

  // IA (multi-hoja o estructura variable)
  { nombre: 'Demarka',  slug: 'demarka',  config: { tipo: 'ia' } },
  { nombre: 'Devoto',   slug: 'devoto',   config: { tipo: 'ia' } },
  { nombre: 'Libesa',   slug: 'libesa',   config: { tipo: 'ia' } },
  { nombre: 'Pronobel', slug: 'pronobel', config: { tipo: 'ia' } },
  { nombre: 'Teknofas', slug: 'teknofas', config: { tipo: 'ia' } },

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
    config: { colSku: 'CÓDIGO', colNombre: 'ARTÍCULO', colPrecio: 'NETO CON DCTO', colMarca: 'MARCA', hoja: 'Nota de Pedido' },
  },
  {
    nombre: 'IMEX', slug: 'imex',
    config: { colSku: 'CODIGO NUEVO', colNombre: 'DESCRIPCIÓN', colPrecio: 'LPGOB c/Dcto. TO' },
  },
  {
    nombre: 'JM Azcorbebeitia', slug: 'jm-azcorbebeitia',
    config: { colSku: 'Código', colNombre: 'Descripción', colPrecio: 'COSTO CASTILLA', colBarras: 'Ean' },
  },
  {
    nombre: 'Offione', slug: 'offione',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'COSTOS', colMarca: 'MARCA', hoja: 'STOCK' },
  },
  {
    nombre: 'Vieri', slug: 'vieri',
    config: { colSku: 'SKU', colNombre: 'DESCRIPCIÓN', colPrecio: 'NETO 01P', colMarca: 'SÚPERFAMILIA' },
  },

  // Configs detalladas (xlsx con precioIncluyeIVA)
  {
    nombre: 'Castilla y Aragón', slug: 'castilla-aragon',
    config: {
      tipo: 'xlsx', hoja: 0,
      colSku: 'CÓDIGO', colPrecio: 'P. FINAL UN. NETO',
      colNombre: 'DESCRIPCION PRODUCTO', colMarca: 'MARCA', colBarras: 'EAN',
      precioIncluyeIVA: false,
    },
  },
  {
    nombre: 'Torre y Colón', slug: 'torre-colon',
    config: {
      tipo: 'xlsx', hoja: 0,
      colSku: 'Cod.', colPrecio: 'PRECIO MAYORISTA',
      colNombre: 'Descripción Material', colMarca: 'Sector',
      precioIncluyeIVA: false,
    },
  },
  {
    nombre: 'Hinzquin', slug: 'hinzquin',
    config: {
      tipo: 'pdf',
      patronCodigo: '^\\d{6,7}',
      precioIncluyeIVA: false,
      factorIVA: 1.19,
      separadorMiles: '.',
    },
  },
  {
    nombre: 'Proarte', slug: 'proarte',
    config: {
      tipo: 'xlsx',
      hoja: 'GENERAL 2024 - 2025',
      colSku: 'Código', colPrecio: 'Precio',
      colNombre: 'Descripción', colBarras: 'Código de Barra',
      precioIncluyeIVA: false,
      factorIVA: 1.19,
    },
  },
];

// ── Proveedores aseo ──────────────────────────────────────────────────────────
const ASEO = [
  { nombre: 'BRILLEX',           slug: 'brillex',         config: { tipo: 'ia' } },
  { nombre: 'CHIPRO',            slug: 'chipro',          config: { tipo: 'ia' } },
  { nombre: 'ELITE',             slug: 'elite',           config: { tipo: 'ia' } },
  { nombre: 'FIBRO',             slug: 'fibro',           config: { tipo: 'ia' } },
  { nombre: 'IMPOEX',            slug: 'impoex',          config: { tipo: 'ia' } },
  { nombre: 'LIBESA (Aseo)',     slug: 'libesa-aseo',     config: { tipo: 'ia' } },
  { nombre: 'LLABRES',           slug: 'llabres',         config: { tipo: 'ia' } },
  { nombre: 'MGP',               slug: 'mgp',             config: { tipo: 'ia' } },
  { nombre: 'NEO',               slug: 'neo',             config: { tipo: 'ia' } },
  { nombre: 'ROMMEL',            slug: 'rommel',          config: { tipo: 'ia' } },
  { nombre: 'SAFE PRO',          slug: 'safe-pro',        config: { tipo: 'ia' } },
  { nombre: 'SAN REMO',          slug: 'san-remo',        config: { tipo: 'ia' } },
  { nombre: 'VIRUTEX',           slug: 'virutex',         config: { tipo: 'ia' } },
  {
    nombre: 'GREEN WORLD CHILE', slug: 'green-world-chile',
    config: { tipo: 'ia' },
    activo: false, // solo envía .ppt — no importable hasta que provean Excel/PDF
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

  console.log(`\nSeed completado: ${LIBRERIA.length} librería + ${ASEO.length} aseo + 1 regla markup`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
