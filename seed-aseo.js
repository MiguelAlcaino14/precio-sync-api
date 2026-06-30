/**
 * Seed: inserta los 14 proveedores de aseo.
 * Usa upsert por slug → seguro de ejecutar múltiples veces.
 * Config tipo "ia" como fallback hasta analizar el Excel de cada uno.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROVEEDORES = [
  { nombre: 'BRILLEX',                 slug: 'brillex',          config: { tipo: 'ia' } },
  { nombre: 'CHIPRO',                  slug: 'chipro',           config: { tipo: 'ia' } },
  { nombre: 'ELITE',                   slug: 'elite',            config: { tipo: 'ia' } },
  { nombre: 'FIBRO',                   slug: 'fibro',            config: { tipo: 'ia' } },
  { nombre: 'IMPOEX',                  slug: 'impoex',           config: { tipo: 'ia' } },
  { nombre: 'LIBESA (Aseo)',           slug: 'libesa-aseo',      config: { tipo: 'ia' } },
  { nombre: 'LLABRES',                 slug: 'llabres',          config: { tipo: 'ia' } },
  { nombre: 'MGP',                     slug: 'mgp',              config: { tipo: 'ia' } },
  { nombre: 'NEO',                     slug: 'neo',              config: { tipo: 'ia' } },
  { nombre: 'ROMMEL',                  slug: 'rommel',           config: { tipo: 'ia' } },
  { nombre: 'SAFE PRO',                slug: 'safe-pro',         config: { tipo: 'ia' } },
  { nombre: 'SAN REMO',                slug: 'san-remo',         config: { tipo: 'ia' } },
  { nombre: 'VIRUTEX',                 slug: 'virutex',          config: { tipo: 'ia' } },
  {
    nombre: 'GREEN WORLD CHILE',
    slug:   'green-world-chile',
    config: { tipo: 'ia' },
    activo: false, // ⚠️ solo envía .ppt — no importable hasta que provean Excel/PDF
  },
];

async function main() {
  console.log(`Insertando ${PROVEEDORES.length} proveedores de ASEO...`);
  for (const p of PROVEEDORES) {
    const result = await prisma.proveedor.upsert({
      where:  { slug: p.slug },
      update: { nombre: p.nombre, tema: 'aseo', descuento: 0, config: p.config },
      create: { ...p, tema: 'aseo', descuento: 0, activo: p.activo ?? true },
    });
    const estado = result.activo ? '✓' : '○ (inactivo)';
    console.log(`  ${estado} ${result.nombre} (${result.slug})`);
  }
  console.log('Listo.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
