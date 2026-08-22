import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { criarDocumento } from './dom-stub.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const IDS = [
  'controles', 'banner-solucao', 'stats', 'tabuleiro',
  'acoes', 'desempenho', 'card-vitoria', 'erro',
];

/**
 * Monta a aplicacao inteira sobre um stub de DOM. O `fetch` global e trocado
 * por leitura de disco: os datasets exercitados aqui sao os arquivos reais de
 * data/grids, nao fixtures.
 */
async function montar({ falharCarga = false } = {}) {
  const documento = criarDocumento(IDS);
  globalThis.document = documento;
  globalThis.fetch = async (url) => {
    if (falharCarga) throw new Error('rede indisponivel');
    const texto = await readFile(resolve(RAIZ, String(url)), 'utf8');
    return { ok: true, status: 200, text: async () => texto };
  };

  const { iniciarAplicacao } = await import('../../src/ui/app.js');
  const carga = iniciarAplicacao(documento);
  return { documento, carga };
}

const pausa = () => new Promise((r) => setTimeout(r, 40));
const el = (doc, id) => doc.querySelector('#' + id);
const palitos = (doc) => el(doc, 'tabuleiro').todos((n) => n.dataset.id !== undefined);
const botoes = (doc) => doc.raiz.todos((n) => n.tagName === 'BUTTON');
const botao = (doc, padrao) => botoes(doc).find((b) => padrao.test(b.textContent));
const clicar = (no) => no.disparar('click', { target: no, preventDefault() {} });

test('os controles nao lancam se clicados antes do dataset chegar', async () => {
  const { documento, carga } = await montar();
  for (const b of botoes(documento)) {
    assert.doesNotThrow(() => clicar(b), `clicar em "${b.textContent}" durante a carga`);
  }
  await carga;
});

test('a carga inicial monta uma grade 4x4 jogavel', async () => {
  const { documento, carga } = await montar();
  await carga;

  assert.equal(el(documento, 'erro').hidden, true);
  assert.equal(palitos(documento).length, 40, '2 * 4 * (4 + 1) palitos');
  assert.match(el(documento, 'stats').textContent, /PALITOS REMOVIDOS/);
  assert.equal(botao(documento, /Jogada/).disabled, true, 'sem historico, desfazer nasce desabilitado');
  assert.ok(palitos(documento).some((g) => g.hasAttribute('tabindex')), 'ha palito focavel');
});

test('remover e desfazer devolvem o palito ao estado focavel e sem aria-hidden', async () => {
  const { documento, carga } = await montar();
  await carga;

  const alvo = palitos(documento).find((g) => g.hasAttribute('tabindex'));
  const id = alvo.dataset.id;
  clicar(alvo);

  const removido = palitos(documento).find((g) => g.dataset.id === id);
  assert.equal(removido.hasAttribute('tabindex'), false);
  assert.equal(removido.getAttribute('aria-hidden'), 'true');
  assert.equal(botao(documento, /Jogada/).disabled, false);

  clicar(botao(documento, /Jogada/));

  const voltou = palitos(documento).find((g) => g.dataset.id === id);
  assert.equal(voltou.hasAttribute('tabindex'), true);
  assert.equal(voltou.getAttribute('aria-hidden'), null, 'desfazer nao pode deixar no focavel e oculto');
});

test('o modo solucao destaca palitos, trava o tabuleiro e nao alega otimalidade', async () => {
  const { documento, carga } = await montar();
  await carga;

  clicar(botao(documento, /^Solucionar$/));
  await pausa();

  const banner = el(documento, 'banner-solucao').todos((n) => n.classList.contains('banner--solucao'))[0];
  assert.equal(banner.hidden, false);
  assert.doesNotMatch(banner.textContent, /\b(ótima|ótimo|mínima|mínimo)\b/i);
  assert.match(banner.textContent, /ainda não comprovadamente ótima/);
  assert.ok(palitos(documento).some((g) => g.classList.contains('palito--solucao')));
  assert.ok(palitos(documento).every((g) => !g.hasAttribute('tabindex')), 'tabuleiro nao interativo');
  assert.equal(botao(documento, /^Solucionar$/).hidden, true);
  assert.equal(botao(documento, /Voltar ao Jogo/).hidden, false);

  clicar(botao(documento, /Voltar ao Jogo/));
  assert.ok(palitos(documento).some((g) => g.hasAttribute('tabindex')), 'interatividade restaurada');
});

