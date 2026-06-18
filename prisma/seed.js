const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Proveedor: Castilla y Aragón — archivo: LP CONSOLIDADA CASTILLA&ARAGÓN NOV_25.xlsx
  const castillaConfig = {
    tipo: 'xlsx',
    hoja: 0,
    colSku: 'CÓDIGO',
    colPrecio: 'P. FINAL UN. NETO',
    colNombre: 'DESCRIPCION PRODUCTO',
    colMarca: 'MARCA',
    colBarras: 'EAN',
    precioIncluyeIVA: false,
  };
  const castilla = await prisma.proveedor.upsert({
    where: { slug: 'castilla-aragon' },
    update: { config: castillaConfig },
    create: { nombre: 'Castilla y Aragón', slug: 'castilla-aragon', config: castillaConfig },
  });

  // Proveedor: Torre y Colón — archivo: PRECIOS ACTUALIZADOS TORRE Y COLON BTS26M.xlsx
  const torreConfig = {
    tipo: 'xlsx',
    hoja: 0,
    colSku: 'Cod.',
    colPrecio: 'PRECIO MAYORISTA',
    colNombre: 'Descripción Material',
    colMarca: 'Sector',
    precioIncluyeIVA: false,
  };
  const torre = await prisma.proveedor.upsert({
    where: { slug: 'torre-colon' },
    update: { config: torreConfig },
    create: { nombre: 'Torre y Colón', slug: 'torre-colon', config: torreConfig },
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

  // Proveedor: Proarte
  const proarte = await prisma.proveedor.upsert({
    where: { slug: 'proarte' },
    update: {},
    create: {
      nombre: 'Proarte',
      slug: 'proarte',
      config: {
        tipo: 'xlsx',
        hoja: 'GENERAL 2024 - 2025',
        colSku: 'Código',
        colPrecio: 'Precio',
        colNombre: 'Descripción',
        colBarras: 'Código de Barra',
        precioIncluyeIVA: false,
        factorIVA: 1.19,
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

  console.log('Seed completado:', { castilla: castilla.id, torre: torre.id, hinzquin: hinzquin.id, proarte: proarte.id });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
