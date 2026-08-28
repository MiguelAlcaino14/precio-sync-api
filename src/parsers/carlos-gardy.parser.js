const mammoth = require('mammoth');

const IGNORAR = [
  /^0\s*$/,
  /^carlos gardy/i,
  /fabricaci[oó]n/i,
  /bolsas y forros/i,
  /archivadores-carpetas/i,
  /villarrica/i,
  /la granja/i,
  /pl[aá]sticos inzunza/i,
  /lista de precios/i,
  /precio\s+precio con\s+descuento/i,
  /mas iva/i,
  /^nota:/i,
];

function esPrecio(s) {
  return /^\$[\d.,]+$/.test(s.trim());
}

function parsearPrecio(s) {
  return parseFloat(s.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim());
}

function generarSku(nombre, idx) {
  return `CG-${String(idx + 1).padStart(3, '0')}`;
}

async function parsearCarlosGardy(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  const lineas = value.split('\n').map(l => l.trim()).filter(Boolean);

  // Filtrar encabezado y notas
  const datos = lineas.filter(l => !IGNORAR.some(re => re.test(l)));

  const productos = [];
  let i = 0;

  while (i < datos.length) {
    const l = datos[i];

    // Si no es precio, es nombre de producto
    if (!esPrecio(l)) {
      const nombre = l;
      const p1 = datos[i + 1]; // precio lista
      const p2 = datos[i + 2]; // precio con descuento

      if (p1 && p2 && esPrecio(p1) && esPrecio(p2)) {
        const costo = parsearPrecio(p2); // usar precio con descuento
        if (costo > 0) {
          productos.push({
            sku:    generarSku(nombre, productos.length),
            nombre: nombre.slice(0, 255),
            marca:  'Carlos Gardy',
            barras: null,
            costo,
          });
        }
        i += 3;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return productos;
}

module.exports = { parsearCarlosGardy };
