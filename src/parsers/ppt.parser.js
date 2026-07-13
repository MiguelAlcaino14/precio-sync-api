const XLSX = require('xlsx');
const { extraerConIA } = require('./ia.parser');

// Extrae texto de PPT binario (OLE/CFB) usando el módulo CFB que ya incluye xlsx
function extraerTextoPPTOle(buffer) {
  const cfb    = XLSX.CFB.read(buffer, { type: 'buffer' });
  const stream = XLSX.CFB.find(cfb, '/PowerPoint Document');
  if (!stream?.content) throw new Error('Stream PowerPoint no encontrado en el archivo OLE');

  const data   = Buffer.from(stream.content);
  const textos = [];
  let offset   = 0;

  while (offset + 8 <= data.length) {
    const tipo = data.readUInt16LE(offset + 2);
    const len  = data.readUInt32LE(offset + 4);
    if (offset + 8 + len > data.length) break;

    if (tipo === 0x0FA0) {
      // TextCharsAtom — UTF-16LE
      const txt = data.slice(offset + 8, offset + 8 + len).toString('utf16le').replace(/\0/g, '').trim();
      if (txt.length > 1) textos.push(txt);
    } else if (tipo === 0x0FA8) {
      // TextBytesAtom — Latin-1
      const txt = data.slice(offset + 8, offset + 8 + len).toString('latin1').replace(/\0/g, '').trim();
      if (txt.length > 1) textos.push(txt);
    }

    offset += 8 + len;
  }

  return textos.join('\n');
}

// Extrae texto de PPTX (ZIP con XML)
function extraerTextoPPTX(buffer) {
  const AdmZip  = require('adm-zip');
  const zip     = new AdmZip(buffer);
  const entries = zip.getEntries()
    .filter(e => /ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/(\d+)\.xml$/)?.[1] ?? '0');
      const nb = parseInt(b.entryName.match(/(\d+)\.xml$/)?.[1] ?? '0');
      return na - nb;
    });

  const textos = [];
  for (const entry of entries) {
    const xml     = entry.getData().toString('utf8');
    const matches = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)];
    for (const m of matches) {
      const t = m[1].trim();
      if (t) textos.push(t);
    }
    textos.push('');
  }

  return textos.join('\n').trim();
}

async function parsearPPT(buffer, hint = null) {
  const isOle = buffer[0] === 0xD0 && buffer[1] === 0xCF;
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B;

  let contenido;
  if (isOle) {
    contenido = extraerTextoPPTOle(buffer);
  } else if (isZip) {
    contenido = extraerTextoPPTX(buffer);
  } else {
    throw new Error('Formato PPT/PPTX no reconocido (magic bytes inválidos)');
  }

  if (!contenido || contenido.trim().length < 10) {
    throw new Error('El archivo PPT no contiene texto extraíble');
  }

  console.log(`[PPT] Texto extraído: ${contenido.length} chars`);
  return extraerConIA(contenido, [], false, null, hint);
}

module.exports = { parsearPPT };
