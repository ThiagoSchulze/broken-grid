// Protocolo de texto entre o jogo e o firmware hardware/broken_grid_periferico. Livre de DOM.
// Uma mensagem por linha, 115200 baud. Ver o cabeçalho do .ino para a tabela completa.

import { ESTADOS } from '../core/rules.js';
import { ordemDaCorrente } from '../core/cursor.js';

export const BAUD = 115200;
export const N_DO_TABULEIRO = 4;

export const CODIGOS = Object.freeze({
  APAGADO: '.',
  REMOVIVEL: 'w',
  BLOQUEADO: 'r',
  SOLUCAO: 'c',
  VITORIA: 'g',
  CURSOR: '*',
});

function codigoDoEstado(situacao) {
  if (situacao === ESTADOS.REMOVIVEL) return CODIGOS.REMOVIVEL;
  if (situacao === ESTADOS.BLOQUEADO) return CODIGOS.BLOQUEADO;
  return CODIGOS.APAGADO;  // quebrado e removido
}

function estaPresente(situacao) {
  return situacao === ESTADOS.REMOVIVEL || situacao === ESTADOS.BLOQUEADO;
}

// Monta a linha "L <40 códigos>" com o que o tabuleiro deve mostrar agora.
//   estado          estado da partida (engine.obterEstado())
//   estadoOriginal  grade inicial (para o modo solução)
//   vista           'jogo' | 'solucao' | 'desempenho'
//   solucao         lista de ids da solução de referência
//   cursor          id do palito sob o cursor, ou null
// Grade de outro tamanho que não o do tabuleiro: tudo apagado.
export function montarQuadro({ estado, estadoOriginal = null, vista = 'jogo', solucao = null, cursor = null }) {
  const n = N_DO_TABULEIRO;
  const ordem = ordemDaCorrente(n);
  if (!estado || estado.n !== n) return `L ${CODIGOS.APAGADO.repeat(ordem.length)}`;

  let codigos;
  if (vista === 'solucao') {
    // mesma regra da tela: a solução aparece sobre a grade inicial
    const base = estadoOriginal ?? estado;
    const destacados = new Set(solucao ?? []);
    codigos = ordem.map((id) => (destacados.has(id) ? CODIGOS.SOLUCAO : codigoDoEstado(base.palitos[id])));
  } else if (estado.status === 'vencido') {
    codigos = ordem.map((id) => (estaPresente(estado.palitos[id]) ? CODIGOS.VITORIA : CODIGOS.APAGADO));
  } else {
    codigos = ordem.map((id) => (id === cursor ? CODIGOS.CURSOR : codigoDoEstado(estado.palitos[id])));
  }
  return `L ${codigos.join('')}`;
}

const BOTOES = {
  DIREITA: 'direita', BAIXO: 'baixo', REMOVER: 'remover', VOLTAR: 'voltar', SOLUCAO: 'solucao', NOVO: 'novo',
};

// Converte uma linha recebida do Uno num evento. Linhas que não seguem o protocolo viram
// { tipo: 'desconhecido' } e são ignoradas pelo jogo (nunca lançam).
export function interpretarLinha(texto) {
  const linha = String(texto).trim();
  const partes = linha.split(/\s+/);
  const [cmd, a, b] = partes;

  if (cmd === 'PRONTO') {
    // PRONTO broken-grid-periferico v2 n=4 modo=botoes
    const campos = Object.fromEntries(partes.slice(3).map((p) => p.split('=')));
    return {
      tipo: 'pronto', firmware: a ?? null, versao: b ?? null, n: Number(campos.n) || null, modo: campos.modo ?? null,
    };
  }
  if (cmd === 'OK' && partes.length === 1) return { tipo: 'ok' };
  if (cmd === 'ERRO') return { tipo: 'erro', motivo: a ?? 'sem_motivo' };
  if (cmd === 'BOTAO' && Object.hasOwn(BOTOES, a) && partes.length === 2) return { tipo: 'botao', botao: BOTOES[a] };
  return { tipo: 'desconhecido', linha };
}
