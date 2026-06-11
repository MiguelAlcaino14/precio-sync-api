const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Proveedor: Castilla y Aragón
  const castilla = await prisma.proveedor.upsert({
    where: { slug: 'castilla-aragon' },
    update: {},
    create: {
      nombre: 'Castilla y Aragón',
      slug: 'castilla-aragon',
      config: {
        tipo: 'xlsx',
        hoja: 0,
        colSku: 'CODIGO',
        colPrecio: 'FINAL NETO',
        colNombre: 'Texto breve material',
        colMarca: 'Marca',
        colBarras: 'BARRAS',
        precioIncluyeIVA: false,
        separadorMiles: '.',
      },
    },
  });

  // Proveedor: Torre y Colón
  const torre = await prisma.proveedor.upsert({
    where: { slug: 'torre-colon' },
    update: {},
    create: {
      nombre: 'Torre y Colón',
      slug: 'torre-colon',
      config: {
        tipo: 'xlsx',
        hoja: 0,
        colSku: 'Cod.',
        colPrecio: 'PRECIO MAYORISTA',
        colNombre: 'Descripción Material',
        colMarca: 'Sector',
        precioIncluyeIVA: false,
        separadorMiles: '.',
        simboloPeso: true,
      },
    },
  });

  // Proveedor: Hinzquin
  const hinzquin = await prisma.proveedor.upsert({
    where: { slug: 'hinzquin' },
    update: {},
    create: {
      nombre: 'Hinzquin',
      slug: 'hinzquin',
      config: {
        tipo: 'pdf',
        patronCodigo: '^\\d{6,7}',
        precioIncluyeIVA: false,
        factorIVA: 1.19,
        separadorMiles: '.',
      },
    },
  });

  // Regla de markup por defecto (aplica a todo)
  await prisma.reglaMarkup.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      nombre: 'Markup general (default)',
      markupPct: 47,
      prioridad: 0,
      activa: true,
    },
  });

  console.log('Seed completado:', { castilla: castilla.id, torre: torre.id, hinzquin: hinzquin.id });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
