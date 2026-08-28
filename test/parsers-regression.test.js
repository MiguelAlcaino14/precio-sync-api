process.env.OPENAI_API_KEY ||= 'test-key';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { parsearArchivo } = require('../src/parsers');

const files = {
  jm: 'C:/Users/Percy Rojas/Downloads/JM IMPORT_LIBRERIA_PRECIO JULIO 2026.xlsx',
  teknofas: 'C:/Users/Percy Rojas/Downloads/TEKNOFAS_SOBRES_PRECIO FEBRERO 2025.xls',
  adioffice: 'C:/Users/Percy Rojas/Downloads/ADIOFFICE_LIBRERIA_PRECIO-JUNIO 2026.xlsx',
  rhein: 'C:/Users/Percy Rojas/Downloads/RHEIN_LIBRERIA_PRECIO 2026.xlsx',
  maxell: 'C:/Users/Percy Rojas/Downloads/MAXELL_TECNO_PRECIO AGOSTO 2026.xlsx',
  rem: 'C:/Users/Percy Rojas/Downloads/REM_LIBRERIA_PRECIO 2026.xlsx',
  torre: 'C:/Users/Percy Rojas/Downloads/TORRE_LIBRERIA_PRECIO JUNIO 2026.xlsx',
  libesa: 'C:/Users/Percy Rojas/Downloads/LIBESA_LIBRERIA_PRECIO MAYO 2026.xlsx',
  pronobelLib: 'C:/Users/Percy Rojas/Downloads/PRONOBEL_LIBRERIA_PRECIO ENERO 2026.xlsx',
  pronobelTec: 'C:/Users/Percy Rojas/Downloads/PRONOBEL_TECNOLOGIA_PRECIO MARZO 2026.xlsx',
};

const missingFiles = Object.values(files).filter(file => !fs.existsSync(file));
const regressionTest = missingFiles.length
  ? (name, fn) => test.skip(`${name} (faltan fixtures locales de proveedores)`, fn)
  : test;

function read(file) {
  return fs.readFileSync(file);
}

function bySku(productos, sku) {
  return productos.find(p => p.sku === sku);
}

function assertClean(productos) {
  assert.equal(productos.filter(p => !p.sku || !p.nombre || p.costo == null).length, 0);
  assert.equal(productos.filter(p => /^cod(igo)?$/i.test(String(p.sku))).length, 0);
  assert.equal(productos.filter(p => /^familia:/i.test(String(p.sku))).length, 0);
}

regressionTest('JM usa la columna de costo con descuento', async () => {
  const { productos } = await parsearArchivo(read(files.jm), 'xlsx', {
    colSku: 'Código',
    colNombre: 'Descripción',
    colPrecio: 'PRECIO CON DCTO 20%',
    colBarras: 'Ean',
    colMarca: 'SuperFamilia',
  }, 'jm-azcorbebeitia');

  assert.equal(productos.length, 8425);
  assert.equal(bySku(productos, 'ACCOBEI001').costo, 920);
  assertClean(productos);
});

regressionTest('Teknofas ignora filas de seccion, encabezados repetidos y productos sin costo', async () => {
  const { productos } = await parsearArchivo(read(files.teknofas), 'xls', {
    tipo: 'teknofas',
    colSku: 'CODIGO',
    colNombre: 'DESCRIPCION',
    colPrecio: 'Precio unit.',
    colUnidadesCaja: 'UNID X CAJA',
  }, 'teknofas');

  assert.equal(productos.length, 21);
  assert.equal(bySku(productos, '145002').costo, 24.675);
  assert.equal(bySku(productos, '145004'), undefined);
  assertClean(productos);
});

regressionTest('Adioffice ignora familias y redondea costos mostrados en pesos', async () => {
  const { productos } = await parsearArchivo(read(files.adioffice), 'xlsx', {
    tipo: 'adioffice',
    colSku: 'GP',
    colNombre: 'DESCRIPCIÓN',
    colPrecio: 'CC',
    colUnidadesCaja: 'U X CAJA',
  }, 'adioffice');

  assert.equal(productos.length, 771);
  assert.equal(bySku(productos, 'ABGF901002').costo, 758);
  assert.equal(bySku(productos, 'DESTACADORES COLOR 601'), undefined);
  assertClean(productos);
});

