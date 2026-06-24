/**
 * Seed: inserta los 22 proveedores de librería con su config de parser.
 * Usa upsert por slug → seguro de ejecutar múltiples veces.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROVEEDORES = [
  // ── Parsers especiales ────────────────────────────────────────────────────
  {
    nombre: 'ACCO Brand',
    slug:   'acco-brand',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'acco-brand' },
  },
  {
    nombre: 'Carlos Gardy',
    slug:   'carlos-gardy',
    tema:   'libreria',
    descuento: 0, // col2 del Excel ya tiene el 10% de descuento aplicado
    config: { tipo: 'carlos-gardy' },
  },
  {
    nombre: 'ENGATEL',
    slug:   'engatel',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'engatel' },
  },
  {
    nombre: 'SCAI',
    slug:   'scai',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'scai' },
  },

  // ── PDF / IA (sin parser estructurado aún) ────────────────────────────────
  {
    nombre: 'Halley',
    slug:   'halley',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' }, // PDF → fallback IA hasta implementar PDF parser
  },
  {
    nombre: 'REM MAX',
    slug:   'rem-max',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' },
  },
  {
    nombre: 'TECNIGOM',
    slug:   'tecnigom',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' },
  },

  // ── IA (multi-hoja o estructura variable) ─────────────────────────────────
  {
    nombre: 'Demarka',
    slug:   'demarka',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' }, // multi-hoja con distintas marcas (Adetec, Lista, GlobosTe, Zebra)
  },
  {
    nombre: 'Devoto',
    slug:   'devoto',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' }, // nombre de hoja cambia con cada envío (fecha)
  },
  {
    nombre: 'Libesa',
    slug:   'libesa',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' }, // múltiples hojas; la hoja con precios varía
  },
  {
    nombre: 'Pronobel',
    slug:   'pronobel',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' }, // envía archivos separados (tecnología vs. librería)
  },
  {
    nombre: 'Teknofas',
    slug:   'teknofas',
    tema:   'libreria',
    descuento: 0,
    config: { tipo: 'ia' }, // precio por millar (no por unidad), requiere lógica especial
  },

  // ── Excel genérico (colSku / colNombre / colPrecio) ───────────────────────
  {
    nombre: 'Adioffice',
    slug:   'adioffice',
    tema:   'libreria',
    descuento: 0,
    // Hoja1, headers fila 7: GP | DESCRIPCIÓN | Vta. Min. | U X CAJA | CC
    // CC = precio negociado Castilla & Aragón
    config: { colSku: 'GP', colNombre: 'DESCRIPCIÓN', colPrecio: 'CC' },
  },
  {
    nombre: 'ARON',
    slug:   'aron',
    tema:   'libreria',
    descuento: 0, // "Neto Final $" ya incluye 12% descuento según nombre del archivo
    // headers fila 7: (blank) | CODIGO | DESCRIPCION ARTICULO | UNIDAD | PAQ | CAJA | PRECIO $ | Neto Final $
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION ARTICULO', colPrecio: 'Neto Final $' },
  },
  {
    nombre: 'Artel',
    slug:   'artel',
    tema:   'libreria',
    descuento: 0,
    // headers fila 0: Material | Codigo Barra | Cod. Proveedor | Descripcion | Mercado | Categoria | UnVta | Precio
    config: { colSku: 'Material', colNombre: 'Descripcion', colPrecio: 'Precio', colMarca: 'Categoria' },
  },
  {
    nombre: 'Diazol',
    slug:   'diazol',
    tema:   'libreria',
    descuento: 0,
    // headers fila 0: MATERIAL | ITEM | GLOSA | PRECIO
    config: { colSku: 'ITEM', colNombre: 'GLOSA', colPrecio: 'PRECIO' },
  },
  {
    nombre: 'FDS',
    slug:   'fds',
    tema:   'libreria',
    descuento: 0, // "NETO CON DCTO" ya tiene el descuento negociado
    // hoja "Nota de Pedido", headers fila 6: CÓDIGO | ARTÍCULO | MARCA | STOCK | PRECIO BASE | DSCTO | NETO CON DCTO | CANT. PEDIDO
    config: { colSku: 'CÓDIGO', colNombre: 'ARTÍCULO', colPrecio: 'NETO CON DCTO', colMarca: 'MARCA', hoja: 'Nota de Pedido' },
  },
  {
    nombre: 'IMEX',
    slug:   'imex',
    tema:   'libreria',
    descuento: 0, // "LPGOB c/Dcto. TO" ya tiene descuento aplicado
    // headers fila 6: CODIGO NUEVO | DESCRIPCIÓN | LPGOB | DESCUENTO TO | LPGOB c/Dcto. TO | LP SUMINISTRO | UNIDAD VENTA | UNIDAD MATRIZ
    config: { colSku: 'CODIGO NUEVO', colNombre: 'DESCRIPCIÓN', colPrecio: 'LPGOB c/Dcto. TO' },
  },
  {
    nombre: 'JM Azcorbebeitia',
    slug:   'jm-azcorbebeitia',
    tema:   'libreria',
    descuento: 0, // "COSTO CASTILLA" es el precio ya negociado para este cliente
    // headers fila 0: Código | Ean | Descripción | Stock | Precio Neto | COSTO CASTILLA | SuperFamilia | Familia
    config: { colSku: 'Código', colNombre: 'Descripción', colPrecio: 'COSTO CASTILLA', colBarras: 'Ean' },
  },
  {
    nombre: 'Offione',
    slug:   'offione',
    tema:   'libreria',
    descuento: 0,
    // hoja "STOCK", headers fila 0: CODIGO | DESCRIPCION | MARCA | UNIDADES | LLEGADAS | COSTOS | COMENTARIOS
    // Filas con COSTOS="CARO" o vacío se omiten automáticamente (no son número)
    config: { colSku: 'CODIGO', colNombre: 'DESCRIPCION', colPrecio: 'COSTOS', colMarca: 'MARCA', hoja: 'STOCK' },
  },
  {
    nombre: 'Torre',
    slug:   'torre',
    tema:   'libreria',
    descuento: 0,
    // hoja "BTS26", headers fila 1: Nº Set. | Sector | Cod. | Descripción Material | Codigo EAN | UMV | Uni Caja | Uni Pallet | NUEVO | ´PRECIO MAYORISTA ...
    // El acento en "´PRECIO MAYORISTA" lo normaliza el parser (strip leading non-letter)
    config: { colSku: 'Cod.', colNombre: 'Descripción Material', colPrecio: 'PRECIO MAYORISTA', colBarras: 'Codigo EAN', hoja: 'BTS26' },
  },
  {
    nombre: 'Vieri',
    slug:   'vieri',
    tema:   'libreria',
    descuento: 0,
    // hoja "Hoja1", headers fila 5: SÚPERFAMILIA | SKU | DESCRIPCIÓN | INNER | NETO 01P | STOCK
    config: { colSku: 'SKU', colNombre: 'DESCRIPCIÓN', colPrecio: 'NETO 01P', colMarca: 'SÚPERFAMILIA' },
  },
];

async function main() {
  console.log(`Insertando ${PROVEEDORES.length} proveedores...`);
  for (const p of PROVEEDORES) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: p.tema, descuento: p.descuento, config: p.config },
      create: { ...p, activo: true },
    });
    console.log(`  ${result.activo ? '✓' : '○'} ${result.nombre} (${result.slug})`);
  }
  console.log('Listo.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
