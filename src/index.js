require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authMiddleware    = require('./middleware/auth');
const authRouter        = require('./routes/auth');
const proveedoresRouter = require('./routes/proveedores');
const cambiosRouter     = require('./routes/cambios');
const reglasRouter      = require('./routes/reglas');
const exportarRouter    = require('./routes/exportar');
const publicarRouter    = require('./routes/publicar');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.PANEL_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Rutas públicas
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

// Todas las rutas siguientes requieren auth
app.use(authMiddleware);

app.use('/api/proveedores', proveedoresRouter);
app.use('/api/cambios',     cambiosRouter);
app.use('/api/reglas',      reglasRouter);
app.use('/api/exportar',    exportarRouter);
app.use('/api/publicar',    publicarRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
