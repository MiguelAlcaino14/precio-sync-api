const express    = require('express');
const path       = require('path');
const multer     = require('multer');
const rateLimit  = require('express-rate-limit');
const prisma     = require('../db');
const { parsearArchivo, detectarTipo } = require('../parsers');
const { calcularPrecioVenta }          = require('../services/markup.service');
const { construirMapas, normNombre }   = require('../services/jumpseller.service');
const { requireAdmin } = require('../middleware/auth');

const router  = express.Router();

const importLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas importaciones en poco tiempo, espera 1 minuto' },
});

// Verifica magic bytes del buffer contra el MIME declarado
function validarMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 4) return false;
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B;
  const isOle = buffer[0] === 0xD0 && buffer[1] === 0xCF;
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;

  if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return isZip;
  if (mimetype === 'application/vnd.ms-excel.sheet.macroenabled.12')                   return isZip;
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return isZip;
  if (mimetype === 'application/vnd.ms-excel') return isOle;
  if (mimetype === 'application/msword')        return isOle;
  if (mimetype === 'application/pdf')           return isPdf;
  if (mimetype === 'text/csv')                  return true;
  return false;
}

const MIME_PERMITIDOS = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const EXT_PERMITIDAS = new Set(['xlsx', 'xls', 'xlsm', 'csv', 'pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'webp']);

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
    const mostrarTodos = req.query.todos === '1' && req.user?.rol === 'admin';
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
    if (JSON.stringify(configObj).length > 10_000) {
      return res.status(400).json({ error: 'Config demasiado grande (máx 10.000 caracteres)' });
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
      if (JSON.stringify(config).length > 10_000) {
        return res.status(400).json({ error: 'Config demasiado grande (máx 10.000 caracteres)' });
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

// GET /api/proveedores/:id/productos?q=&page=1&limit=50
router.get('/:id/productos', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const q      = String(req.query.q || '').trim().slice(0, 100);
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip   = (page - 1) * limit;

    const proveedor = await prisma.proveedor.findFirst({ where: { OR: [{ id }, { slug: id }] } });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const where = {
      proveedorId: proveedor.id,
      ...(q ? {
        OR: [
          { sku:    { contains: q, mode: 'insensitive' } },
          { nombre: { contains: q, mode: 'insensitive' } },
          { marca:  { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const [total, productos] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nombre: 'asc' },
        include: {
          precioVenta: true,
          costos:      { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    res.json({
      total,
      page,
      limit,
      productos: productos.map(p => ({
        id:            p.id,
        sku:           p.sku,
        nombre:        p.nombre,
        marca:         p.marca,
        categoria:     p.categoria,
        unidadesCaja:  p.unidadesCaja,
        precioVenta:   p.precioVenta?.precio ?? null,
        costoActual:   p.costos[0]?.costo ?? null,
      })),
    });
  } catch (err) {
    console.error('GET /proveedores/:id/productos error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores/:id/importar  (recibe archivo)
router.post('/:id/importar', requireAdmin, importLimiter, upload.single('archivo'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  // Validar magic bytes (contenido real vs MIME declarado por el cliente)
  if (!validarMagicBytes(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ error: 'Contenido del archivo no coincide con el tipo declarado' });
  }

  // Sanitizar nombre de archivo antes de persistir
  const nombreArchivo = path.basename(req.file.originalname)
    .replace(/[^\w.\-]/g, '_')
    .slice(0, 255);

  try {
    const proveedor = await prisma.proveedor.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const tipo = detectarTipo(nombreArchivo);

    // Extraer metadata de Drive (campos texto del multipart)
    const driveFileId        = (req.body.driveFileId        || '').trim().slice(0, 200) || null;
    const driveModifiedTime  = (req.body.driveModifiedTime  || '').trim().slice(0, 50)  || null;

    // Deduplicar: si ya procesamos este archivo con esta fecha de modificación, saltar
    if (driveFileId && driveModifiedTime) {
      const yaExiste = await prisma.archivoImportado.findFirst({
        where: { proveedorId: proveedor.id, driveFileId, driveModifiedTime, estado: 'procesado' },
      });
      if (yaExiste) {
        console.log(`[importar] SKIPPED driveFileId=${driveFileId} ya existe archivoId=${yaExiste.id}`);
        return res.json({ skipped: true, mensaje: 'Archivo ya procesado', archivoId: yaExiste.id });
      }
    }

    // Registrar el archivo en DB
    const archivo = await prisma.archivoImportado.create({
      data: {
        proveedorId:      proveedor.id,
        nombre:           nombreArchivo,
        tipo,
        estado:           'procesando',
        driveFileId:      driveFileId     || null,
        driveModifiedTime: driveModifiedTime || null,
      },
    });

    // Parsear en background (no bloqueamos la respuesta)
    res.json({ archivoId: archivo.id, mensaje: 'Procesando archivo...' });

    procesarArchivo(archivo.id, proveedor, req.file.buffer, tipo, nombreArchivo).catch(console.error);

  } catch (err) {
    console.error('POST /proveedores/:id/importar error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

async function procesarArchivo(archivoId, proveedor, buffer, tipo, nombreArchivo) {
  console.log(`[procesarArchivo] inicio archivoId=${archivoId} proveedor=${proveedor.slug} tipo=${tipo}`);
  try {
    const { productos, sugerencia } = await parsearArchivo(buffer, tipo, proveedor.config, proveedor.slug);
    console.log(`[procesarArchivo] parser OK productos=${productos.length}`);

    // Obtener mapa JumpSeller para validar que los productos existen antes de procesarlos
    let mapaJS       = null;
    let advertenciaJS = null;
    if (process.env.JUMPSELLER_LOGIN && process.env.JUMPSELLER_TOKEN) {
      try {
        mapaJS = await construirMapas();
        console.log(`[procesarArchivo] mapa JumpSeller OK sku=${Object.keys(mapaJS.mapaSku).length} nombres=${Object.keys(mapaJS.mapaNombre).length}`);
      } catch (err) {
        advertenciaJS = `JumpSeller no disponible al importar, se procesaron todos los productos sin validar. (${err.message})`;
        console.warn(`[procesarArchivo] ${advertenciaJS}`);
      }
    }

    const factorDescuento = 1 - (proveedor.descuento ?? 0) / 100;
    const CATEGORIAS_VALIDAS = ['unidad', 'caja', 'pallet'];

    let matcheados     = 0;
    let sinMatch       = 0;
    let cambiosCreados = 0;

    for (const prod of productos) {
      // Si el mapa JS está disponible, omitir productos que no existen en JumpSeller
      if (mapaJS) {
        const enJS = mapaJS.mapaSku[prod.sku] ||
                     (prod.nombre && mapaJS.mapaNombre[normNombre(prod.nombre)]);
        if (!enJS) {
          sinMatch++;
          console.log(`[procesarArchivo] omitido sku=${prod.sku} (no existe en JumpSeller)`);
          continue;
        }
        matcheados++;
      }

      prod.costo = Math.round(prod.costo * factorDescuento);

      // Buscar o crear producto en DB interna
      let producto = await prisma.producto.findUnique({ where: { sku: prod.sku } });

      if (!producto) {
        if (!mapaJS) sinMatch++;
        producto = await prisma.producto.create({
          data: {
            sku:            prod.sku,
            nombre:         prod.nombre,
            marca:          prod.marca,
            categoria:      CATEGORIAS_VALIDAS.includes(prod.categoria) ? prod.categoria : null,
            unidadesCaja:   prod.unidadesCaja   ?? null,
            unidadesPallet: prod.unidadesPallet ?? null,
            proveedorId:    proveedor.id,
          },
        });
      } else {
        if (!mapaJS) matcheados++;
        const updates = {};
        if (prod.nombre         && !producto.nombre)         updates.nombre         = prod.nombre;
        if (prod.marca          && !producto.marca)          updates.marca          = prod.marca;
        if (prod.categoria && CATEGORIAS_VALIDAS.includes(prod.categoria) && !producto.categoria) updates.categoria = prod.categoria;
        if (prod.unidadesCaja   && !producto.unidadesCaja)   updates.unidadesCaja   = prod.unidadesCaja;
        if (prod.unidadesPallet && !producto.unidadesPallet) updates.unidadesPallet = prod.unidadesPallet;
        if (Object.keys(updates).length) {
          producto = await prisma.producto.update({ where: { id: producto.id }, data: updates });
        }
      }

      // Registrar el costo histórico
      await prisma.precioCosto.create({
        data: { productoId: producto.id, costo: prod.costo, archivoId },
      });

      const costoAnterior = await prisma.precioCosto.findFirst({
        where: { productoId: producto.id, NOT: { archivoId } },
        orderBy: { createdAt: 'desc' },
      });

      const precioVentaActual = await prisma.precioVenta.findUnique({ where: { productoId: producto.id } });
      const { precio: precioSugerido } = await calcularPrecioVenta(prod.sku, prod.costo, proveedor.id);

      const costoAnteriorValor  = costoAnterior?.costo ?? null;
      const cambioSignificativo = !precioVentaActual || precioSugerido !== precioVentaActual.precio;
      console.log(`[procesarArchivo] sku=${prod.sku} costo=${prod.costo} precioSugerido=${precioSugerido} precioVentaActual=${precioVentaActual?.precio ?? null} cambio=${cambioSignificativo}`);

      if (cambioSignificativo) {
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

        cambiosCreados++;
      }
    }

    const updateData = {
      estado:         'procesado',
      totalProductos: productos.length,
      matcheados,
      sinMatch,
    };
    if (sugerencia)    updateData.sugerenciaConfig = sugerencia;
    if (advertenciaJS) updateData.errores = `ADVERTENCIA: ${advertenciaJS}`;

    await prisma.archivoImportado.update({ where: { id: archivoId }, data: updateData });

    const tituloBase = `${proveedor.nombre}: ${cambiosCreados} cambio${cambiosCreados !== 1 ? 's' : ''} detectado${cambiosCreados !== 1 ? 's' : ''}`;
    const mensajeBase = `Archivo "${nombreArchivo}" procesado. ${cambiosCreados} producto${cambiosCreados !== 1 ? 's' : ''} con cambio de precio.`;

    if (cambiosCreados > 0 || advertenciaJS) {
      await prisma.notificacion.create({
        data: {
          tipo:    advertenciaJS ? 'advertencia_jumpseller' : 'cambios_detectados',
          titulo:  advertenciaJS ? `${tituloBase} (sin validación JumpSeller)` : tituloBase,
          mensaje: advertenciaJS ? `${mensajeBase} ADVERTENCIA: ${advertenciaJS}` : mensajeBase,
          datos:   { proveedorId: proveedor.id, proveedorNombre: proveedor.nombre, cambiosCreados },
        },
      });
    }

  } catch (err) {
    console.error(`[procesarArchivo] ERROR archivoId=${archivoId}:`, err.message);
    await prisma.archivoImportado.update({
      where: { id: archivoId },
      data: { estado: 'error', errores: err.message },
    });
  }
}

// GET /api/proveedores/:id/archivos/:archivoId — estado de una importación
router.get('/:id/archivos/:archivoId', requireAdmin, async (req, res) => {
  try {
    const proveedor = await prisma.proveedor.findFirst({
      where: { OR: [{ id: req.params.id }, { slug: req.params.id }] },
    });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const archivo = await prisma.archivoImportado.findFirst({
      where: { id: req.params.archivoId, proveedorId: proveedor.id },
      select: {
        id: true, estado: true, totalProductos: true,
        matcheados: true, sinMatch: true, errores: true,
        sugerenciaConfig: true,
      },
    });
    if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado' });

    res.json(archivo);
  } catch (err) {
    console.error('GET /proveedores/:id/archivos/:archivoId error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores/:id/reset-drive  — limpia el caché de dedup Drive para forzar reimport
router.post('/:id/reset-drive', requireAdmin, async (req, res) => {
  try {
    const proveedor = await prisma.proveedor.findFirst({
      where: { OR: [{ id: req.params.id }, { slug: req.params.id }] },
    });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const { count } = await prisma.archivoImportado.updateMany({
      where:  { proveedorId: proveedor.id, driveFileId: { not: null } },
      data:   { driveFileId: null, driveModifiedTime: null },
    });

    res.json({ reseteados: count, mensaje: 'El próximo sync de Drive reimportará los archivos de este proveedor' });
  } catch (err) {
    console.error('POST /proveedores/:id/reset-drive error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores/reset-drive-todos  — limpia el caché de dedup para TODOS los proveedores
router.post('/reset-drive-todos', requireAdmin, async (req, res) => {
  try {
    const { count } = await prisma.archivoImportado.updateMany({
      where: { driveFileId: { not: null } },
      data:  { driveFileId: null, driveModifiedTime: null },
    });

    res.json({ reseteados: count, mensaje: 'El próximo sync de Drive reimportará todos los archivos' });
  } catch (err) {
    console.error('POST /proveedores/reset-drive-todos error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
