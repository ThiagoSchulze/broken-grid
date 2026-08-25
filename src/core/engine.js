import { montarGrade, registrarAusencia, registrarPresenca } from './grid.js';
import { ESTADOS, motivoRecusa } from './rules.js';

export function criarPartida(config, { agora = () => Date.now() } = {}) {
  const ouvintes = new Set();
  let grade;
  let gridId;
  let historico;
  let podeDesfazer;
  let palitosRemovidos;
  let status;
  let iniciadoEm;
  let finalizadoEm;

  function iniciar(novaConfig) {
    grade = montarGrade(novaConfig);
    gridId = novaConfig.id ?? null;
    historico = [];
    podeDesfazer = false;
    palitosRemovidos = 0;
    iniciadoEm = agora();
    status = grade.quadradosVivos === 0 ? 'vencido' : 'jogando';
    finalizadoEm = status === 'vencido' ? iniciadoEm : null;
  }

  function obterEstado() {
    return Object.freeze({
      n: grade.n,
      gridId,
      palitos: Object.freeze(Object.fromEntries(grade.palitos)),
      quadradosVivos: grade.quadradosVivos,
      palitosRemovidos,
      historico: Object.freeze([...historico]),
      podeDesfazer,
      status,
      iniciadoEm,
      finalizadoEm,
    });
  }

  function notificar() {
    const estado = obterEstado();
    for (const ouvinte of ouvintes) ouvinte(estado);
  }

  function removerPalito(id) {
    if (status === 'vencido') return { ok: false, motivo: 'partida-encerrada' };
    if (!grade.palitos.has(id)) return { ok: false, motivo: 'inexistente' };

    const motivo = motivoRecusa(grade.palitos.get(id));
    if (motivo) return { ok: false, motivo };

    grade.palitos.set(id, ESTADOS.REMOVIDO);
    registrarAusencia(grade, id);
    historico.push(id);
    palitosRemovidos += 1;
    podeDesfazer = true;

    if (grade.quadradosVivos === 0) {
      status = 'vencido';
      finalizadoEm = agora();
    }

    notificar();
    return { ok: true };
  }

  function desfazer() {
    if (!podeDesfazer) return { ok: false, motivo: 'desfazer-indisponivel' };

    const id = historico.pop();
    grade.palitos.set(id, ESTADOS.REMOVIVEL);
    registrarPresenca(grade, id);
    palitosRemovidos -= 1;
    podeDesfazer = false;

    if (status === 'vencido') {
      status = 'jogando';
      finalizadoEm = null;
    }

    notificar();
    return { ok: true };
  }

  function reiniciar(novaConfig) {
    iniciar(novaConfig);
    notificar();
  }

  function inscrever(ouvinte) {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
  }

  iniciar(config);

  return { obterEstado, removerPalito, desfazer, reiniciar, inscrever };
}
