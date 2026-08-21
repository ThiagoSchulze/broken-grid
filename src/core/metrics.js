/** Metricas da secao 6 da especificacao: excedentes, eficiencia e tempo. */

export function formatarTempo(ms) {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

export function formatarPercentual(valor) {
  return `${valor.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}%`;
}

/**
 * @param {number} palitosRemovidos
 * @param {number|null} minimo  quantidade da solucao de referencia
 * @param {number} iniciadoEm
 * @param {number|null} finalizadoEm  null enquanto a partida corre
 * @param {number} agora  instante usado quando a partida ainda corre
 */
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
