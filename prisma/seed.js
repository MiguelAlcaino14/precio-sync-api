const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const { recalcularDescuento } = require('../src/services/markup.service');

// ── Proveedores librería ──────────────────────────────────────────────────────
const LIBRERIA = [
  // Parsers especiales
  { nombre: 'ACCO Brand',      slug: 'acco-brand',   config: { tipo: 'acco-brand' } },
  { nombre: 'Carlos Gardy',    slug: 'carlos-gardy', config: { tipo: 'ia', hint: 'Listado con dos columnas de precio: "PRECIO" (precio lista) y "Precio con Descuento" (precio real). Usa siempre la columna "Precio con Descuento". Los precios son netos sin IVA. Formato: "$320" → 320 (ignorar $). No hay SKU numérico; genera un código corto desde las primeras palabras del nombre del producto.' } },
  { nombre: 'ENGATEL',         slug: 'engatel',      driveFolderId: '1fzubbLPBgD0z1DHJOKR27_AOq3ggqJVV', config: { tipo: 'engatel' } },
  { nombre: 'SCAI',            slug: 'scai',         driveFolderId: '1ta5map_1F_h_HRj9Jml_5DGPJXuLfFZ4', config: { tipo: 'scai' } },

  // PDF / IA
  { nombre: 'Halley',   slug: 'halley',   driveFolderId: '1jacb2M3l4VsRr9mJBvBXaJYemjEBtO4-', config: { tipo: 'ia', hint: 'El encabezado dice "VALORES MAS IVA", lo que significa que los precios listados YA INCLUYEN IVA. Divide cada precio por 1.19 para obtener el precio neto. Formato de precio: "$755" → divide por 1.19 → 635 neto. No hay SKU numérico; genera un código corto desde las primeras palabras del nombre del producto.' } },
  { nombre: 'REM MAX',  slug: 'rem-max',  config: {} },
  { nombre: 'TECNIGOM', slug: 'tecnigom', driveFolderId: '1UL9yv58kaTEmbUubH4bI3fz9i4W3pYOl', config: { tipo: 'ia', hint: 'Catálogo en formato de bloques (no tabular). Cada producto tiene: "COD. XXXXXX" (SKU), "PRECIO: $ YYY" (precio unitario neto sin IVA), y un nombre de producto en el bloque. Extrae el SKU del campo "COD.", el precio del campo "PRECIO:", y el nombre del encabezado del bloque o línea descriptiva.' } },

  // IA (multi-hoja o estructura variable)
  {
    nombre: 'Demarka', slug: 'demarka',
    config: { tipo: 'ia', hint: 'Lista de precios con múltiples hojas por categoría (ej: Adetec, GlobosTe, Zebra). En cada hoja: colSku es el código alfanumérico del producto, colNombre es la descripción, colPrecio es el precio neto sin IVA. Algunos formatos tienen el precio como "0.15 (c/IVA)" — en ese caso dividir por 1.19.' },
  },
  {
    nombre: 'Devoto', slug: 'devoto',
    config: { configs: [
      { hoja: 'auto', colSku: 'CÓDIGO', colNombre: 'DESCRIPCIÓN', colPrecio: 'PRECIO', colBarras: 'BARRAS' },
    ], hint: 'El archivo tiene varias hojas; la hoja con precios tiene nombre de fecha (ej: "JUEVES 02-04"). En esa hoja la primera fila es un título ("LISTA DE PRECIOS...") y la segunda fila tiene los encabezados: BARRAS, CÓDIGO, DESCRIPCIÓN, ÍTEM, PRECIO. colSku="CÓDIGO", colNombre="DESCRIPCIÓN", colPrecio="PRECIO". Ignorar hojas de stock (tienen columnas "En stock", "Picking", "Disponible" pero sin precio).' },
  },
  {
    nombre: 'Libesa', slug: 'libesa',
    config: { configs: [
      { colSku: 'Descripción', colNombre: 'Lote Venta',   colPrecio: ['NUEVO PRECIO LICITACION', 'P. LICITACIÓN', 'P. NETO ANTERIOR', 'Precio Neto'], colMarca: 'Marca' },
      { colSku: 'Código',      colNombre: 'Descripción',  colPrecio: 'Precio Neto' },
      { colSku: 'Código',      colNombre: 'Descripción',  colPrecio: 'Precio', hoja: 0 },
    ], hint: 'Lista de precios Libesa. Puede ser formato licitaciones (SKU en columna "Descripción", nombre en "Lote Venta") o formato aseo (SKU en "Código", nombre en "Descripción"). Precio neto sin IVA, en CLP. Ignorar filas con errores (#ERROR!) o precio 0. Extraer solo filas con SKU, nombre y precio válidos.' },
  },
  {
    nombre: 'Pronobel', slug: 'pronobel',
    config: { configs: [
      { colSku: 'CODIGO',   colNombre: 'Texto breve material', colPrecio: 'FINAL NETO',                              colMarca: 'Marca', colBarras: 'BARRAS', colUnidadesCaja: 'SUB', colUnidadesPallet: 'EMB' },
      { colSku: 'Material', colNombre: 'Texto breve material', colPrecio: ['CASTILLA Y ARAGON', 'CASTILLA ARAGON'],  colMarca: 'Marca', colBarras: 'BARRAS', colUnidadesCaja: 'SUB', colUnidadesPallet: 'EMB' },
      { colSku: 'CODIGO',   colNombre: 'DESCRIPCION',          colPrecio: '$ NETO',                                 colBarras: 'BARRAS', colUnidadesCaja: 'SUB', colUnidadesPallet: 'EMB' },
    ] },
  },
  {
    nombre: 'Teknofas', slug: 'teknofas',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'Precio unit.', colUnidadesCaja: 'UNID X CAJA' },
  },

  // Excel genérico
  {
    nombre: 'Adioffice', slug: 'adioffice',
    config: { colSku: 'GP', colNombre: 'DESCRIPCIÓN', colPrecio: 'CC', colUnidadesCaja: 'U X CAJA' },
  },
  {
    nombre: 'ARON', slug: 'aron',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION ARTICULO', colPrecio: 'NETO FINAL', colUnidadesCaja: 'CAJA' },
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
    config: { configs: [
      { hoja: 0,       colSku: 'CÓDIGO',  colNombre: 'ARTÍCULO',    colPrecio: 'NETO CON DCTO', colMarca: 'MARCA' },
      { hoja: 'Hoja1', colSku: 'CODIGO',  colNombre: 'DESCRIPCION', colPrecio: 'LISTA PRECIO' },
      { hoja: 0,       colSku: 'CODIGO',  colNombre: 'DESCRIPCION', colPrecio: 'Precio Final' },
      { hoja: 0,       colSku: 'CODIGO',  colNombre: 'DESCRIPCION', colPrecio: 'LISTA PRECIO' },
    ] },
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
    driveFolderId: '1-TyhEGfBhwaAxqbVeAXPK_NSKhGdgMg3',
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'Costo Neto', hoja: 'LISTA GRAL' },
  },
  {
    nombre: 'Vieri', slug: 'vieri',
    config: { colSku: 'SKU', colNombre: 'DESCRIPCIÓN', colPrecio: 'NETO 01P', colMarca: 'SÚPERFAMILIA', colUnidadesCaja: 'INNER' },
  },

  // Configs detalladas (xlsx con precioIncluyeIVA)
  {
    nombre: 'TORRE', slug: 'torre-colon',
    config: {
      tipo: 'xlsx', hoja: 0,
      colSku: 'Cod.', colPrecio: ['PVC MAYORISTA', 'PRECIO MAYORISTA'],
      colNombre: 'Descripción Material', colMarca: 'Sector',
      colUnidadesCaja: 'Uni Caja', colUnidadesPallet: 'Uni Pallet',
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
  {
    nombre: 'CHIPRO', slug: 'chipro',
    config: {
      configs: [{ colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'Crédito' }],
      hint: 'Lista CHIPRO con múltiples filas de encabezado. Fila principal: DESCRIPCION, CODIGO. Los precios aparecen en columnas "Crédito" y "Prepago (retira)" bajo la sección "(Todas las regiones)". Usar columna "Crédito" como precio neto sin IVA. SKU=CODIGO, nombre=DESCRIPCION.',
    },
  },
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
    config: { configs: [
      { colSku: 'CODIGO', colNombre: 'DESCRIPCIÓN', colPrecio: 'L1 Neto', colMarca: 'MARCA', colBarras: 'EAN', colUnidadesCaja: 'CAP' },
      { colSku: 'CODIGO', colNombre: 'DESCRIPCIÓN', colPrecio: 'L1',      colMarca: 'MARCA', colBarras: 'EAN', colUnidadesCaja: 'CAP' },
    ] },
  },
  {
    nombre: 'IMPOEX (WAYS)', slug: 'impoex',
    config: { colSku: 'N° SAP', colNombre: 'DESCRIPCION', colPrecio: 'COSTO CASTILLA', colMarca: 'MARCA' },
  },
  { nombre: 'LLABRES', slug: 'llabres', driveFolderId: '1hDh8hkdJ8IsDffBluWGrghsSONp_RpiH', config: { tipo: 'ia', hint: 'PDF bien estructurado con columnas: SKU corto (ej: DEP1, MUH2), Descripción, "$ Neto" (precio neto sin IVA). Los precios usan coma como separador de miles (ej: "$5,621" = 5621 pesos, no 5.621). Tomar el número ignorando "$" y coma de miles.' } },
  { nombre: 'MGP', slug: 'mgp', config: { tipo: 'ia', hint: 'Lista con tres columnas de precio: "PRECIO NORMAL NETO", "POR MAYOR NETO" (desde 4 unidades), "PRECIO X CANTIDAD NETO" (desde 15+ unidades). El pie dice "VALORES NETOS SIN IVA". Usa la columna "POR MAYOR NETO". No hay SKU numérico; genera un código corto desde el nombre del producto.' } },
  {
    nombre: 'NEO', slug: 'neo',
    config: { colSku: 'COD', colNombre: 'Descripción', colPrecio: 'Valor Neto' },
  },
  {
    nombre: 'ROMMEL', slug: 'rommel',
    config: { tipo: 'rommel', colSku: 'N°', colNombre: 'DESCRIPCION', colPrecio: 'VALOR' },
  },
  {
    nombre: 'SAFE PRO (TARZIJAN Y MR. ROB)', slug: 'safe-pro',
    config: { colSku: 'Código', colNombre: 'Producto', colPrecio: 'Venta sobre 1MM', colUnidadesCaja: 'Und. por Caja' },
  },
  {
    nombre: 'SAN REMO', slug: 'san-remo',
    config: { colSku: 'Cod. Prov.', colNombre: 'Descripción', colPrecio: 'PRECIO  NETO UNIDAD', colMarca: 'Linea' },
  },
  {
    nombre: 'VIRUTEX', slug: 'virutex',
    config: {
      configs: [
        { colSku: 'SKU Virutex', colNombre: 'Descripción Virutex', colPrecio: 'Precio CM', colMarca: 'Marca' },
      ],
      hint: 'Archivo LP CONSOLIDADA Virutex. Encabezados en fila ~8 (primeras filas son metadata). colSku="CÓDIGO", colNombre="DESCRIPCION PRODUCTO", colMarca="MARCA", colPrecio: columna cuyo encabezado contiene "LP UN" seguido del mes (ej: "LP UN. SEPT", "LP UN. JUN") — precio lista unitario neto sin IVA. Ignorar columnas de stock, caja y descuento.',
    },
  },
  {
    nombre: 'GREEN WORLD CHILE (WINNEX)', slug: 'green-world-chile',
    driveFolderId: '1Zx1dbm5Xtmk4SVjQiYR_CV2Wm',
    config: { tipo: 'winnex' },
  },
];

