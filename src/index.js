require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const proveedoresRouter = require('./routes/proveedores');
const cambiosRouter     = require('./routes/cambios');
const reglasRouter      = require('./routes/reglas');
const exportarRouter    = require('./routes/exportar');
const publicarRouter    = require('./routes/publicar');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/proveedores', proveedoresRouter);
app.use('/api/cambios',     cambiosRouter);
app.use('/api/reglas',      reglasRouter);
app.use('/api/exportar',    exportarRouter);
app.use('/api/publicar',    publicarRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
