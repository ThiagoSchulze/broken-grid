export function formatarTempo(ms) {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

export function formatarPercentual(valor) {
  return `${valor.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}%`;
}

export function calcularResumo({
  palitosRemovidos,
  minimo = null,
  iniciadoEm,
  finalizadoEm = null,
  agora = Date.now(),
}) {
  const tempoMs = (finalizadoEm ?? agora) - iniciadoEm;
  const excedentes = minimo === null ? null : palitosRemovidos - minimo;
  const eficiencia = minimo === null || palitosRemovidos === 0
    ? 0
    : (minimo / palitosRemovidos) * 100;

  return {
    tempoMs,
    tempoFormatado: formatarTempo(tempoMs),
    palitosRemovidos,
    minimo,
    excedentes,
    eficiencia,
  };
}