// ── Proveedores alimentos ─────────────────────────────────────────────────────
const ALIMENTOS = [
  { nombre: '4M ALIMENTOS', slug: '4m-alimentos', config: { tipo: 'ia', hint: 'PDF con columnas: SKU (código largo alfanumérico, ej: 1111001102101), nombre del producto, "Precio neto" (precio NETO sin IVA — es la primera columna numérica y la más baja), "IVA", "Precio Bruto", "Neto Formato" (precio total del formato/caja), y "precio de venta Sugerido" (NO usar). Usar colPrecio="Precio neto" (precio unitario neto). El SKU es el código numérico largo al inicio de cada fila.' } },
  { nombre: 'CAMBIASO',     slug: 'cambiaso',     config: { tipo: 'cambiaso' } },
  { nombre: 'COLISEO',      slug: 'coliseo',      config: { tipo: 'ia', hint: 'Lista con 4 columnas de precio según volumen: "1 PALLET" (mínimo), "1/2 PALLET", "CAMADA" y "REPARTO SMALL" (máximo). Precios netos sin IVA. Usar la columna "REPARTO SMALL" (la última, más cara, para pedidos pequeños). Formato de precio: "1.180$" → 1180 (punto es miles, ignorar $). No hay SKU numérico; genera un código desde las palabras clave del nombre del producto.' } },
  {
    nombre: 'TRES MONTES', slug: 'tres-montes',
    config: { colSku: 'Cod. Material', colNombre: 'Material', colPrecio: 'Precio Neto x Unidad', colMarca: 'Marca', colUnidadesCaja: 'Q. Unidad x Caja' },
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
      update: { nombre: p.nombre, tema: 'libreria', config: p.config, ...(p.driveFolderId !== undefined ? { driveFolderId: p.driveFolderId } : {}) },
      create: { nombre: p.nombre, slug: p.slug, tema: 'libreria', descuento: 0, config: p.config, activo: true, driveFolderId: p.driveFolderId ?? null },
    });
    console.log(`  ✓ ${result.nombre} (${result.slug})`);
  }

  // ── Proveedores aseo ────────────────────────────────────────────────────────
  console.log(`\nInsertando ${ASEO.length} proveedores de aseo...`);
  for (const p of ASEO) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: 'aseo', config: p.config, ...(p.driveFolderId !== undefined ? { driveFolderId: p.driveFolderId } : {}) },
      create: { nombre: p.nombre, slug: p.slug, tema: 'aseo', descuento: 0, config: p.config, activo: p.activo ?? true, driveFolderId: p.driveFolderId ?? null },
    });
    const estado = result.activo ? '✓' : '○ (inactivo)';
    console.log(`  ${estado} ${result.nombre} (${result.slug})`);
  }

  // ── Proveedores alimentos ────────────────────────────────────────────────────
  console.log(`\nInsertando ${ALIMENTOS.length} proveedores de alimentos...`);
  for (const p of ALIMENTOS) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: 'alimentos', config: p.config, ...(p.driveFolderId !== undefined ? { driveFolderId: p.driveFolderId } : {}) },
      create: { nombre: p.nombre, slug: p.slug, tema: 'alimentos', descuento: 0, config: p.config, activo: true, driveFolderId: p.driveFolderId ?? null },
    });
    console.log(`  ✓ ${result.nombre} (${result.slug})`);
  }

  // ── Descuentos base sobre el costo ──────────────────────────────────────────
  // REM MAX y HALLEY aplican un descuento de base (el resto ya lo trae incluido).
  // Set-once: solo se aplica si el descuento sigue en 0 (nunca modificado desde el panel),
  // así un re-seed no pisa cambios hechos a mano. Al aplicarlo, recalcula los costos
  // de los productos ya importados (genera cambios pendientes, igual que el panel).
  const DESCUENTOS_BASE = { 'rem-max': 20, 'halley': 5 };
  for (const [slug, desc] of Object.entries(DESCUENTOS_BASE)) {
    const prov = await prisma.proveedor.findUnique({ where: { slug } });
    if (prov && (prov.descuento ?? 0) === 0) {
      await prisma.proveedor.update({ where: { slug }, data: { descuento: desc } });
      const recalc = await recalcularDescuento(prov.id, 0, desc);
      console.log(`\nDescuento base ${slug}: ${desc}% aplicado (${recalc} costos recalculados)`);
    } else if (prov) {
      console.log(`\nDescuento base ${slug}: omitido (ya tiene ${prov.descuento}%, no se pisa)`);
    }
  }

  // ── Migración: libesa-aseo → libesa ─────────────────────────────────────────
  const libesaAseo = await prisma.proveedor.findUnique({ where: { slug: 'libesa-aseo' } });
  const libesa     = await prisma.proveedor.findUnique({ where: { slug: 'libesa' } });
  if (libesaAseo && libesa) {
    const movidos = await prisma.producto.updateMany({
      where: { proveedorId: libesaAseo.id },
      data:  { proveedorId: libesa.id },
    });
    await prisma.proveedor.update({
      where: { slug: 'libesa-aseo' },
      data:  { activo: false },
    });
    console.log(`\nMigración LIBESA: ${movidos.count} productos libesa-aseo → libesa (libesa-aseo desactivado)`);
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
