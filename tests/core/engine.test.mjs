import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPartida } from '../../src/core/engine.js';

// Grade 1x1 util: quebrar tres lados do unico quadrado de um 4x4 seria longo,
// entao usamos um relogio falso e configs pequenas montadas na mao.
const relogio = () => {
  let t = 1000;
  return { agora: () => t, avancar: (ms) => { t += ms; } };
};

function partida4x4(extra = {}) {
  return criarPartida({ id: 'g4-teste', n: 4, ...extra });
}

test('a partida comeca jogando, com contadores zerados', () => {
  const jogo = partida4x4();
  const estado = jogo.obterEstado();
  assert.equal(estado.status, 'jogando');
  assert.equal(estado.palitosRemovidos, 0);
  assert.equal(estado.quadradosVivos, 30);
  assert.equal(estado.gridId, 'g4-teste');
  assert.deepEqual(estado.historico, []);
});

test('o estado devolvido e congelado', () => {
  const estado = partida4x4().obterEstado();
  assert.ok(Object.isFrozen(estado));
  assert.throws(() => { estado.palitosRemovidos = 99; }, TypeError);
});

test('remover palito incrementa o contador e mata os quadrados afetados', () => {
  const jogo = partida4x4();
  assert.deepEqual(jogo.removerPalito('h:0:0'), { ok: true });
  const estado = jogo.obterEstado();
  assert.equal(estado.palitosRemovidos, 1);
  assert.equal(estado.quadradosVivos, 26);
  assert.equal(estado.palitos['h:0:0'], 'removido');
  assert.deepEqual(estado.historico, ['h:0:0']);
});

test('remover bloqueado, quebrado, ja removido ou inexistente e recusado', () => {
  const jogo = partida4x4({ bloqueados: ['v:0:0'], quebrados: ['v:1:1'] });
  assert.deepEqual(jogo.removerPalito('v:0:0'), { ok: false, motivo: 'bloqueado' });
  assert.deepEqual(jogo.removerPalito('v:1:1'), { ok: false, motivo: 'quebrado' });
  assert.deepEqual(jogo.removerPalito('h:9:9'), { ok: false, motivo: 'inexistente' });
  jogo.removerPalito('h:0:0');
  assert.deepEqual(jogo.removerPalito('h:0:0'), { ok: false, motivo: 'ja-removido' });
  assert.equal(jogo.obterEstado().palitosRemovidos, 1, 'recusa nao altera o contador');
});

test('desfazer restaura exatamente o estado anterior', () => {
  const jogo = partida4x4();
  const antes = jogo.obterEstado();
  jogo.removerPalito('h:0:0');
  jogo.removerPalito('v:2:2');
  assert.deepEqual(jogo.desfazer(), { ok: true });
  assert.deepEqual(jogo.desfazer(), { ok: true });
  const depois = jogo.obterEstado();
  assert.deepEqual(depois.palitos, antes.palitos);
  assert.equal(depois.quadradosVivos, antes.quadradosVivos);
  assert.equal(depois.palitosRemovidos, 0);
  assert.deepEqual(depois.historico, []);
});

test('desfazer com historico vazio e recusado', () => {
  assert.deepEqual(partida4x4().desfazer(), { ok: false, motivo: 'historico-vazio' });
});

test('a vitoria dispara quando zera e o desfazer a reverte', () => {
  const r = relogio();
  // Grade 4x4 onde so o quadrado 1x1 em (0,0) segue vivo:
  // quebramos um lado de todos os outros 29 quadrados de uma vez usando h:1:1,
  // h:2:2, h:3:3 e as verticais correspondentes nao basta - entao montamos a
  // config minima: quebrar todos os palitos que nao pertencem ao 1x1 de (0,0).
  const bordasDoAlvo = new Set(['h:0:0', 'h:1:0', 'v:0:0', 'v:0:1']);
  const quebrados = [];
  for (let linha = 0; linha <= 4; linha += 1) {
    for (let coluna = 0; coluna < 4; coluna += 1) {
      const id = `h:${linha}:${coluna}`;
      if (!bordasDoAlvo.has(id)) quebrados.push(id);
    }
  }
  for (let linha = 0; linha < 4; linha += 1) {
    for (let coluna = 0; coluna <= 4; coluna += 1) {
      const id = `v:${linha}:${coluna}`;
      if (!bordasDoAlvo.has(id)) quebrados.push(id);
    }
  }

  const jogo = criarPartida({ n: 4, quebrados }, { agora: r.agora });
  assert.equal(jogo.obterEstado().quadradosVivos, 1);

  r.avancar(5000);
  jogo.removerPalito('h:0:0');
  const vencido = jogo.obterEstado();
  assert.equal(vencido.status, 'vencido');
  assert.equal(vencido.quadradosVivos, 0);
  assert.equal(vencido.finalizadoEm - vencido.iniciadoEm, 5000);

  assert.deepEqual(jogo.removerPalito('h:1:0'), { ok: false, motivo: 'partida-encerrada' });

  jogo.desfazer();
  const voltou = jogo.obterEstado();
  assert.equal(voltou.status, 'jogando');
  assert.equal(voltou.finalizadoEm, null);
  assert.equal(voltou.quadradosVivos, 1);
});

test('inscrever recebe notificacao a cada mudanca e o cancelamento funciona', () => {
  const jogo = partida4x4();
  const recebidos = [];
  const cancelar = jogo.inscrever((estado) => recebidos.push(estado.palitosRemovidos));
  jogo.removerPalito('h:0:0');
  jogo.desfazer();
  cancelar();
  jogo.removerPalito('h:0:0');
  assert.deepEqual(recebidos, [1, 0]);
});

test('reiniciar descarta o progresso e monta outra grade', () => {
  const jogo = partida4x4();
  jogo.removerPalito('h:0:0');
  jogo.reiniciar({ id: 'g5-teste', n: 5 });
  const estado = jogo.obterEstado();
  assert.equal(estado.n, 5);
  assert.equal(estado.gridId, 'g5-teste');
  assert.equal(estado.palitosRemovidos, 0);
  assert.equal(estado.quadradosVivos, 55);
});
