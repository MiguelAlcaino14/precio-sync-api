const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  // n8n usa API key estática — solo para endpoints de importación
  const n8nKey = req.headers['x-n8n-key'];
  if (n8nKey && n8nKey === process.env.N8N_API_KEY) {
    req.user = { id: 'n8n-service', rol: 'admin', esServiceAccount: true };
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol administrador' });
  }
  next();
}

module.exports = authMiddleware;
module.exports.requireAdmin = requireAdmin;
