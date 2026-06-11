const express  = require('express');
const multer   = require('multer');
const prisma   = require('../db');
const { parsearArchivo, detectarTipo } = require('../parsers');
const { calcularPrecioVenta }          = require('../services/markup.service');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/proveedores
router.get('/', async (req, res) => {
  try {
    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      include: {
        _count: { select: { productos: true, archivos: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(proveedores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
  try {
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { productos: true } } },
    });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(proveedor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proveedores/:id/importar  (recibe archivo)
router.post('/:id/importar', upload.single('archivo'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  try {
    const proveedor = await prisma.proveedor.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const tipo = detectarTipo(req.file.originalname);

    // Registrar el archivo en DB
    const archivo = await prisma.archivoImportado.create({
      data: {
        proveedorId: proveedor.id,
        nombre:  req.file.originalname,
        tipo,
        estado: 'procesando',
      },
    });

    // Parsear en background (no bloqueamos la respuesta)
    res.json({ archivoId: archivo.id, mensaje: 'Procesando archivo...' });

    procesarArchivo(archivo.id, proveedor, req.file.buffer, tipo).catch(console.error);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function procesarArchivo(archivoId, proveedor, buffer, tipo) {
  try {
    const productos = await parsearArchivo(buffer, tipo, proveedor.config);

    let matcheados = 0;
    let sinMatch   = 0;

    for (const prod of productos) {
      // Buscar o crear producto
      let producto = await prisma.producto.findUnique({ where: { sku: prod.sku } });

      if (!producto) {
        // Producto nuevo en el sistema → sin match en JumpSeller por ahora
        sinMatch++;
        producto = await prisma.producto.create({
          data: {
            sku:        prod.sku,
            nombre:     prod.nombre,
            marca:      prod.marca,
            proveedorId: proveedor.id,
          },
        });
      } else {
        matcheados++;
      }

      // Registrar el costo histórico
      await prisma.precioCosto.create({
        data: { productoId: producto.id, costo: prod.costo, archivoId },
      });

      // Obtener costo anterior (último antes de este)
      const costoAnterior = await prisma.precioCosto.findFirst({
        where: { productoId: producto.id, NOT: { archivoId } },
        orderBy: { createdAt: 'desc' },
      });

      // Calcular precio de venta sugerido
      const precioVentaActual = await prisma.precioVenta.findUnique({ where: { productoId: producto.id } });
      const { precio: precioSugerido } = await calcularPrecioVenta(prod.sku, prod.costo, proveedor.id);

      // Si el costo cambió (o es nuevo), crear cambio pendiente
      const costoAnteriorValor = costoAnterior?.costo ?? null;
      const cambioSignificativo = costoAnteriorValor === null || Math.abs(prod.costo - costoAnteriorValor) > 1;

      if (cambioSignificativo) {
        // Cancelar cambios anteriores pendientes del mismo producto
        await prisma.cambioPendiente.updateMany({
          where: { productoId: producto.id, estado: 'pendiente' },
          data: { estado: 'reemplazado' },
        });

        await prisma.cambioPendiente.create({
          data: {
            productoId:    producto.id,
            costoAnterior: costoAnteriorValor,
            costoNuevo:    prod.costo,
            precioActual:  precioVentaActual?.precio ?? null,
            precioSugerido,
            archivoId,
          },
        });
      }
    }

    await prisma.archivoImportado.update({
      where: { id: archivoId },
      data: {
        estado:         'procesado',
        totalProductos: productos.length,
        matcheados,
        sinMatch,
      },
    });

  } catch (err) {
    await prisma.archivoImportado.update({
      where: { id: archivoId },
      data: { estado: 'error', errores: err.message },
    });
  }
}

module.exports = router;