test('trocar o tamanho recarrega o dataset correspondente', async () => {
  const { documento, carga } = await montar();
  await carga;

  clicar(el(documento, 'controles').todos((n) => n.textContent === '7×7')[0]);
  await pausa();

  assert.equal(palitos(documento).length, 112, '2 * 7 * (7 + 1) palitos');
  assert.equal(el(documento, 'erro').hidden, true);
});

test('eliminar a grade mostra o card de vitoria com a estimativa da referencia', async () => {
  const { documento, carga } = await montar();
  await carga;

  const card = () => el(documento, 'card-vitoria').todos((n) => n.classList.contains('banner--vitoria'))[0];
  assert.equal(card().hidden, true);

  for (let i = 0; i < 200; i++) {
    const alvo = palitos(documento).find((g) => g.hasAttribute('tabindex'));
    if (!alvo || !card().hidden) break;
    clicar(alvo);
  }

  assert.equal(card().hidden, false);
  assert.match(el(documento, 'stats').textContent, /0QUADRADOS RESTANTES/, 'nenhum quadrado sobrou');
  // O jogador nunca apertou "Solucionar": a estimativa vem da configuracao da
  // grade, nao do solver.
  assert.match(card().textContent, /Estimativa heurística: \d+ palitos/);
});

test('a tela de desempenho esconde jogo, stats e controles', async () => {
  const { documento, carga } = await montar();
  await carga;

  for (let i = 0; i < 200; i++) {
    const alvo = palitos(documento).find((g) => g.hasAttribute('tabindex'));
    if (!alvo) break;
    clicar(alvo);
  }
  clicar(botao(documento, /^Desempenho$/));
  await pausa();

  assert.equal(el(documento, 'desempenho').hidden, false);
  assert.equal(documento.querySelector('.cartao--tabuleiro').hidden, true);
  assert.equal(el(documento, 'stats').hidden, true);
  assert.equal(el(documento, 'controles').hidden, true);
  assert.equal(el(documento, 'acoes').hidden, true);
  assert.match(el(documento, 'desempenho').textContent, /Eficiência/);

  clicar(botao(documento, /Jogar Novamente/));
  await pausa();
  assert.equal(el(documento, 'desempenho').hidden, true);
  assert.equal(documento.querySelector('.cartao--tabuleiro').hidden, false);
});

test('o card de vitoria fica depois do desempenho na ordem do documento', async () => {
  const { documento, carga } = await montar();
  await carga;

  const ordem = documento.raiz.filhos.map((f) => f.getAttribute('id') ?? f.getAttribute('class'));
  // alta-02: o banner rosa fica entre a barra de acao e os stats.
  assert.ok(ordem.indexOf('banner-solucao') < ordem.indexOf('stats'), ordem.join(' > '));
  // alta-03 e alta-04: o card verde fecha a pagina.
  assert.ok(ordem.indexOf('card-vitoria') > ordem.indexOf('desempenho'), ordem.join(' > '));
});

test('falha ao carregar o dataset mostra erro sem deixar controles contraditorios', async () => {
  const { documento, carga } = await montar({ falharCarga: true });
  await carga;

  assert.equal(el(documento, 'erro').hidden, false);
  assert.match(el(documento, 'erro').textContent, /Não foi possível carregar as grades 4×4/);
  assert.equal(palitos(documento).length, 0, 'nenhum tabuleiro pela metade');
  assert.equal(botao(documento, /Voltar ao Jogo/).hidden, true, 'nao pode aparecer junto de "Solucionar"');
  assert.equal(botao(documento, /Jogada/).disabled, true);
});
