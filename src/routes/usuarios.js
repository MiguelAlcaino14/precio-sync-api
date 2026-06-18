const express      = require('express');
const bcrypt       = require('bcryptjs');
const prisma       = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const SELECT_PUBLICO = {
  id: true, nombre: true, email: true,
  usuario: true, rol: true, activo: true, createdAt: true,
};

// GET /api/usuarios
router.get('/', requireAdmin, async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select:  SELECT_PUBLICO,
      orderBy: { createdAt: 'asc' },
    });
    res.json(usuarios);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/usuarios
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nombre, email, usuario, password, rol } = req.body;
    if (!nombre || !email || !usuario || !password) {
      return res.status(400).json({ error: 'Nombre, email, usuario y contraseña son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.usuario.create({
      data:   { nombre, email, usuario, password: hash, rol: rol || 'operador' },
      select: SELECT_PUBLICO,
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'El usuario o email ya está en uso' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/usuarios/:id  (actualiza nombre, email, rol, activo)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { nombre, email, rol, activo } = req.body;

    // Impedir desactivar el propio admin que hace la petición
    if (req.params.id === req.user.id && activo === false) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    }

    const data = {};
    if (nombre  !== undefined) data.nombre  = nombre;
    if (email   !== undefined) data.email   = email;
    if (rol     !== undefined) data.rol     = rol;
    if (activo  !== undefined) data.activo  = activo;

    const user = await prisma.usuario.update({
      where:  { id: req.params.id },
      data,
      select: SELECT_PUBLICO,
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'El email ya está en uso' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /api/usuarios/:id/password
router.patch('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const hash = await bcrypt.hash(password, 10);
    await prisma.usuario.update({
      where: { id: req.params.id },
      data:  { password: hash },
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