regressionTest('Rhein combina CUADERNOS, ESCOLAR y OFICINA usando la columna de costo de cada hoja', async () => {
  const { productos } = await parsearArchivo(read(files.rhein), 'xlsx', {
    tipo: 'rhein',
    hoja: 'auto',
    colSku: 'COD',
    colNombre: 'DESCRIPCIÓN',
    colPrecio: ['C Y A', 'COSTO C Y A', 'COSTO CYA'],
    colMarca: 'MARCA',
    colBarras: 'BARRAS',
    colUnidadesCaja: 'SUB',
    colUnidadesPallet: 'EMB',
  }, 'rhein');

  assert.equal(productos.length, 269);
  assert.equal(bySku(productos, '552311').costo, 690);
  assert.equal(bySku(productos, '551369').costo, 876);
  assert.equal(bySku(productos, '80003671').costo, 1290);
  assertClean(productos);
});

regressionTest('Maxell rellena valores de celdas combinadas y omite encabezados de bloque', async () => {
  const { productos } = await parsearArchivo(read(files.maxell), 'xlsx', {
    tipo: 'maxell',
    colSku: 'COD',
    colNombre: 'DESCRIPCIÓN',
    colPrecio: 'PRECIO NETO',
    colBarras: 'CÓDIGO DE BARRA',
    colUnidadesCaja: 'SUB MASTER',
    colUnidadesPallet: 'MASTER',
  }, 'maxell');

  assert.equal(productos.length, 111);
  assert.equal(bySku(productos, 'IN-BAX MIC WHITE').costo, 900);
  assert.equal(bySku(productos, 'IN-BAX MIC BLACK').costo, 900);
  assert.equal(bySku(productos, 'COD'), undefined);
  assertClean(productos);
});

regressionTest('REM usa precio con descuento y omite filas Familia', async () => {
  const { productos } = await parsearArchivo(read(files.rem), 'xlsx', {
    tipo: 'rem',
    colSku: 'Código',
    colNombre: 'Descripción',
    colPrecio: 'PRECIO CON\r\nDESCUENTO 20%',
    colUnidadesCaja: 'u/Pqte.',
  }, 'rem-max');

  assert.equal(productos.length, 66);
  assert.equal(bySku(productos, '7100592').costo, 11903);
  assert.equal(bySku(productos, 'Familia: BLOCK DE BORRADOR.'), undefined);
  assertClean(productos);
});

regressionTest('Torre usa la hoja vigente, detecta columna precio con fecha y deduplica SKU', async () => {
  const { productos } = await parsearArchivo(read(files.torre), 'xlsx', {
    tipo: 'torre',
    hoja: 'PRECIOS VIGENTE',
    colSku: 'Cod.',
    colNombre: 'Descripción Material',
    colPrecio: 'PRECIO           01-06-2026',
    colBarras: 'Codigo EAN',
    colMarca: 'Sector',
    colUnidadesCaja: 'Uni Caja',
    colUnidadesPallet: 'Uni Pallet',
  }, 'torre-colon');

  assert.equal(productos.length, 2225);
  assert.equal(bySku(productos, '29705').costo, 1455);
  assert.equal(bySku(productos, '35289').costo, 3670);
  assert.equal(bySku(productos, '37065').costo, 2982);
  assertClean(productos);
  assert.equal(productos.filter(p => p.sku === '35289').length, 1);
});

regressionTest('parsers existentes de Libesa y Pronobel siguen limpios', async () => {
  const libesa = await parsearArchivo(read(files.libesa), 'xlsx', { tipo: 'libesa' }, 'libesa');
  const pronobelLib = await parsearArchivo(read(files.pronobelLib), 'xlsx', { tipo: 'pronobel' }, 'pronobel');
  const pronobelTec = await parsearArchivo(read(files.pronobelTec), 'xlsx', { tipo: 'pronobel' }, 'pronobel');

  assert.equal(libesa.productos.length, 2777);
  assert.equal(pronobelLib.productos.length, 1558);
  assert.equal(pronobelTec.productos.length, 11);
  assertClean(libesa.productos);
  assertClean(pronobelLib.productos);
  assertClean(pronobelTec.productos);
});
