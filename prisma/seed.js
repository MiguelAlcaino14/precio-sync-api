const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ── Proveedores librería ──────────────────────────────────────────────────────
const LIBRERIA = [
  // Parsers especiales
  { nombre: 'ACCO Brand',      slug: 'acco-brand',   config: { tipo: 'acco-brand' } },
  { nombre: 'Carlos Gardy',    slug: 'carlos-gardy', config: { tipo: 'ia' } },
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
  {
    nombre: 'Pronobel', slug: 'pronobel',
    config: { colSku: 'Material', colNombre: 'Texto breve material', colPrecio: 'CASTILLA Y ARAGON', colMarca: 'Marca', colBarras: 'BARRAS' },
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
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION ARTICULO', colPrecio: 'NETO FINAL' },
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
    config: { colSku: 'Código', colNombre: 'Descripción', colPrecio: 'Precio Neto', colBarras: 'Ean', colMarca: 'SuperFamilia' },
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
    nombre: 'Torre y Colón', slug: 'torre-colon',
    config: {
      tipo: 'xlsx', hoja: 0,
      colSku: 'Cod.', colPrecio: 'PRECIO MAYORISTA',
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
  { nombre: 'CHIPRO',            slug: 'chipro',          config: { tipo: 'ia' } },
  { nombre: 'DURANDIN',          slug: 'durandin',        config: { tipo: 'ia' } },
  { nombre: 'ELITE',             slug: 'elite',           config: { tipo: 'ia' } },
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
  { nombre: 'LLABRES',           slug: 'llabres',         config: { tipo: 'ia' } },
  {
    nombre: 'MGP', slug: 'mgp',
    config: { tipo: 'ia' },
  },
  {
    nombre: 'NEO', slug: 'neo',
    config: { colSku: 'COD', colNombre: 'Descripción', colPrecio: 'Valor Neto' },
  },
  {
    nombre: 'ROMMEL', slug: 'rommel',
    config: { colSku: 'N°', colNombre: 'DESCRIPCION', colPrecio: 'VALOR' },
  },
  { nombre: 'SAFE PRO',          slug: 'safe-pro',        config: { tipo: 'ia' } },
  { nombre: 'SAN REMO',          slug: 'san-remo',        config: { tipo: 'ia' } },
  { nombre: 'VIRUTEX',           slug: 'virutex',         config: { tipo: 'ia' } },
  {
    nombre: 'GREEN WORLD CHILE', slug: 'green-world-chile',
    config: { tipo: 'ia' },
  },
];

// ── Proveedores alimentos ─────────────────────────────────────────────────────
const ALIMENTOS = [
  { nombre: '4M ALIMENTOS', slug: '4m-alimentos', config: { tipo: 'ia' } },
  { nombre: 'CAMBIASO',     slug: 'cambiaso',     config: { tipo: 'ia' } },
  { nombre: 'COLISEO',      slug: 'coliseo',      config: { tipo: 'ia' } },
  {
    nombre: 'TRES MONTES', slug: 'tres-montes',
    config: { colSku: 'Cod. Material', colNombre: 'Material', colPrecio: 'Precio x unidad (Fórmula)', colMarca: 'Marca' },
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
