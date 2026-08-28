function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function text(value) {
  return String(value ?? '').trim();
}

function parsePrecio(value, { round = false } = {}) {
  let n = null;

  if (typeof value === 'number') {
    n = value;
  } else {
    const raw = text(value);
    if (!raw || /^#|error/i.test(raw)) return null;

    let cleaned = raw.replace(/\$/g, '').replace(/\s/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '');
    }

    n = Number.parseFloat(cleaned);
  }

  if (!Number.isFinite(n) || n <= 0) return null;
  return round ? Math.round(n) : n;
}

function parseUnidades(value) {
  const n = Number.parseInt(value, 10);
  return n > 1 && n <= 10000 ? n : null;
}

function findCol(headers, candidates) {
  const wanted = (Array.isArray(candidates) ? candidates : [candidates]).map(norm);
  return headers.findIndex(h => wanted.includes(norm(h)));
}

function findHeaderRow(rows, requiredHeaders, limit = 30) {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    if (requiredHeaders.every(header => findCol(rows[i], header) !== -1)) return i;
  }
  return -1;
}

function buildProduct({ sku, nombre, costo, marca = null, barras = null, unidadesCaja = null, unidadesPallet = null }) {
  return {
    sku,
    nombre,
    marca,
    barras,
    costo,
    unidadesCaja,
    unidadesPallet,
    categoria: unidadesCaja > 1 ? 'caja' : 'unidad',
  };
}

module.exports = {
  norm,
  text,
  parsePrecio,
  parseUnidades,
  findCol,
  findHeaderRow,
  buildProduct,
};
