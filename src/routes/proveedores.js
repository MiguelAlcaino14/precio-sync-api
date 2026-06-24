const express  = require('express');
const multer   = require('multer');
const prisma   = require('../db');
const { parsearArchivo, detectarTipo } = require('../parsers');
const { calcularPrecioVenta }          = require('../services/markup.service');
const { requireAdmin } = require('../middleware/auth');

const router  = express.Router();

const MIME_PERMITIDOS = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const EXT_PERMITIDAS = new Set(['xlsx', 'xls', 'xlsm', 'csv', 'pdf', 'docx', 'doc']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!EXT_PERMITIDAS.has(ext) || !MIME_PERMITIDOS.has(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido'));
    }
    cb(null, true);
  },
});

// GET /api/proveedores
// ?todos=1 → devuelve activos e inactivos (solo admin)
router.get('/', async (req, res) => {
  try {
    const mostrarTodos = req.query.todos === '1';
    const where = mostrarTodos ? {} : { activo: true };

    const proveedores = await prisma.proveedor.findMany({
      where,
      include: {
        _count: { select: { productos: true, archivos: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(proveedores);
  } catch (err) {
    console.error('GET /proveedores error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    console.error('GET /proveedores/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores
router.post('/', requireAdmin, async (req, res) => {
  try {
    let { nombre, slug, tema, descuento, driveFolderId, config, activo } = req.body;

    // Validaciones obligatorias
    nombre = (nombre || '').trim();
    slug   = (slug   || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El campo nombre es obligatorio' });
    if (!slug)   return res.status(400).json({ error: 'El campo slug es obligatorio' });

    // Límites de largo
    if (nombre.length > 100) return res.status(400).json({ error: 'Nombre demasiado largo (máx 100 caracteres)' });
    if (slug.length   > 60)  return res.status(400).json({ error: 'Slug demasiado largo (máx 60 caracteres)' });

    // Formato slug
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug solo puede contener letras minúsculas, números y guiones' });
    }

    // Drive folder id largo
    if (driveFolderId && driveFolderId.length > 200) {
      return res.status(400).json({ error: 'driveFolderId demasiado largo (máx 200 caracteres)' });
    }

    // Descuento
    const descuentoNum = descuento !== undefined ? parseFloat(descuento) : 0;
    if (isNaN(descuentoNum) || descuentoNum < 0 || descuentoNum > 100) {
      return res.status(400).json({ error: 'Descuento debe ser un número entre 0 y 100' });
    }

    // Config
    const configObj = config !== undefined ? config : {};
    if (typeof configObj !== 'object' || Array.isArray(configObj) || configObj === null) {
      return res.status(400).json({ error: 'Config debe ser un objeto JSON válido' });
    }

    // Slug único
    const existe = await prisma.proveedor.findUnique({ where: { slug } });
    if (existe) return res.status(409).json({ error: `Ya existe un proveedor con slug "${slug}"` });

    const proveedor = await prisma.proveedor.create({
      data: {
        nombre,
        slug,
        tema:          tema          || null,
        descuento:     descuentoNum,
        driveFolderId: driveFolderId ? driveFolderId.trim() : null,
        config:        configObj,
        activo:        activo !== undefined ? Boolean(activo) : true,
      },
    });

    res.status(201).json(proveedor);
  } catch (err) {
    console.error('POST /proveedores error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const existe = await prisma.proveedor.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Proveedor no encontrado' });

    let { nombre, tema, descuento, driveFolderId, config, activo } = req.body;

    const data = {};

    if (nombre !== undefined) {
      nombre = nombre.trim();
      if (!nombre) return res.status(400).json({ error: 'El campo nombre es obligatorio' });
      if (nombre.length > 100) return res.status(400).json({ error: 'Nombre demasiado largo (máx 100 caracteres)' });
      data.nombre = nombre;
    }

    if (tema !== undefined) {
      data.tema = tema || null;
    }

    if (descuento !== undefined) {
      const descuentoNum = parseFloat(descuento);
      if (isNaN(descuentoNum) || descuentoNum < 0 || descuentoNum > 100) {
        return res.status(400).json({ error: 'Descuento debe ser un número entre 0 y 100' });
      }
      data.descuento = descuentoNum;
    }

    if (driveFolderId !== undefined) {
      if (driveFolderId && driveFolderId.length > 200) {
        return res.status(400).json({ error: 'driveFolderId demasiado largo (máx 200 caracteres)' });
      }
      data.driveFolderId = driveFolderId ? driveFolderId.trim() : null;
    }

    if (config !== undefined) {
      if (typeof config !== 'object' || Array.isArray(config) || config === null) {
        return res.status(400).json({ error: 'Config debe ser un objeto JSON válido' });
      }
      data.config = config;
    }

    if (activo !== undefined) {
      data.activo = Boolean(activo);
    }

    const proveedor = await prisma.proveedor.update({ where: { id }, data });
    res.json(proveedor);
  } catch (err) {
    console.error('PUT /proveedores/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/proveedores/:id  (soft delete)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const existe = await prisma.proveedor.findUnique({ where: { id } });
    if (!existe) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const proveedor = await prisma.proveedor.update({
      where: { id },
      data:  { activo: false },
    });

    res.json(proveedor);
  } catch (err) {
    console.error('DELETE /proveedores/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores/:id/importar  (recibe archivo)
router.post('/:id/importar', requireAdmin, upload.single('archivo'), async (req, res) => {
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
    console.error('POST /proveedores/:id/importar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

async function procesarArchivo(archivoId, proveedor, buffer, tipo) {
  try {
    const productos = await parsearArchivo(buffer, tipo, proveedor.config, proveedor.slug);

    // Aplicar descuento negociado con el proveedor al costo bruto
    const factorDescuento = 1 - (proveedor.descuento ?? 0) / 100;

    let matcheados = 0;
    let sinMatch   = 0;

    for (const prod of productos) {
      prod.costo = Math.round(prod.costo * factorDescuento);
      // Buscar o crear producto
      let producto = await prisma.producto.findUnique({ where: { sku: prod.sku } });

      if (!producto) {
        // Producto nuevo en el sistema → sin match en JumpSeller por ahora
        sinMatch++;
        producto = await prisma.producto.create({
          data: {
            sku:            prod.sku,
            nombre:         prod.nombre,
            marca:          prod.marca,
            unidadesCaja:   prod.unidadesCaja   ?? null,
            unidadesPallet: prod.unidadesPallet ?? null,
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
