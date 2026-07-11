const MIN_DIM = 400; // pixeles mínimos para ser considerada una página

/**
 * Encuentra el offset del EOI (FF D9) de un JPEG siguiendo la estructura real
 * de marcadores, saltando APP markers (incluido EXIF con thumbnails anidados).
 * Devuelve el offset tras el EOI, o -1 si no encuentra fin válido.
 */
function findJpegEnd(buf, start) {
  let i = start + 2; // saltar SOI (FF D8)

  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue; }

    const marker = buf[i + 1];

    if (marker === 0xD9) return i + 2;          // EOI encontrado
    if (marker === 0x00 || marker === 0xFF) { i++; continue; } // byte stuffed / padding
    if (marker === 0xD8) return -1;              // SOI anidado inesperado

    // SOS (Start of Scan): tras su cabecera viene datos comprimidos de longitud variable
    if (marker === 0xDA) {
      if (i + 3 >= buf.length) return -1;
      const sosLen = buf.readUInt16BE(i + 2);
      i += 2 + sosLen; // saltar cabecera SOS
      // Escanear datos comprimidos byte a byte
      while (i < buf.length - 1) {
        if (buf[i] === 0xFF) {
          const next = buf[i + 1];
          if (next === 0xD9) return i + 2;                            // EOI
          if (next === 0x00 || (next >= 0xD0 && next <= 0xD7)) { i += 2; continue; } // stuffed / RST
          break; // otro marcador → fin de datos comprimidos, seguir parseando
        }
        i++;
      }
      continue;
    }

    // Todos los demás marcadores tienen longitud de 2 bytes (incluida en el valor)
    if (i + 3 >= buf.length) return -1;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return -1;
    i += 2 + len; // saltar marcador completo (APP0/APP1-EXIF/DQT/DHT/SOF/etc.)
  }

  return -1;
}

/**
 * Parsea el marcador SOF para obtener dimensiones del JPEG.
 */
function sofInfo(buf) {
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xC3) {
      if (i + 9 >= buf.length) break;
      return {
        height:     buf.readUInt16BE(i + 5),
        width:      buf.readUInt16BE(i + 7),
        components: buf[i + 9],
      };
    }
    if (i + 3 >= buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

/**
 * Extrae imágenes JPEG de página completa del binario PDF.
 * Usa parsing real de marcadores JPEG para evitar falsos cortes en thumbnails EXIF.
 */
function extractJpegsFromPdf(buffer) {
  const images = [];
  let pos = 0;

  while (pos < buffer.length - 1) {
    if (buffer[pos] !== 0xFF || buffer[pos + 1] !== 0xD8) { pos++; continue; }

    const end = findJpegEnd(buffer, pos);
    if (end > pos + 100) {
      const candidate = buffer.slice(pos, end);
      const info = sofInfo(candidate);
      if (info && info.width >= MIN_DIM && info.height >= MIN_DIM) {
        images.push(candidate);
      }
      pos = end;
    } else {
      pos++;
    }
  }

  return images;
}

/**
 * Convierte páginas de un PDF imagen a buffers JPEG.
 * Solo funciona con PDFs donde cada página es un JPEG embebido.
 * PDFs con páginas en formato PNG u otros no son soportados por esta vía.
 */
async function pdfToImages(buffer, { maxPages = null } = {}) {
  const imagenes = extractJpegsFromPdf(buffer);

  if (!imagenes.length) {
    throw new Error(
      'No se encontraron imágenes JPEG en el PDF. ' +
      'El PDF puede estar en formato PNG u otro formato de imagen no soportado. ' +
      'Convierte el PDF a imágenes JPEG antes de subir.'
    );
  }

  return maxPages ? imagenes.slice(0, maxPages) : imagenes;
}

module.exports = { pdfToImages };
