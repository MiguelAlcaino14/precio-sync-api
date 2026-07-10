const MIN_DIM = 400; // pixeles mínimos en ancho y alto para ser una página

/**
 * Parsea el marcador SOF del JPEG para obtener dimensiones y componentes.
 * Devuelve null si no encuentra un SOF válido.
 */
function sofInfo(buf) {
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m < 0xC0 || m > 0xC3) { i += 2 + (buf.length > i + 3 ? buf.readUInt16BE(i + 2) : 0); continue; }
    if (i + 9 >= buf.length) break;
    return {
      height:     buf.readUInt16BE(i + 5),
      width:      buf.readUInt16BE(i + 7),
      components: buf[i + 9],
    };
  }
  return null;
}

/**
 * Extrae imágenes JPEG de página completa directamente del binario PDF.
 * Funciona para PDFs escaneados donde cada página ES un JPEG.
 * No requiere canvas — busca marcadores SOI/EOI en el buffer y valida dimensiones.
 */
function extractJpegsFromPdf(buffer) {
  const images = [];
  let pos = 0;

  while (pos < buffer.length - 1) {
    if (buffer[pos] === 0xFF && buffer[pos + 1] === 0xD8) {
      const start = pos;
      let end = -1;
      for (let i = start + 2; i < buffer.length - 1; i++) {
        if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
          end = i + 2;
          break;
        }
      }
      if (end > start) {
        const candidate = buffer.slice(start, end);
        const info = sofInfo(candidate);
        // Conservar solo imágenes de tamaño página (no thumbnails ni iconos)
        if (info && info.width >= MIN_DIM && info.height >= MIN_DIM) {
          images.push(candidate);
        }
        pos = end;
      } else {
        pos++;
      }
    } else {
      pos++;
    }
  }

  return images;
}

/**
 * Convierte páginas de un PDF imagen a buffers JPEG.
 * Primero intenta extracción binaria directa (sin deps pesadas).
 * @param {Buffer} buffer  - PDF en memoria
 * @param {object} opts
 * @param {number} opts.maxPages - Límite de páginas (default: todas)
 * @returns {Promise<Buffer[]>}  - Array de buffers JPEG
 */
async function pdfToImages(buffer, { maxPages = null } = {}) {
  const imagenes = extractJpegsFromPdf(buffer);

  if (!imagenes.length) {
    throw new Error('No se encontraron imágenes JPEG en el PDF. Puede que sea un formato no soportado.');
  }

  return maxPages ? imagenes.slice(0, maxPages) : imagenes;
}

module.exports = { pdfToImages };
