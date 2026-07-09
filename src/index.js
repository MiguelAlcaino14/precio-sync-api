require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan    = require('morgan');

const requiredEnvs = ['JWT_SECRET', 'DATABASE_URL', 'PANEL_ORIGIN', 'N8N_API_KEY'];
for (const key of requiredEnvs) {
  if (!process.env[key]) {
    console.error(`ERROR: ${key} must be set`);
    process.exit(1);
  }
}

const authMiddleware        = require('./middleware/auth');
const authRouter            = require('./routes/auth');
const proveedoresRouter     = require('./routes/proveedores');
const cambiosRouter         = require('./routes/cambios');
const reglasRouter          = require('./routes/reglas');
const exportarRouter        = require('./routes/exportar');
const publicarRouter        = require('./routes/publicar');
const usuariosRouter        = require('./routes/usuarios');
const notificacionesRouter  = require('./routes/notificaciones');
const syncRouter            = require('./routes/sync');
const ofertasRouter         = require('./routes/ofertas');

const app        = express();
const PORT       = process.env.PORT || 3001;
const isProd     = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan(isProd ? 'combined' : 'dev'));

app.use(cors({
  origin: process.env.PANEL_ORIGIN,
  credentials: true,
}));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, espera 15 minutos' },
});

// Rutas públicas
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authLimiter, authRouter);

// Todas las rutas siguientes requieren auth
app.use(authMiddleware);

app.use('/api/proveedores',    proveedoresRouter);
app.use('/api/cambios',        cambiosRouter);
app.use('/api/reglas',         reglasRouter);
app.use('/api/exportar',       exportarRouter);
app.use('/api/publicar',       publicarRouter);
app.use('/api/usuarios',       usuariosRouter);
app.use('/api/notificaciones', notificacionesRouter);
app.use('/api/sync',          syncRouter);
app.use('/api/ofertas',       ofertasRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
