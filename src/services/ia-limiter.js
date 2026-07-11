const MAX_POR_DIA = parseInt(process.env.IA_MAX_CALLS_PER_DAY || '200', 10);
const DELAY_MS    = parseInt(process.env.IA_DELAY_MS || '2000', 10);

let llamadasHoy  = 0;
let ultimaLlamada = 0;
let fechaReset   = new Date().toDateString();

async function esperarTurno() {
  const hoy = new Date().toDateString();
  if (hoy !== fechaReset) {
    llamadasHoy = 0;
    fechaReset  = hoy;
  }

  if (llamadasHoy >= MAX_POR_DIA) {
    throw new Error(`Límite diario de llamadas IA alcanzado (${MAX_POR_DIA}). Se reanuda mañana.`);
  }

  const espera = DELAY_MS - (Date.now() - ultimaLlamada);
  if (espera > 0) await new Promise(r => setTimeout(r, espera));

  ultimaLlamada = Date.now();
  llamadasHoy++;
  console.log(`[IA-Limiter] Llamada ${llamadasHoy}/${MAX_POR_DIA} hoy`);
}

function contadorHoy() { return llamadasHoy; }

module.exports = { esperarTurno, contadorHoy };
