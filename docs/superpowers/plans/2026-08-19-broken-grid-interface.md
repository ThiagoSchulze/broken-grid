# Broken Grid — Plano de Implementação da Interface Gráfica

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Broken Grid jogável no navegador — motor de jogo real, quatro telas fiéis ao protótipo e dataset de grades pré-curadas — com o solver isolado atrás de um contrato para a etapa de algoritmos.

**Architecture:** Núcleo em JS puro sem DOM (`src/core/`), solver atrás de contrato (`src/solver/`), dataset em JSON validado no carregamento (`src/dataset/` + `data/`) e camada de interface (`src/ui/`) como única consumidora das três. O estado vive em closure no motor; a interface se inscreve e redesenha. As quatro telas do protótipo são estados da mesma página.

**Tech Stack:** HTML/CSS/JavaScript com ES modules nativos. Zero dependências de runtime. Testes com o runner nativo `node --test`. Tabuleiro em SVG.

**Spec:** `docs/superpowers/specs/2026-08-19-broken-grid-interface-design.md`

## Global Constraints

- **Zero dependências de runtime.** Nenhum pacote npm é instalado. O único `package.json` é metadado (`"type": "module"`), sem `dependencies` nem `devDependencies`.
- **Node 22+** para o runner de testes nativo (`node --test`).
- **Nenhum recurso externo:** sem CDN, sem fontes remotas, sem analytics, sem chamadas de rede além dos arquivos estáticos da própria origem.
- **Nada de `eval`, `new Function` ou `innerHTML` com dado dinâmico.** DOM construído por `createElement`/`createElementNS`, texto por `textContent`.
- **Regra de dependência:** `core/` não importa nada; `solver/` importa apenas `core/`; `dataset/` não importa nada; só `ui/` importa as três. Nenhum arquivo de `core/` pode referenciar `document`, `window` ou `fetch`.
- **Idioma do código:** identificadores, mensagens e comentários em português, como já usado na spec (`removerPalito`, `quadradosVivos`, `bloqueado`).
- **Estados de palito** (valores exatos): `removivel`, `bloqueado`, `quebrado`, `removido`.
- **Formato de id de palito** (exato): `h:<linha>:<coluna>` e `v:<linha>:<coluna>`.
- **Tamanhos de grade suportados:** 4, 5, 6 e 7.
- **Paleta** (hex exatos, amostrados dos protótipos): fundo `#edebe3`, superfície `#ffffff`, tinta `#1b1f22`, ouro `#c4a841`, rosa `#ffafaf`, solução `#b23a48`, vitória-fundo `#dceae4`, vitória-tinta `#2f6f5e`, palito `#000000`, bloqueado `#9c9284`, quebrado `#d5d3cd`, botão preto `#111111`.
- **Commits** em português, no imperativo, uma linha de assunto.

### Dois arquivos a mais que a spec

Este plano acrescenta dois arquivos não listados na seção 4.1 da spec, ambos dentro das fronteiras já aprovadas:

- `src/core/metrics.js` — fórmulas da seção 6 da spec (excedentes, eficiência, tempo). São regra de negócio pura e testável; ficariam escondidas dentro da interface se não fossem extraídas.
- `src/ui/layout.js` — conversão de id de palito em coordenadas SVG. É aritmética pura, testável sem DOM, e mantém `board.js` focado em desenhar.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json` | metadado `"type": "module"` e scripts `test`/`start`. Sem dependências. |
| `src/core/geometry.js` | ids de palito, enumeração de palitos e quadrados de uma grade N×N |
| `src/core/rules.js` | estados de palito, o que conta como presente, motivo de recusa |
| `src/core/grid.js` | monta a grade a partir da config, índice reverso palito→quadrados, contador de vivos |
| `src/core/engine.js` | estado da partida, remover, desfazer, reiniciar, vitória, inscrição |
| `src/core/metrics.js` | excedentes, eficiência, tempo formatado |
| `src/solver/index.js` | contrato público `resolver(config)` |
| `src/solver/referencia.js` | implementação provisória: devolve a referência do dataset |
| `src/dataset/loader.js` | busca o JSON, valida schema, sorteia grade |
| `src/ui/store.js` | estado de visualização + observador |
| `src/ui/layout.js` | coordenadas SVG de cada palito |
| `src/ui/board.js` | desenha e atualiza o tabuleiro SVG |
| `src/ui/controls.js` | seletor de tamanho, Novo Grid, Solucionar, Voltar Última Jogada |
| `src/ui/stats.js` | palitos removidos / quadrados restantes |
| `src/ui/banners.js` | banner do modo Solução e card Grade Eliminada |
| `src/ui/performance.js` | tiles e gráfico comparativo |
| `src/ui/app.js` | composição: liga motor, solver, dataset e renderizadores |
| `src/main.js` | ponto de entrada |
| `src/styles/tokens.css` | variáveis de cor e espaçamento |
| `src/styles/base.css` | reset, tipografia, layout da coluna |
| `src/styles/components.css` | cards, botões, tabuleiro, tiles, gráfico |
| `index.html` | casca única com CSP |
| `tools/gerar-dataset.mjs` | curadoria offline das grades |
| `data/grids/*.json` | dataset commitado |

---

## Task 1: Fundação e geometria

**Files:**
- Create: `package.json`
- Create: `src/core/geometry.js`
- Test: `tests/core/geometry.test.mjs`

**Interfaces:**
- Consumes: nada
- Produces: `HORIZONTAL: 'h'`, `VERTICAL: 'v'`, `idPalito(orientacao, linha, coluna) -> string`, `analisarId(id) -> {orientacao, linha, coluna} | null`, `palitoValido(id, n) -> boolean`, `listarPalitos(n) -> string[]`, `bordasDoQuadrado(tamanho, linha, coluna) -> string[]`, `listarQuadrados(n) -> Array<{tamanho, linha, coluna, bordas}>`

- [ ] **Step 1: Criar o `package.json`**

Sem isto o Node trata `.js` como CommonJS e todo `import` falha. Não instala nada.

```json
{
  "name": "broken-grid",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Broken Grid — puzzle de logica em navegador (Projeto Integrador I, UDESC)",
  "scripts": {
    "test": "node --test tests/",
    "start": "npx --yes serve ."
  }
}
```

- [ ] **Step 2: Escrever o teste que falha**

Crie `tests/core/geometry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idPalito, analisarId, palitoValido, listarPalitos, listarQuadrados, bordasDoQuadrado
} from '../../src/core/geometry.js';

test('idPalito e analisarId sao inversos', () => {
  assert.equal(idPalito('h', 0, 2), 'h:0:2');
  assert.deepEqual(analisarId('v:3:1'), { orientacao: 'v', linha: 3, coluna: 1 });
});

test('analisarId rejeita entradas malformadas', () => {
  for (const ruim of ['x:0:0', 'h:0', 'h:-1:0', 'h:a:0', '', 'h:0:0:0', null]) {
    assert.equal(analisarId(ruim), null, `deveria rejeitar ${ruim}`);
  }
});

test('palitoValido respeita os limites da grade', () => {
  assert.ok(palitoValido('h:4:3', 4));   // ultima linha horizontal
  assert.ok(palitoValido('v:3:4', 4));   // ultima coluna vertical
  assert.ok(!palitoValido('h:5:0', 4));
  assert.ok(!palitoValido('h:0:4', 4));
  assert.ok(!palitoValido('v:4:0', 4));
  assert.ok(!palitoValido('v:0:5', 4));
});

test('listarPalitos devolve 2*n*(n+1) ids distintos', () => {
  for (const n of [4, 5, 6, 7]) {
    const palitos = listarPalitos(n);
    assert.equal(palitos.length, 2 * n * (n + 1));
    assert.equal(new Set(palitos).size, palitos.length);
    for (const id of palitos) assert.ok(palitoValido(id, n), `${id} fora da grade ${n}`);
  }
});

test('listarQuadrados devolve a soma dos quadrados perfeitos', () => {
  assert.equal(listarQuadrados(4).length, 30);   // 16+9+4+1
  assert.equal(listarQuadrados(5).length, 55);   // 25+16+9+4+1
  assert.equal(listarQuadrados(7).length, 140);  // 49+36+25+16+9+4+1
});

test('um quadrado de tamanho k tem 4k bordas distintas e dentro da grade', () => {
  const n = 5;
  const validos = new Set(listarPalitos(n));
  for (const q of listarQuadrados(n)) {
    assert.equal(q.bordas.length, 4 * q.tamanho, `quadrado ${q.tamanho} em ${q.linha},${q.coluna}`);
    assert.equal(new Set(q.bordas).size, q.bordas.length);
    for (const b of q.bordas) assert.ok(validos.has(b), `borda ${b} fora da grade`);
  }
});

test('bordasDoQuadrado do 1x1 no canto superior esquerdo', () => {
  assert.deepEqual(
    [...bordasDoQuadrado(1, 0, 0)].sort(),
    ['h:0:0', 'h:1:0', 'v:0:0', 'v:0:1'].sort()
  );
});

test('bordasDoQuadrado do 2x2 na origem cobre topo, base e laterais', () => {
  assert.deepEqual(
    [...bordasDoQuadrado(2, 0, 0)].sort(),
    ['h:0:0', 'h:0:1', 'h:2:0', 'h:2:1', 'v:0:0', 'v:1:0', 'v:0:2', 'v:1:2'].sort()
  );
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

```
node --test tests/core/geometry.test.mjs
```

Esperado: FALHA com `Cannot find module .../src/core/geometry.js`.

- [ ] **Step 4: Implementar `src/core/geometry.js`**

```js
/**
 * Geometria pura de uma grade N x N: identificadores de palito,
 * enumeracao de palitos e de quadrados. Nao conhece estado de jogo.
 */

export const HORIZONTAL = 'h';
export const VERTICAL = 'v';

export function idPalito(orientacao, linha, coluna) {
  return `${orientacao}:${linha}:${coluna}`;
}

export function analisarId(id) {
  if (typeof id !== 'string') return null;
  const partes = id.split(':');
  if (partes.length !== 3) return null;
  const [orientacao, linha, coluna] = partes;
  if (orientacao !== HORIZONTAL && orientacao !== VERTICAL) return null;
  if (!/^\d+$/.test(linha) || !/^\d+$/.test(coluna)) return null;
  return { orientacao, linha: Number(linha), coluna: Number(coluna) };
}

export function palitoValido(id, n) {
  const p = analisarId(id);
  if (!p) return false;
  const maxLinha = p.orientacao === HORIZONTAL ? n : n - 1;
  const maxColuna = p.orientacao === HORIZONTAL ? n - 1 : n;
  return p.linha <= maxLinha && p.coluna <= maxColuna;
}

export function listarPalitos(n) {
  const palitos = [];
  for (let linha = 0; linha <= n; linha += 1) {
    for (let coluna = 0; coluna < n; coluna += 1) {
      palitos.push(idPalito(HORIZONTAL, linha, coluna));
    }
  }
  for (let linha = 0; linha < n; linha += 1) {
    for (let coluna = 0; coluna <= n; coluna += 1) {
      palitos.push(idPalito(VERTICAL, linha, coluna));
    }
  }
  return palitos;
}

export function bordasDoQuadrado(tamanho, linha, coluna) {
  const bordas = [];
  for (let i = 0; i < tamanho; i += 1) {
    bordas.push(idPalito(HORIZONTAL, linha, coluna + i));
    bordas.push(idPalito(HORIZONTAL, linha + tamanho, coluna + i));
    bordas.push(idPalito(VERTICAL, linha + i, coluna));
    bordas.push(idPalito(VERTICAL, linha + i, coluna + tamanho));
  }
  return bordas;
}

export function listarQuadrados(n) {
  const quadrados = [];
  for (let tamanho = 1; tamanho <= n; tamanho += 1) {
    for (let linha = 0; linha + tamanho <= n; linha += 1) {
      for (let coluna = 0; coluna + tamanho <= n; coluna += 1) {
        quadrados.push({ tamanho, linha, coluna, bordas: bordasDoQuadrado(tamanho, linha, coluna) });
      }
    }
  }
  return quadrados;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

```
node --test tests/core/geometry.test.mjs
```

Esperado: todos os testes PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/core/geometry.js tests/core/geometry.test.mjs
git commit -m "Adiciona geometria da grade e enumeracao de palitos e quadrados"
```

---

## Task 2: Regras e montagem da grade

**Files:**
- Create: `src/core/rules.js`
- Create: `src/core/grid.js`
- Test: `tests/core/grid.test.mjs`

**Interfaces:**
- Consumes: `listarPalitos(n)`, `listarQuadrados(n)`, `palitoValido(id, n)` de `core/geometry.js`
- Produces:
  - de `rules.js`: `ESTADOS` (`{REMOVIVEL:'removivel', BLOQUEADO:'bloqueado', QUEBRADO:'quebrado', REMOVIDO:'removido'}`), `estaPresente(estado) -> boolean`, `motivoRecusa(estado) -> string|null`
  - de `grid.js`: `ErroGrade` (subclasse de `Error`), `montarGrade({n, quebrados, bloqueados}) -> Grade`, `registrarAusencia(grade, id) -> void`, `registrarPresenca(grade, id) -> void`
  - `Grade` = `{ n, palitos: Map<string,string>, quadrados: Array<{tamanho, linha, coluna, bordas, ausentes}>, indice: Map<string, number[]>, quadradosVivos: number }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/core/grid.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, estaPresente, motivoRecusa } from '../../src/core/rules.js';
import { ErroGrade, montarGrade, registrarAusencia, registrarPresenca } from '../../src/core/grid.js';

test('bloqueado conta como presente; quebrado e removido nao', () => {
  assert.ok(estaPresente(ESTADOS.REMOVIVEL));
  assert.ok(estaPresente(ESTADOS.BLOQUEADO));
  assert.ok(!estaPresente(ESTADOS.QUEBRADO));
  assert.ok(!estaPresente(ESTADOS.REMOVIDO));
});

test('motivoRecusa devolve null so para removivel', () => {
  assert.equal(motivoRecusa(ESTADOS.REMOVIVEL), null);
  assert.equal(motivoRecusa(ESTADOS.BLOQUEADO), 'bloqueado');
  assert.equal(motivoRecusa(ESTADOS.QUEBRADO), 'quebrado');
  assert.equal(motivoRecusa(ESTADOS.REMOVIDO), 'ja-removido');
  assert.equal(motivoRecusa(undefined), 'inexistente');
});

test('grade limpa 4x4 tem 40 palitos e 30 quadrados vivos', () => {
  const grade = montarGrade({ n: 4 });
  assert.equal(grade.palitos.size, 40);
  assert.equal(grade.quadrados.length, 30);
  assert.equal(grade.quadradosVivos, 30);
});

test('palito quebrado ja nasce matando os quadrados que dependem dele', () => {
  // h:0:0 e borda de 4 quadrados: os de tamanho 1, 2, 3 e 4 ancorados em (0,0)
  const grade = montarGrade({ n: 4, quebrados: ['h:0:0'] });
  assert.equal(grade.palitos.get('h:0:0'), ESTADOS.QUEBRADO);
  assert.equal(grade.quadradosVivos, 26);
});

test('palito bloqueado nao mata quadrado nenhum', () => {
  const grade = montarGrade({ n: 4, bloqueados: ['h:0:0'] });
  assert.equal(grade.palitos.get('h:0:0'), ESTADOS.BLOQUEADO);
  assert.equal(grade.quadradosVivos, 30);
});

test('o indice reverso liga cada palito aos quadrados que ele afeta', () => {
  const grade = montarGrade({ n: 4 });
  assert.equal(grade.indice.get('h:0:0').length, 4);
  for (const i of grade.indice.get('h:0:0')) {
    assert.ok(grade.quadrados[i].bordas.includes('h:0:0'));
  }
});

test('registrarAusencia e registrarPresenca sao simetricos', () => {
  const grade = montarGrade({ n: 4 });
  registrarAusencia(grade, 'v:1:1');
  const depoisDaAusencia = grade.quadradosVivos;
  assert.ok(depoisDaAusencia < 30);
  registrarPresenca(grade, 'v:1:1');
  assert.equal(grade.quadradosVivos, 30);
});

test('dois palitos ausentes no mesmo quadrado descontam o quadrado uma vez so', () => {
  const grade = montarGrade({ n: 4 });
  const antes = grade.quadradosVivos;
  registrarAusencia(grade, 'h:0:0');
  const depoisDoPrimeiro = grade.quadradosVivos;
  registrarAusencia(grade, 'h:1:0'); // outra borda do mesmo 1x1
  registrarPresenca(grade, 'h:1:0');
  assert.equal(grade.quadradosVivos, depoisDoPrimeiro);
  registrarPresenca(grade, 'h:0:0');
  assert.equal(grade.quadradosVivos, antes);
});

test('montarGrade rejeita configuracao invalida', () => {
  assert.throws(() => montarGrade({ n: 3 }), ErroGrade);
  assert.throws(() => montarGrade({ n: 4, quebrados: ['h:9:9'] }), ErroGrade);
  assert.throws(() => montarGrade({ n: 4, quebrados: ['h:0:0'], bloqueados: ['h:0:0'] }), ErroGrade);
  assert.throws(() => montarGrade({ n: 4, quebrados: ['h:0:0', 'h:0:0'] }), ErroGrade);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```
node --test tests/core/grid.test.mjs
```

Esperado: FALHA com `Cannot find module .../src/core/rules.js`.

- [ ] **Step 3: Implementar `src/core/rules.js`**

```js
/** Estados possiveis de um palito e as regras RN01-RN03 que dependem deles. */

export const ESTADOS = Object.freeze({
  REMOVIVEL: 'removivel',
  BLOQUEADO: 'bloqueado',
  QUEBRADO: 'quebrado',
  REMOVIDO: 'removido',
});

/** RN03: removivel e bloqueado contam como presentes; so quebrado e removido matam o quadrado. */
export function estaPresente(estado) {
  return estado === ESTADOS.REMOVIVEL || estado === ESTADOS.BLOQUEADO;
}

/** RN02: null significa que a remocao e permitida. */
export function motivoRecusa(estado) {
  switch (estado) {
    case ESTADOS.REMOVIVEL: return null;
    case ESTADOS.BLOQUEADO: return 'bloqueado';
    case ESTADOS.QUEBRADO: return 'quebrado';
    case ESTADOS.REMOVIDO: return 'ja-removido';
    default: return 'inexistente';
  }
}
```

- [ ] **Step 4: Implementar `src/core/grid.js`**

```js
import { listarPalitos, listarQuadrados, palitoValido } from './geometry.js';
import { ESTADOS } from './rules.js';

export const TAMANHOS_SUPORTADOS = Object.freeze([4, 5, 6, 7]);

export class ErroGrade extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroGrade';
  }
}

/**
 * Monta a grade a partir da configuracao inicial e constroi, uma unica vez,
 * o indice reverso palito -> quadrados afetados.
 */
export function montarGrade({ n, quebrados = [], bloqueados = [] } = {}) {
  if (!TAMANHOS_SUPORTADOS.includes(n)) {
    throw new ErroGrade(`tamanho de grade nao suportado: ${n}`);
  }
  validarLista(quebrados, n, 'quebrados');
  validarLista(bloqueados, n, 'bloqueados');

  const emAmbas = quebrados.filter((id) => bloqueados.includes(id));
  if (emAmbas.length > 0) {
    throw new ErroGrade(`palito quebrado e bloqueado ao mesmo tempo: ${emAmbas[0]}`);
  }

  const palitos = new Map(listarPalitos(n).map((id) => [id, ESTADOS.REMOVIVEL]));
  const quadrados = listarQuadrados(n).map((q) => ({ ...q, ausentes: 0 }));

  const indice = new Map();
  quadrados.forEach((quadrado, i) => {
    for (const borda of quadrado.bordas) {
      if (!indice.has(borda)) indice.set(borda, []);
      indice.get(borda).push(i);
    }
  });

  const grade = { n, palitos, quadrados, indice, quadradosVivos: quadrados.length };

  for (const id of bloqueados) palitos.set(id, ESTADOS.BLOQUEADO);
  for (const id of quebrados) {
    palitos.set(id, ESTADOS.QUEBRADO);
    registrarAusencia(grade, id);
  }

  return grade;
}

function validarLista(lista, n, rotulo) {
  if (!Array.isArray(lista)) throw new ErroGrade(`${rotulo} deve ser uma lista`);
  const vistos = new Set();
  for (const id of lista) {
    if (!palitoValido(id, n)) throw new ErroGrade(`palito invalido em ${rotulo}: ${id}`);
    if (vistos.has(id)) throw new ErroGrade(`palito repetido em ${rotulo}: ${id}`);
    vistos.add(id);
  }
}

/** O palito deixou de estar presente: atualiza so os quadrados que ele toca. */
export function registrarAusencia(grade, id) {
  for (const i of grade.indice.get(id) ?? []) {
    const quadrado = grade.quadrados[i];
    quadrado.ausentes += 1;
    if (quadrado.ausentes === 1) grade.quadradosVivos -= 1;
  }
}

/** O palito voltou a estar presente (desfazer). */
export function registrarPresenca(grade, id) {
  for (const i of grade.indice.get(id) ?? []) {
    const quadrado = grade.quadrados[i];
    quadrado.ausentes -= 1;
    if (quadrado.ausentes === 0) grade.quadradosVivos += 1;
  }
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

```
node --test tests/core/grid.test.mjs
```

Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/rules.js src/core/grid.js tests/core/grid.test.mjs
git commit -m "Adiciona regras de palito e montagem da grade com indice reverso"
```

---

## Task 3: Motor da partida

**Files:**
- Create: `src/core/engine.js`
- Test: `tests/core/engine.test.mjs`

**Interfaces:**
- Consumes: `montarGrade`, `registrarAusencia`, `registrarPresenca` de `core/grid.js`; `ESTADOS`, `motivoRecusa` de `core/rules.js`
- Produces: `criarPartida(config, { agora }) -> { obterEstado, removerPalito, desfazer, reiniciar, inscrever }`
  - `config` = `{ id?, n, quebrados?, bloqueados?, referencia? }`
  - `obterEstado()` -> `{ n, gridId, palitos: {[id]: estado}, quadradosVivos, palitosRemovidos, historico: string[], status: 'jogando'|'vencido', iniciadoEm, finalizadoEm }` (congelado)
  - `removerPalito(id)` -> `{ ok: true }` ou `{ ok: false, motivo }` com motivo em `bloqueado|quebrado|ja-removido|inexistente|partida-encerrada`
  - `desfazer()` -> `{ ok: true }` ou `{ ok: false, motivo: 'historico-vazio' }`
  - `inscrever(fn)` -> função de cancelamento

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/core/engine.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```
node --test tests/core/engine.test.mjs
```

Esperado: FALHA com `Cannot find module .../src/core/engine.js`.

- [ ] **Step 3: Implementar `src/core/engine.js`**

```js
import { montarGrade, registrarAusencia, registrarPresenca } from './grid.js';
import { ESTADOS, motivoRecusa } from './rules.js';

/**
 * Estado da partida. Vive em closure: a interface so o le por obterEstado()
 * e so o altera pelas acoes, que validam antes de aplicar.
 */
export function criarPartida(config, { agora = () => Date.now() } = {}) {
  const ouvintes = new Set();
  let grade;
  let gridId;
  let historico;
  let palitosRemovidos;
  let status;
  let iniciadoEm;
  let finalizadoEm;

  function iniciar(novaConfig) {
    grade = montarGrade(novaConfig);
    gridId = novaConfig.id ?? null;
    historico = [];
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

    if (grade.quadradosVivos === 0) {
      status = 'vencido';
      finalizadoEm = agora();
    }

    notificar();
    return { ok: true };
  }

  function desfazer() {
    if (historico.length === 0) return { ok: false, motivo: 'historico-vazio' };

    const id = historico.pop();
    grade.palitos.set(id, ESTADOS.REMOVIVEL);
    registrarPresenca(grade, id);
    palitosRemovidos -= 1;

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
```

- [ ] **Step 4: Rodar o teste e ver passar**

```
node --test tests/core/engine.test.mjs
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.js tests/core/engine.test.mjs
git commit -m "Adiciona motor da partida com remocao, desfazer e vitoria"
```

---

## Task 4: Métricas de desempenho

**Files:**
- Create: `src/core/metrics.js`
- Test: `tests/core/metrics.test.mjs`

**Interfaces:**
- Consumes: nada
- Produces: `calcularResumo({ palitosRemovidos, minimo, iniciadoEm, finalizadoEm, agora }) -> { tempoMs, tempoFormatado, palitosRemovidos, minimo, excedentes, eficiencia }`, `formatarTempo(ms) -> string`, `formatarPercentual(valor) -> string`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/core/metrics.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularResumo, formatarTempo, formatarPercentual } from '../../src/core/metrics.js';

test('formatarTempo usa mm:ss', () => {
  assert.equal(formatarTempo(0), '00:00');
  assert.equal(formatarTempo(65_000), '01:05');
  assert.equal(formatarTempo(3_600_000), '60:00');
  assert.equal(formatarTempo(-10), '00:00');
});

test('formatarPercentual usa virgula e some com as casas zeradas', () => {
  assert.equal(formatarPercentual(83.333), '83,33%');
  assert.equal(formatarPercentual(100), '100%');
  assert.equal(formatarPercentual(0), '0%');
});

test('o exemplo da especificacao: minimo 10, jogador 12', () => {
  const resumo = calcularResumo({
    palitosRemovidos: 12, minimo: 10, iniciadoEm: 0, finalizadoEm: 90_000,
  });
  assert.equal(resumo.excedentes, 2);
  assert.equal(Number(resumo.eficiencia.toFixed(2)), 83.33);
  assert.equal(resumo.tempoFormatado, '01:30');
});

test('eficiencia de 100% quando o jogador iguala o minimo', () => {
  const resumo = calcularResumo({ palitosRemovidos: 10, minimo: 10, iniciadoEm: 0, finalizadoEm: 0 });
  assert.equal(resumo.eficiencia, 100);
  assert.equal(resumo.excedentes, 0);
});

test('sem remocoes a eficiencia e zero, sem divisao por zero', () => {
  const resumo = calcularResumo({ palitosRemovidos: 0, minimo: 10, iniciadoEm: 0, finalizadoEm: 0 });
  assert.equal(resumo.eficiencia, 0);
});

test('sem referencia disponivel, minimo e excedentes ficam nulos', () => {
  const resumo = calcularResumo({ palitosRemovidos: 5, minimo: null, iniciadoEm: 0, finalizadoEm: 1000 });
  assert.equal(resumo.minimo, null);
  assert.equal(resumo.excedentes, null);
  assert.equal(resumo.eficiencia, 0);
});

test('partida em andamento mede o tempo ate agora', () => {
  const resumo = calcularResumo({
    palitosRemovidos: 3, minimo: 10, iniciadoEm: 1000, finalizadoEm: null, agora: 31_000,
  });
  assert.equal(resumo.tempoFormatado, '00:30');
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```
node --test tests/core/metrics.test.mjs
```

Esperado: FALHA com `Cannot find module .../src/core/metrics.js`.

- [ ] **Step 3: Implementar `src/core/metrics.js`**

```js
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
```

- [ ] **Step 4: Rodar o teste e ver passar**

```
node --test tests/core/metrics.test.mjs
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/metrics.js tests/core/metrics.test.mjs
git commit -m "Adiciona metricas de excedentes, eficiencia e tempo"
```

---

## Task 5: Gerador do dataset e as grades commitadas

**Files:**
- Create: `tools/gerar-dataset.mjs`
- Create: `data/grids/4x4.json`, `5x5.json`, `6x6.json`, `7x7.json` (geradas, não escritas à mão)
- Test: `tests/tools/gerar-dataset.test.mjs`

**Interfaces:**
- Consumes: `listarPalitos` de `core/geometry.js`; `montarGrade`, `registrarAusencia`, `registrarPresenca` de `core/grid.js`; `ESTADOS` de `core/rules.js`
- Produces: `criarRng(seed) -> () => number`, `gerarGrade(n, rng, opcoes) -> { n, quebrados, bloqueados, dificuldade, referencia }`, `classificarDificuldade(quantidade) -> 'facil'|'medio'|'dificil'`, `gerarDataset(n, { seed, quantidade }) -> objeto do schema da seção 6.1 da spec`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/tools/gerar-dataset.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRng, gerarGrade, gerarDataset } from '../../tools/gerar-dataset.mjs';
import { montarGrade, registrarAusencia } from '../../src/core/grid.js';
import { ESTADOS } from '../../src/core/rules.js';

test('o mesmo seed produz o mesmo dataset', () => {
  const a = gerarDataset(4, { seed: 42, quantidade: 3 });
  const b = gerarDataset(4, { seed: 42, quantidade: 3 });
  assert.deepEqual(a, b);
});

test('seeds diferentes produzem grades diferentes', () => {
  const a = gerarDataset(4, { seed: 1, quantidade: 3 });
  const b = gerarDataset(4, { seed: 2, quantidade: 3 });
  assert.notDeepEqual(a.grids, b.grids);
});

test('RN04 e RN05: todo quadrado vivo tem ao menos um lado removivel', () => {
  for (const n of [4, 5, 6, 7]) {
    const rng = criarRng(7 + n);
    for (let i = 0; i < 15; i += 1) {
      const config = gerarGrade(n, rng);
      const grade = montarGrade(config);
      for (const quadrado of grade.quadrados) {
        if (quadrado.ausentes > 0) continue;
        const removiveis = quadrado.bordas.filter((b) => grade.palitos.get(b) === ESTADOS.REMOVIVEL);
        assert.ok(removiveis.length > 0, `quadrado sem lado removivel na grade ${n}`);
      }
    }
  }
});

test('a referencia elimina de fato todos os quadrados vivos', () => {
  for (const n of [4, 5, 6, 7]) {
    const rng = criarRng(100 + n);
    for (let i = 0; i < 15; i += 1) {
      const config = gerarGrade(n, rng);
      const grade = montarGrade(config);
      for (const id of config.referencia.palitos) registrarAusencia(grade, id);
      assert.equal(grade.quadradosVivos, 0, `referencia insuficiente na grade ${n}`);
    }
  }
});

test('a referencia e irredutivel: tirar qualquer palito dela deixa quadrado vivo', () => {
  const rng = criarRng(2024);
  for (let i = 0; i < 10; i += 1) {
    const config = gerarGrade(4, rng);
    for (const excluido of config.referencia.palitos) {
      const grade = montarGrade(config);
      for (const id of config.referencia.palitos) {
        if (id !== excluido) registrarAusencia(grade, id);
      }
      assert.ok(grade.quadradosVivos > 0, `${excluido} era redundante na referencia`);
    }
  }
});

test('a referencia nunca contem palito quebrado ou bloqueado', () => {
  const rng = criarRng(555);
  for (let i = 0; i < 20; i += 1) {
    const config = gerarGrade(6, rng);
    for (const id of config.referencia.palitos) {
      assert.ok(!config.quebrados.includes(id), `${id} quebrado dentro da referencia`);
      assert.ok(!config.bloqueados.includes(id), `${id} bloqueado dentro da referencia`);
    }
    assert.equal(config.referencia.quantidade, config.referencia.palitos.length);
    assert.equal(config.referencia.proven, false);
  }
});

test('gerarDataset respeita o schema e da id unico a cada grade', () => {
  const dataset = gerarDataset(5, { seed: 9, quantidade: 6 });
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.n, 5);
  assert.equal(dataset.seed, 9);
  assert.equal(dataset.grids.length, 6);
  assert.equal(new Set(dataset.grids.map((g) => g.id)).size, 6);
  for (const grid of dataset.grids) {
    assert.match(grid.id, /^g5-\d{3}$/);
    assert.ok(['facil', 'medio', 'dificil'].includes(grid.dificuldade));
  }
});

test('grades triviais sao descartadas: toda grade comeca com quadrados vivos suficientes', () => {
  const rng = criarRng(31);
  for (let i = 0; i < 20; i += 1) {
    const config = gerarGrade(4, rng);
    const grade = montarGrade(config);
    assert.ok(grade.quadradosVivos >= 4, `grade trivial com ${grade.quadradosVivos} vivos`);
  }
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```
node --test tests/tools/gerar-dataset.test.mjs
```

Esperado: FALHA com `Cannot find module .../tools/gerar-dataset.mjs`.

- [ ] **Step 3: Implementar `tools/gerar-dataset.mjs`**

Note o passo 4 (bloqueados sorteados só fora do conjunto de corte): é ele que garante RN04 e RN05 por construção, sem precisar de solver.

```js
/**
 * Curadoria offline das grades. Nunca roda no navegador.
 *
 * Uso: node tools/gerar-dataset.mjs [--quantidade 20] [--seed 20260819]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listarPalitos } from '../src/core/geometry.js';
import { montarGrade, registrarAusencia, registrarPresenca } from '../src/core/grid.js';
import { ESTADOS } from '../src/core/rules.js';

const TAMANHOS = [4, 5, 6, 7];
const MINIMO_QUADRADOS_VIVOS = 4;
const MAX_TENTATIVAS = 200;

/** Mulberry32: PRNG deterministico, para o dataset ser reproduzivel a partir do seed. */
export function criarRng(seed) {
  let estado = seed >>> 0;
  return function proximo() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escolher(rng, lista) {
  return lista[Math.floor(rng() * lista.length)];
}

export function classificarDificuldade(quantidade) {
  if (quantidade <= 4) return 'facil';
  if (quantidade <= 9) return 'medio';
  return 'dificil';
}

/**
 * 1. sorteia quebrados
 * 2. constroi um conjunto de corte que elimina todos os quadrados vivos
 * 3. poda os palitos redundantes do corte (fica irredutivel)
 * 4. sorteia bloqueados apenas FORA do corte -> RN04 e RN05 valem por construcao
 */
export function gerarGrade(n, rng, { proporcaoQuebrados = 0.12, proporcaoBloqueados = 0.25 } = {}) {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa += 1) {
    const todos = listarPalitos(n);
    const quebrados = todos.filter(() => rng() < proporcaoQuebrados);

    const grade = montarGrade({ n, quebrados });
    if (grade.quadradosVivos < MINIMO_QUADRADOS_VIVOS) continue;

    const corte = [];
    while (grade.quadradosVivos > 0) {
      const vivos = grade.quadrados.filter((q) => q.ausentes === 0);
      const alvo = escolher(rng, vivos);
      // Um quadrado vivo tem todos os lados presentes e, nesta fase, nenhum bloqueado ainda.
      const candidatos = alvo.bordas.filter((b) => grade.palitos.get(b) === ESTADOS.REMOVIVEL);
      const escolhido = escolher(rng, candidatos);
      grade.palitos.set(escolhido, ESTADOS.REMOVIDO);
      registrarAusencia(grade, escolhido);
      corte.push(escolhido);
    }

    for (const id of [...corte]) {
      grade.palitos.set(id, ESTADOS.REMOVIVEL);
      registrarPresenca(grade, id);
      if (grade.quadradosVivos === 0) {
        corte.splice(corte.indexOf(id), 1);
      } else {
        grade.palitos.set(id, ESTADOS.REMOVIDO);
        registrarAusencia(grade, id);
      }
    }

    const noCorte = new Set(corte);
    const quebradosSet = new Set(quebrados);
    const bloqueados = todos.filter(
      (id) => !noCorte.has(id) && !quebradosSet.has(id) && rng() < proporcaoBloqueados,
    );

    return {
      n,
      quebrados,
      bloqueados,
      dificuldade: classificarDificuldade(corte.length),
      referencia: { palitos: corte, quantidade: corte.length, proven: false },
    };
  }
  throw new Error(`nao foi possivel gerar grade ${n}x${n} em ${MAX_TENTATIVAS} tentativas`);
}

export function gerarDataset(n, { seed, quantidade = 20, geradoEm = '2026-08-19' } = {}) {
  const rng = criarRng(seed);
  const grids = [];
  const assinaturas = new Set();

  while (grids.length < quantidade) {
    const config = gerarGrade(n, rng);
    const assinatura = JSON.stringify([config.quebrados, config.bloqueados]);
    if (assinaturas.has(assinatura)) continue;
    assinaturas.add(assinatura);

    grids.push({
      id: `g${n}-${String(grids.length + 1).padStart(3, '0')}`,
      quebrados: config.quebrados,
      bloqueados: config.bloqueados,
      dificuldade: config.dificuldade,
      referencia: config.referencia,
    });
  }

  return { schemaVersion: 1, n, geradoEm, seed, grids };
}

function lerArgumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : Number(process.argv[i + 1]);
}

async function principal() {
  const quantidade = lerArgumento('quantidade', 20);
  const seedBase = lerArgumento('seed', 20260819);
  const destino = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'grids');
  await mkdir(destino, { recursive: true });

  for (const n of TAMANHOS) {
    const dataset = gerarDataset(n, { seed: seedBase + n, quantidade });
    const arquivo = resolve(destino, `${n}x${n}.json`);
    await writeFile(arquivo, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
    console.log(`${arquivo}: ${dataset.grids.length} grades`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```
node --test tests/tools/gerar-dataset.test.mjs
```

Esperado: todos PASS. Se o teste de irredutibilidade falhar, o laço de poda está reavaliando o corte errado — confira que `registrarPresenca` é chamado antes de checar `quadradosVivos`.

- [ ] **Step 5: Gerar o dataset**

```
node tools/gerar-dataset.mjs --quantidade 20
```

Esperado: quatro linhas no console, uma por tamanho, cada uma com 20 grades.

- [ ] **Step 6: Conferir uma grade a olho**

```
node -e "const d=require('fs').readFileSync('data/grids/4x4.json','utf8');const j=JSON.parse(d);console.log(j.grids[0])"
```

Esperado: objeto com `id: 'g4-001'`, listas `quebrados`/`bloqueados` sem interseção, e `referencia.proven === false`.

- [ ] **Step 7: Commit**

```bash
git add tools/gerar-dataset.mjs tests/tools/gerar-dataset.test.mjs data/grids
git commit -m "Adiciona gerador do dataset e as grades pre-curadas"
```

---

## Task 6: Carregamento e validação do dataset

**Files:**
- Create: `src/dataset/loader.js`
- Test: `tests/dataset/loader.test.mjs`

**Interfaces:**
- Consumes: `palitoValido` de `core/geometry.js`; `TAMANHOS_SUPORTADOS` de `core/grid.js`
- Produces: `ErroDataset`, `validarDataset(dados) -> dataset`, `carregarDataset(n, { buscar }) -> Promise<dataset>`, `escolherGrade(dataset, { rng, exceto }) -> grid`, `configDaGrade(dataset, grid) -> { id, n, quebrados, bloqueados, referencia }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/dataset/loader.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ErroDataset, validarDataset, carregarDataset, escolherGrade, configDaGrade,
} from '../../src/dataset/loader.js';

function datasetValido() {
  return {
    schemaVersion: 1,
    n: 4,
    geradoEm: '2026-08-19',
    seed: 1,
    grids: [
      {
        id: 'g4-001',
        quebrados: ['h:0:1'],
        bloqueados: ['v:2:2'],
        dificuldade: 'medio',
        referencia: { palitos: ['h:0:0', 'v:1:1'], quantidade: 2, proven: false },
      },
      {
        id: 'g4-002',
        quebrados: [],
        bloqueados: [],
        dificuldade: 'facil',
        referencia: { palitos: ['h:1:1'], quantidade: 1, proven: false },
      },
    ],
  };
}

test('um dataset bem formado passa na validacao', () => {
  assert.doesNotThrow(() => validarDataset(datasetValido()));
});

test('rejeita versao de schema desconhecida', () => {
  const d = datasetValido();
  d.schemaVersion = 2;
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita tamanho de grade fora de 4 a 7', () => {
  const d = datasetValido();
  d.n = 3;
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita id ausente ou duplicado', () => {
  const semId = datasetValido();
  delete semId.grids[0].id;
  assert.throws(() => validarDataset(semId), ErroDataset);

  const duplicado = datasetValido();
  duplicado.grids[1].id = 'g4-001';
  assert.throws(() => validarDataset(duplicado), ErroDataset);
});

test('rejeita palito com formato ou coordenada invalida', () => {
  const d = datasetValido();
  d.grids[0].quebrados = ['h:9:9'];
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita palito quebrado e bloqueado ao mesmo tempo', () => {
  const d = datasetValido();
  d.grids[0].bloqueados = ['h:0:1'];
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita referencia que contem palito quebrado ou bloqueado', () => {
  const comQuebrado = datasetValido();
  comQuebrado.grids[0].referencia.palitos = ['h:0:1', 'v:1:1'];
  assert.throws(() => validarDataset(comQuebrado), ErroDataset);

  const comBloqueado = datasetValido();
  comBloqueado.grids[0].referencia.palitos = ['v:2:2', 'v:1:1'];
  assert.throws(() => validarDataset(comBloqueado), ErroDataset);
});

test('rejeita quantidade incoerente com a lista da referencia', () => {
  const d = datasetValido();
  d.grids[0].referencia.quantidade = 99;
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita dataset sem nenhuma grade', () => {
  const d = datasetValido();
  d.grids = [];
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('carregarDataset busca, faz o parse e valida', async () => {
  const buscar = async (url) => {
    assert.equal(url, 'data/grids/4x4.json');
    return { ok: true, text: async () => JSON.stringify(datasetValido()) };
  };
  const dataset = await carregarDataset(4, { buscar });
  assert.equal(dataset.grids.length, 2);
});

test('carregarDataset falha com mensagem clara em HTTP ruim ou JSON quebrado', async () => {
  await assert.rejects(
    () => carregarDataset(4, { buscar: async () => ({ ok: false, status: 404 }) }),
    ErroDataset,
  );
  await assert.rejects(
    () => carregarDataset(4, { buscar: async () => ({ ok: true, text: async () => '{ nao e json' }) }),
    ErroDataset,
  );
});

test('escolherGrade evita repetir a grade atual', () => {
  const dataset = validarDataset(datasetValido());
  for (let i = 0; i < 20; i += 1) {
    const grid = escolherGrade(dataset, { exceto: 'g4-001' });
    assert.equal(grid.id, 'g4-002');
  }
});

test('escolherGrade com uma unica grade devolve a propria', () => {
  const dataset = validarDataset(datasetValido());
  dataset.grids.pop();
  assert.equal(escolherGrade(dataset, { exceto: 'g4-001' }).id, 'g4-001');
});

test('configDaGrade monta a config que o motor consome', () => {
  const dataset = validarDataset(datasetValido());
  const config = configDaGrade(dataset, dataset.grids[0]);
  assert.deepEqual(config, {
    id: 'g4-001',
    n: 4,
    quebrados: ['h:0:1'],
    bloqueados: ['v:2:2'],
    referencia: { palitos: ['h:0:0', 'v:1:1'], quantidade: 2, proven: false },
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```
node --test tests/dataset/loader.test.mjs
```

Esperado: FALHA com `Cannot find module .../src/dataset/loader.js`.

- [ ] **Step 3: Implementar `src/dataset/loader.js`**

```js
import { palitoValido } from '../core/geometry.js';
import { TAMANHOS_SUPORTADOS } from '../core/grid.js';

const VERSAO_SUPORTADA = 1;
const DIFICULDADES = ['facil', 'medio', 'dificil'];

export class ErroDataset extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDataset';
  }
}

/**
 * Valida a FORMA do dataset. Solucionabilidade (RN04/RN05) e responsabilidade
 * da curadoria em tools/gerar-dataset.mjs, conforme o RF11.
 */
export function validarDataset(dados) {
  if (!dados || typeof dados !== 'object') throw new ErroDataset('dataset vazio ou invalido');
  if (dados.schemaVersion !== VERSAO_SUPORTADA) {
    throw new ErroDataset(`versao de schema nao suportada: ${dados.schemaVersion}`);
  }
  if (!TAMANHOS_SUPORTADOS.includes(dados.n)) {
    throw new ErroDataset(`tamanho de grade nao suportado: ${dados.n}`);
  }
  if (!Array.isArray(dados.grids) || dados.grids.length === 0) {
    throw new ErroDataset('dataset sem grades');
  }

  const ids = new Set();
  for (const grid of dados.grids) {
    if (typeof grid.id !== 'string' || grid.id === '') throw new ErroDataset('grade sem id');
    if (ids.has(grid.id)) throw new ErroDataset(`id de grade repetido: ${grid.id}`);
    ids.add(grid.id);

    const quebrados = listaDePalitos(grid.quebrados, dados.n, `${grid.id}.quebrados`);
    const bloqueados = listaDePalitos(grid.bloqueados, dados.n, `${grid.id}.bloqueados`);

    const conflito = quebrados.find((id) => bloqueados.includes(id));
    if (conflito) throw new ErroDataset(`${grid.id}: ${conflito} quebrado e bloqueado ao mesmo tempo`);

    if (grid.dificuldade !== undefined && !DIFICULDADES.includes(grid.dificuldade)) {
      throw new ErroDataset(`${grid.id}: dificuldade invalida ${grid.dificuldade}`);
    }

    const referencia = grid.referencia;
    if (!referencia || typeof referencia !== 'object') {
      throw new ErroDataset(`${grid.id}: referencia ausente`);
    }
    const palitos = listaDePalitos(referencia.palitos, dados.n, `${grid.id}.referencia`);
    if (referencia.quantidade !== palitos.length) {
      throw new ErroDataset(`${grid.id}: quantidade da referencia nao bate com a lista`);
    }
    for (const id of palitos) {
      if (quebrados.includes(id)) throw new ErroDataset(`${grid.id}: referencia usa palito quebrado ${id}`);
      if (bloqueados.includes(id)) throw new ErroDataset(`${grid.id}: referencia usa palito bloqueado ${id}`);
    }
  }

  return dados;
}

function listaDePalitos(lista, n, rotulo) {
  if (!Array.isArray(lista)) throw new ErroDataset(`${rotulo} deve ser uma lista`);
  const vistos = new Set();
  for (const id of lista) {
    if (!palitoValido(id, n)) throw new ErroDataset(`${rotulo}: palito invalido ${id}`);
    if (vistos.has(id)) throw new ErroDataset(`${rotulo}: palito repetido ${id}`);
    vistos.add(id);
  }
  return lista;
}

export async function carregarDataset(n, { buscar = fetch } = {}) {
  const url = `data/grids/${n}x${n}.json`;
  let resposta;
  try {
    resposta = await buscar(url);
  } catch (erro) {
    throw new ErroDataset(`falha ao buscar ${url}: ${erro.message}`);
  }
  if (!resposta.ok) throw new ErroDataset(`falha ao buscar ${url}: HTTP ${resposta.status}`);

  const texto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (erro) {
    throw new ErroDataset(`${url} nao e JSON valido: ${erro.message}`);
  }

  return validarDataset(dados);
}

export function escolherGrade(dataset, { rng = Math.random, exceto = null } = {}) {
  const candidatas = dataset.grids.filter((grid) => grid.id !== exceto);
  const lista = candidatas.length > 0 ? candidatas : dataset.grids;
  return lista[Math.floor(rng() * lista.length)];
}

export function configDaGrade(dataset, grid) {
  return {
    id: grid.id,
    n: dataset.n,
    quebrados: grid.quebrados,
    bloqueados: grid.bloqueados,
    referencia: grid.referencia,
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```
node --test tests/dataset/loader.test.mjs
```

Esperado: todos PASS.

- [ ] **Step 5: Validar o dataset real gerado na Task 5**

```
node -e "import('./src/dataset/loader.js').then(async m=>{const fs=await import('node:fs/promises');for(const n of [4,5,6,7]){const d=JSON.parse(await fs.readFile('data/grids/'+n+'x'+n+'.json','utf8'));m.validarDataset(d);console.log(n,'ok',d.grids.length)}})"
```

Esperado: quatro linhas `4 ok 20`, `5 ok 20`, `6 ok 20`, `7 ok 20`.

- [ ] **Step 6: Commit**

```bash
git add src/dataset/loader.js tests/dataset/loader.test.mjs
git commit -m "Adiciona carregamento e validacao de schema do dataset"
```

---

## Task 7: Contrato do solver

**Files:**
- Create: `src/solver/referencia.js`
- Create: `src/solver/index.js`
- Test: `tests/solver/solver.test.mjs`

**Interfaces:**
- Consumes: nada (recebe a config já pronta)
- Produces: `resolver(config, opcoes) -> Promise<{ palitos, quantidade, proven, origem, tempoMs }>`, `ErroSolver`

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/solver/solver.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolver, ErroSolver } from '../../src/solver/index.js';

const config = {
  id: 'g4-001',
  n: 4,
  quebrados: [],
  bloqueados: [],
  referencia: { palitos: ['h:0:0', 'v:1:1'], quantidade: 2, proven: false },
};

test('o solver devolve a referencia do dataset, marcada como nao comprovada', async () => {
  const resultado = await resolver(config);
  assert.deepEqual(resultado.palitos, ['h:0:0', 'v:1:1']);
  assert.equal(resultado.quantidade, 2);
  assert.equal(resultado.proven, false);
  assert.equal(resultado.origem, 'dataset');
  assert.equal(typeof resultado.tempoMs, 'number');
});

test('o solver devolve copia: mexer no resultado nao altera a config', async () => {
  const resultado = await resolver(config);
  resultado.palitos.push('h:3:3');
  assert.equal(config.referencia.palitos.length, 2);
});

test('grade sem referencia produz ErroSolver com mensagem clara', async () => {
  await assert.rejects(() => resolver({ id: 'g4-002', n: 4 }), ErroSolver);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```
node --test tests/solver/solver.test.mjs
```

Esperado: FALHA com `Cannot find module .../src/solver/index.js`.

- [ ] **Step 3: Implementar `src/solver/referencia.js`**

```js
/**
 * Implementacao PROVISORIA do solver (etapa de interface grafica).
 *
 * Devolve a solucao de referencia que o gerador do dataset gravou. Ela e um
 * conjunto irredutivel, porem nao comprovadamente minimo — dai proven: false.
 * Na etapa de algoritmos este arquivo e substituido pela heuristica gulosa
 * mais a busca exata, sem que index.js, core/ ou ui/ precisem mudar.
 */

export class ErroSolver extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroSolver';
  }
}

export async function resolverPorReferencia(config, opcoes = {}) {
  const inicio = Date.now();
  void opcoes; // orcamento de tempo/nos so passa a valer com o solver real
  const referencia = config?.referencia;

  if (!referencia || !Array.isArray(referencia.palitos)) {
    throw new ErroSolver(`grade ${config?.id ?? 'desconhecida'} nao tem solucao de referencia`);
  }

  return {
    palitos: [...referencia.palitos],
    quantidade: referencia.quantidade,
    proven: false,
    origem: 'dataset',
    tempoMs: Date.now() - inicio,
  };
}
```

- [ ] **Step 4: Implementar `src/solver/index.js`**

```js
import { resolverPorReferencia, ErroSolver } from './referencia.js';

export { ErroSolver };

/**
 * Contrato publico do solver. Sempre recebe a configuracao INICIAL da grade
 * (RN07), nunca o progresso do jogador.
 *
 * @returns {Promise<{palitos: string[], quantidade: number, proven: boolean,
 *   origem: 'dataset'|'guloso'|'exato', tempoMs: number}>}
 */
export async function resolver(config, opcoes = {}) {
  return resolverPorReferencia(config, opcoes);
}
```

- [ ] **Step 5: Rodar toda a bateria de testes**

```
node --test tests/
```

Esperado: todos os arquivos de teste PASS.

- [ ] **Step 6: Commit**

```bash
git add src/solver tests/solver
git commit -m "Adiciona contrato do solver com implementacao por referencia"
```

---

## Task 8: Layout do tabuleiro e store da interface

**Files:**
- Create: `src/ui/layout.js`
- Create: `src/ui/store.js`
- Test: `tests/ui/layout.test.mjs`, `tests/ui/store.test.mjs`

**Interfaces:**
- Consumes: `analisarId` de `core/geometry.js`
- Produces:
  - `calcularLayout(n, { margem, passo }) -> { n, margem, passo, largura, altura }`
  - `coordenadasDoPalito(id, layout) -> { x1, y1, x2, y2 }`
  - `criarStore(inicial) -> { obter, atualizar, inscrever }`

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/ui/layout.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularLayout, coordenadasDoPalito } from '../../src/ui/layout.js';

test('o layout cresce com n e reserva margem nos dois lados', () => {
  const layout = calcularLayout(4, { margem: 20, passo: 80 });
  assert.equal(layout.largura, 20 * 2 + 4 * 80);
  assert.equal(layout.altura, layout.largura);
});

test('um palito horizontal vai da coluna c ate c+1 na mesma linha', () => {
  const layout = calcularLayout(4, { margem: 20, passo: 80 });
  assert.deepEqual(coordenadasDoPalito('h:1:2', layout), {
    x1: 20 + 2 * 80, y1: 20 + 1 * 80, x2: 20 + 3 * 80, y2: 20 + 1 * 80,
  });
});

test('um palito vertical vai da linha r ate r+1 na mesma coluna', () => {
  const layout = calcularLayout(4, { margem: 20, passo: 80 });
  assert.deepEqual(coordenadasDoPalito('v:1:2', layout), {
    x1: 20 + 2 * 80, y1: 20 + 1 * 80, x2: 20 + 2 * 80, y2: 20 + 2 * 80,
  });
});

test('todo palito da grade cabe dentro do viewBox', () => {
  const layout = calcularLayout(7);
  for (const id of ['h:0:0', 'h:7:6', 'v:0:0', 'v:6:7']) {
    const { x1, y1, x2, y2 } = coordenadasDoPalito(id, layout);
    for (const v of [x1, x2]) assert.ok(v >= 0 && v <= layout.largura, `${id} fora em x`);
    for (const v of [y1, y2]) assert.ok(v >= 0 && v <= layout.altura, `${id} fora em y`);
  }
});

test('id invalido devolve null em vez de coordenadas erradas', () => {
  assert.equal(coordenadasDoPalito('x:1:1', calcularLayout(4)), null);
});
```

Crie `tests/ui/store.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarStore } from '../../src/ui/store.js';

test('obter devolve o estado inicial congelado', () => {
  const store = criarStore({ vista: 'jogo' });
  assert.equal(store.obter().vista, 'jogo');
  assert.ok(Object.isFrozen(store.obter()));
});

test('atualizar faz merge parcial e notifica os inscritos', () => {
  const store = criarStore({ vista: 'jogo', solucao: null });
  const recebidos = [];
  store.inscrever((estado) => recebidos.push(estado.vista));
  store.atualizar({ vista: 'solucao' });
  assert.equal(store.obter().vista, 'solucao');
  assert.equal(store.obter().solucao, null, 'campos nao citados permanecem');
  assert.deepEqual(recebidos, ['solucao']);
});

test('o cancelamento para de notificar', () => {
  const store = criarStore({ vista: 'jogo' });
  const recebidos = [];
  const cancelar = store.inscrever((estado) => recebidos.push(estado.vista));
  store.atualizar({ vista: 'solucao' });
  cancelar();
  store.atualizar({ vista: 'desempenho' });
  assert.deepEqual(recebidos, ['solucao']);
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

```
node --test tests/ui/
```

Esperado: FALHA com `Cannot find module .../src/ui/layout.js`.

- [ ] **Step 3: Implementar `src/ui/layout.js`**

```js
import { analisarId, HORIZONTAL } from '../core/geometry.js';

/** Geometria de tela do tabuleiro. Aritmetica pura: nao toca no DOM. */
export function calcularLayout(n, { margem = 24, passo = 80 } = {}) {
  const lado = margem * 2 + n * passo;
  return { n, margem, passo, largura: lado, altura: lado };
}

export function coordenadasDoPalito(id, layout) {
  const p = analisarId(id);
  if (!p) return null;

  const x = layout.margem + p.coluna * layout.passo;
  const y = layout.margem + p.linha * layout.passo;

  return p.orientacao === HORIZONTAL
    ? { x1: x, y1: y, x2: x + layout.passo, y2: y }
    : { x1: x, y1: y, x2: x, y2: y + layout.passo };
}
```

- [ ] **Step 4: Implementar `src/ui/store.js`**

```js
/** Estado de VISUALIZACAO da interface (vista atual, solucao carregada, tique do relogio). */
export function criarStore(inicial) {
  let estado = Object.freeze({ ...inicial });
  const ouvintes = new Set();

  return {
    obter: () => estado,
    atualizar(parcial) {
      estado = Object.freeze({ ...estado, ...parcial });
      for (const ouvinte of ouvintes) ouvinte(estado);
    },
    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}
```

- [ ] **Step 5: Rodar os testes e ver passar**

```
node --test tests/ui/
```

Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/layout.js src/ui/store.js tests/ui
git commit -m "Adiciona layout do tabuleiro e store da interface"
```

---

## Task 9: Casca da página, estilos e tabuleiro SVG

A partir daqui a verificação é visual, contra `docs/prototipos/alta-01-inicio-de-jogo.png`. Mantenha o PNG aberto ao lado do navegador.

**Files:**
- Create: `index.html`
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/components.css`
- Create: `src/ui/board.js`
- Create: `src/main.js`

**Interfaces:**
- Consumes: `calcularLayout`, `coordenadasDoPalito` de `ui/layout.js`; `ESTADOS` de `core/rules.js`
- Produces: `criarTabuleiro(svg, { aoAtivarPalito }) -> { renderizar(estado, { solucao, interativo }) }`

- [ ] **Step 1: Criar `index.html`**

A CSP é obrigatória e é a razão de não haver nenhum `<style>` ou `<script>` inline.

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'">
  <title>Broken Grid</title>
  <link rel="stylesheet" href="src/styles/tokens.css">
  <link rel="stylesheet" href="src/styles/base.css">
  <link rel="stylesheet" href="src/styles/components.css">
</head>
<body>
  <main class="coluna">
    <header class="cabecalho">
      <h1>BROKEN GRID</h1>
      <p class="subtitulo">Remova o menor número possível de palitos até não sobrar nenhum quadrado completo.</p>
    </header>

    <section class="controles" id="controles"></section>
    <section class="banners" id="banners"></section>
    <section class="stats" id="stats"></section>

    <section class="cartao cartao--tabuleiro">
      <svg id="tabuleiro" class="tabuleiro" role="application"
           aria-label="Tabuleiro do Broken Grid"></svg>
      <ul class="legenda">
        <li><span class="amostra amostra--removivel"></span>Removível</li>
        <li><span class="amostra amostra--bloqueado"></span>Bloqueado</li>
        <li><span class="amostra amostra--quebrado"></span>Quebrado</li>
      </ul>
    </section>

    <section class="rodape-acoes" id="acoes"></section>
    <section class="desempenho" id="desempenho" hidden></section>
    <p class="erro" id="erro" role="alert" hidden></p>
  </main>

  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Criar `src/styles/tokens.css`**

```css
:root {
  --fundo: #edebe3;
  --superficie: #ffffff;
  --tinta: #1b1f22;
  --tinta-suave: #6b6b6b;
  --borda: #e0dfd8;

  --acento-ouro: #c4a841;
  --acento-rosa: #ffafaf;
  --solucao: #b23a48;
  --vitoria-fundo: #dceae4;
  --vitoria-tinta: #2f6f5e;
  --preto-botao: #111111;

  --palito: #000000;
  --palito-bloqueado: #9c9284;
  --palito-quebrado: #d5d3cd;

  --raio: 10px;
  --espaco-1: 6px;
  --espaco-2: 12px;
  --espaco-3: 20px;
  --coluna-max: 560px;

  --fonte-titulo: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --fonte-texto: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
}
```

- [ ] **Step 3: Criar `src/styles/base.css`**

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  padding: var(--espaco-3) var(--espaco-2) 48px;
  background: var(--fundo);
  color: var(--tinta);
  font-family: var(--fonte-texto);
}

.coluna {
  max-width: var(--coluna-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--espaco-2);
}

.cabecalho { text-align: center; }

.cabecalho h1 {
  font-family: var(--fonte-titulo);
  font-size: 1.6rem;
  letter-spacing: 0.08em;
  margin: var(--espaco-3) 0 var(--espaco-1);
}

.subtitulo {
  margin: 0 auto;
  max-width: 42ch;
  font-size: 0.85rem;
  color: var(--tinta-suave);
}

.erro {
  background: var(--acento-rosa);
  color: var(--tinta);
  padding: var(--espaco-2);
  border-radius: var(--raio);
  text-align: center;
}

[hidden] { display: none !important; }
```

- [ ] **Step 4: Criar `src/styles/components.css`**

```css
.cartao {
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
  padding: var(--espaco-3);
}

.cartao--tabuleiro { display: flex; flex-direction: column; align-items: center; gap: var(--espaco-2); }

.tabuleiro { width: 100%; max-width: 420px; height: auto; }

.palito__toque { stroke: transparent; stroke-width: 16; fill: none; }
.palito__linha { stroke-linecap: round; fill: none; }

.palito--removivel .palito__linha { stroke: var(--palito); stroke-width: 6; }
.palito--bloqueado .palito__linha { stroke: var(--palito-bloqueado); stroke-width: 6; }
.palito--quebrado .palito__linha { stroke: var(--palito-quebrado); stroke-width: 3; stroke-dasharray: 4 6; }
.palito--removido { display: none; }
.palito--solucao .palito__linha { stroke: var(--solucao); stroke-width: 6; }

.palito--removivel { cursor: pointer; }
.palito--removivel:hover .palito__linha { stroke: var(--solucao); }
.palito--removivel:focus-visible { outline: 2px solid var(--acento-ouro); outline-offset: 2px; }

.legenda {
  list-style: none; display: flex; gap: var(--espaco-3); margin: 0; padding: 0;
  font-size: 0.75rem; color: var(--tinta-suave);
}
.legenda li { display: flex; align-items: center; gap: var(--espaco-1); }
.amostra { width: 14px; height: 2px; display: inline-block; }
.amostra--removivel { background: var(--palito); }
.amostra--bloqueado { background: var(--palito-bloqueado); }
.amostra--quebrado { background: var(--palito-quebrado); }
```

- [ ] **Step 5: Implementar `src/ui/board.js`**

```js
import { calcularLayout, coordenadasDoPalito } from './layout.js';
import { ESTADOS } from '../core/rules.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROTULO_ESTADO = {
  [ESTADOS.REMOVIVEL]: 'removivel',
  [ESTADOS.BLOQUEADO]: 'bloqueado',
  [ESTADOS.QUEBRADO]: 'quebrado',
  [ESTADOS.REMOVIDO]: 'removido',
};

export function criarTabuleiro(svg, { aoAtivarPalito } = {}) {
  let layoutAtual = null;
  let nAtual = null;
  const grupos = new Map();

  svg.addEventListener('click', (evento) => {
    const grupo = evento.target.closest('[data-id]');
    if (grupo && aoAtivarPalito) aoAtivarPalito(grupo.dataset.id);
  });

  svg.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    const grupo = evento.target.closest('[data-id]');
    if (!grupo) return;
    evento.preventDefault();
    if (aoAtivarPalito) aoAtivarPalito(grupo.dataset.id);
  });

  function reconstruir(n) {
    layoutAtual = calcularLayout(n);
    nAtual = n;
    grupos.clear();
    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${layoutAtual.largura} ${layoutAtual.altura}`);
  }

  function obterGrupo(id) {
    if (grupos.has(id)) return grupos.get(id);

    const coordenadas = coordenadasDoPalito(id, layoutAtual);
    if (!coordenadas) return null;

    const grupo = document.createElementNS(SVG_NS, 'g');
    grupo.dataset.id = id;

    for (const classe of ['palito__toque', 'palito__linha']) {
      const linha = document.createElementNS(SVG_NS, 'line');
      linha.setAttribute('class', classe);
      linha.setAttribute('x1', coordenadas.x1);
      linha.setAttribute('y1', coordenadas.y1);
      linha.setAttribute('x2', coordenadas.x2);
      linha.setAttribute('y2', coordenadas.y2);
      grupo.append(linha);
    }

    svg.append(grupo);
    grupos.set(id, grupo);
    return grupo;
  }

  function renderizar(estado, { solucao = null, interativo = true } = {}) {
    if (estado.n !== nAtual) reconstruir(estado.n);
    const destacados = new Set(solucao ?? []);

    for (const [id, situacao] of Object.entries(estado.palitos)) {
      const grupo = obterGrupo(id);
      if (!grupo) continue;

      const classes = ['palito', `palito--${ROTULO_ESTADO[situacao]}`];
      if (destacados.has(id)) classes.push('palito--solucao');
      grupo.setAttribute('class', classes.join(' '));

      const clicavel = interativo && situacao === ESTADOS.REMOVIVEL;
      if (clicavel) {
        grupo.setAttribute('tabindex', '0');
        grupo.setAttribute('role', 'button');
        grupo.setAttribute('aria-label', descrever(id, situacao));
      } else {
        grupo.removeAttribute('tabindex');
        grupo.removeAttribute('role');
        grupo.setAttribute('aria-hidden', 'true');
      }
    }
  }

  return { renderizar };
}

function descrever(id, situacao) {
  const [orientacao, linha, coluna] = id.split(':');
  const nome = orientacao === 'h' ? 'horizontal' : 'vertical';
  return `Palito ${nome} linha ${linha} coluna ${coluna}, ${ROTULO_ESTADO[situacao]}`;
}
```

- [ ] **Step 6: Criar `src/main.js` provisório para ver o tabuleiro**

Este arquivo é substituído na Task 12; aqui ele existe só para validar o desenho.

```js
import { criarPartida } from './core/engine.js';
import { carregarDataset, escolherGrade, configDaGrade } from './dataset/loader.js';
import { criarTabuleiro } from './ui/board.js';

const dataset = await carregarDataset(4);
const config = configDaGrade(dataset, escolherGrade(dataset));
const jogo = criarPartida(config);

const tabuleiro = criarTabuleiro(document.querySelector('#tabuleiro'), {
  aoAtivarPalito: (id) => jogo.removerPalito(id),
});

jogo.inscrever((estado) => tabuleiro.renderizar(estado));
tabuleiro.renderizar(jogo.obterEstado());
```

- [ ] **Step 7: Verificar no navegador**

```
npx --yes serve .
```

Abra o endereço indicado e confira, comparando com `docs/prototipos/alta-01-inicio-de-jogo.png`:

1. Fundo bege, título serifado centralizado, subtítulo em duas linhas.
2. Tabuleiro dentro de um card branco, com a legenda de três itens embaixo.
3. Palitos pretos (removíveis), bege (bloqueados) e tracejado claro (quebrados).
4. Clicar num palito preto o faz sumir; clicar num bege ou tracejado não faz nada.
5. Console do navegador sem erro de CSP e sem erro de módulo.

- [ ] **Step 8: Commit**

```bash
git add index.html src/styles src/ui/board.js src/main.js
git commit -m "Adiciona casca da pagina, estilos e tabuleiro SVG"
```

---

## Task 10: Controles e estatísticas

**Files:**
- Create: `src/ui/controls.js`
- Create: `src/ui/stats.js`
- Modify: `src/styles/components.css` (acrescentar ao final)

**Interfaces:**
- Consumes: nada de `core/`
- Produces:
  - `criarControles(elementoTopo, elementoAcoes, { aoEscolherTamanho, aoNovoGrid, aoSolucionar, aoVoltarJogo, aoDesfazer }) -> { renderizar({ n, vista, podeDesfazer }) }`
  - `criarStats(elemento) -> { renderizar(estado) }`

- [ ] **Step 1: Implementar `src/ui/stats.js`**

```js
export function criarStats(elemento) {
  elemento.classList.add('cartao', 'painel-stats');
  elemento.setAttribute('aria-live', 'polite');

  const removidos = criarBloco('PALITOS REMOVIDOS');
  const restantes = criarBloco('QUADRADOS RESTANTES');
  elemento.append(removidos.raiz, restantes.raiz);

  return {
    renderizar(estado) {
      removidos.valor.textContent = String(estado.palitosRemovidos);
      restantes.valor.textContent = String(estado.quadradosVivos);
    },
  };
}

function criarBloco(rotulo) {
  const raiz = document.createElement('div');
  raiz.className = 'bloco-stat';

  const valor = document.createElement('strong');
  valor.className = 'bloco-stat__valor';
  valor.textContent = '0';

  const texto = document.createElement('span');
  texto.className = 'bloco-stat__rotulo';
  texto.textContent = rotulo;

  raiz.append(valor, texto);
  return { raiz, valor };
}
```

- [ ] **Step 2: Implementar `src/ui/controls.js`**

```js
const TAMANHOS = [4, 5, 6, 7];

export function criarControles(elementoTopo, elementoAcoes, manipuladores = {}) {
  const seletor = document.createElement('div');
  seletor.className = 'seletor';
  seletor.setAttribute('role', 'group');
  seletor.setAttribute('aria-label', 'Tamanho da grade');

  const botoesTamanho = new Map();
  for (const n of TAMANHOS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'seletor__opcao';
    botao.textContent = `${n}×${n}`;
    botao.addEventListener('click', () => manipuladores.aoEscolherTamanho?.(n));
    seletor.append(botao);
    botoesTamanho.set(n, botao);
  }

  const novoGrid = criarBotao('Novo Grid', 'botao botao--preto', () => manipuladores.aoNovoGrid?.());
  const linhaTopo = document.createElement('div');
  linhaTopo.className = 'cartao linha-controles';
  linhaTopo.append(seletor, novoGrid);

  const solucionar = criarBotao('Solucionar', 'botao botao--ouro botao--largo', () => manipuladores.aoSolucionar?.());
  const voltarJogo = criarBotao('Voltar ao Jogo', 'botao botao--ouro botao--largo', () => manipuladores.aoVoltarJogo?.());
  elementoTopo.append(linhaTopo, solucionar, voltarJogo);

  const desfazer = criarBotao('Voltar Última Jogada', 'botao botao--rosa botao--largo', () => manipuladores.aoDesfazer?.());
  elementoAcoes.append(desfazer);

  return {
    renderizar({ n, vista, podeDesfazer }) {
      for (const [tamanho, botao] of botoesTamanho) {
        botao.classList.toggle('seletor__opcao--ativa', tamanho === n);
        botao.setAttribute('aria-pressed', String(tamanho === n));
      }
      solucionar.hidden = vista === 'solucao';
      voltarJogo.hidden = vista !== 'solucao';
      desfazer.hidden = vista !== 'jogo';
      desfazer.disabled = !podeDesfazer;
    },
  };
}

function criarBotao(texto, classe, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = classe;
  botao.textContent = texto;
  botao.addEventListener('click', aoClicar);
  return botao;
}
```

- [ ] **Step 3: Acrescentar os estilos ao final de `src/styles/components.css`**

```css
.linha-controles { display: flex; align-items: center; gap: var(--espaco-2); padding: var(--espaco-1); }

.seletor { display: flex; flex: 1; }
.seletor__opcao {
  flex: 1; border: 0; background: transparent; padding: 8px 0;
  font: inherit; font-size: 0.8rem; color: var(--tinta-suave);
  border-radius: 6px; cursor: pointer;
}
.seletor__opcao--ativa { background: var(--acento-ouro); color: var(--tinta); font-weight: 700; }

.botao {
  border: 0; border-radius: 6px; padding: 9px 16px;
  font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;
}
.botao--largo { width: 100%; }
.botao--preto { background: var(--preto-botao); color: #fff; }
.botao--ouro { background: var(--acento-ouro); color: var(--tinta); }
.botao--rosa { background: var(--acento-rosa); color: var(--tinta); }
.botao--verde { background: var(--vitoria-tinta); color: #fff; }
.botao:disabled { opacity: 0.5; cursor: not-allowed; }

.painel-stats { display: flex; padding: var(--espaco-2) 0; }
.bloco-stat { flex: 1; text-align: center; }
.bloco-stat + .bloco-stat { border-left: 1px solid var(--borda); }
.bloco-stat__valor { display: block; font-size: 1.3rem; }
.bloco-stat__rotulo { font-size: 0.7rem; letter-spacing: 0.06em; color: var(--tinta-suave); }
```

- [ ] **Step 4: Ligar provisoriamente em `src/main.js`**

Substitua o conteúdo de `src/main.js` por:

```js
import { criarPartida } from './core/engine.js';
import { carregarDataset, escolherGrade, configDaGrade } from './dataset/loader.js';
import { criarTabuleiro } from './ui/board.js';
import { criarControles } from './ui/controls.js';
import { criarStats } from './ui/stats.js';

const dataset = await carregarDataset(4);
const config = configDaGrade(dataset, escolherGrade(dataset));
const jogo = criarPartida(config);

const tabuleiro = criarTabuleiro(document.querySelector('#tabuleiro'), {
  aoAtivarPalito: (id) => jogo.removerPalito(id),
});
const stats = criarStats(document.querySelector('#stats'));
const controles = criarControles(
  document.querySelector('#controles'),
  document.querySelector('#acoes'),
  { aoDesfazer: () => jogo.desfazer() },
);

jogo.inscrever((estado) => {
  tabuleiro.renderizar(estado);
  stats.renderizar(estado);
  controles.renderizar({ n: estado.n, vista: 'jogo', podeDesfazer: estado.historico.length > 0 });
});

const inicial = jogo.obterEstado();
tabuleiro.renderizar(inicial);
stats.renderizar(inicial);
controles.renderizar({ n: inicial.n, vista: 'jogo', podeDesfazer: false });
```

- [ ] **Step 5: Verificar no navegador**

Com `npx --yes serve .` rodando, compare com `docs/prototipos/alta-01-inicio-de-jogo.png`:

1. Segmented control com 4×4 destacado em dourado e "Novo Grid" preto à direita.
2. Barra dourada "Solucionar" ocupando a largura.
3. Painel com os dois contadores separados por linha vertical.
4. Barra rosa "Voltar Última Jogada" desabilitada enquanto nada foi removido.
5. Remover um palito: contador sobe, quadrados restantes cai, o botão rosa habilita.
6. Clicar no botão rosa: o palito volta e os dois contadores voltam ao valor anterior.

- [ ] **Step 6: Commit**

```bash
git add src/ui/controls.js src/ui/stats.js src/styles/components.css src/main.js
git commit -m "Adiciona controles de partida e painel de estatisticas"
```

---

## Task 11: Modo Solução e card de vitória

**Files:**
- Create: `src/ui/banners.js`
- Modify: `src/styles/components.css` (acrescentar ao final)

**Interfaces:**
- Consumes: nada de `core/`
- Produces: `criarBanners(elemento, { aoJogarNovamente, aoVerDesempenho }) -> { renderizar({ vista, status, solucao, palitosRemovidos }) }`

- [ ] **Step 1: Implementar `src/ui/banners.js`**

```js
export function criarBanners(elemento, manipuladores = {}) {
  const bannerSolucao = document.createElement('div');
  bannerSolucao.className = 'banner banner--solucao';
  bannerSolucao.hidden = true;

  const textoSolucao = document.createElement('p');
  textoSolucao.className = 'banner__linha';
  textoSolucao.textContent = 'Modo solução — baseado na grade original.';

  const contagemSolucao = document.createElement('p');
  contagemSolucao.className = 'banner__linha';
  bannerSolucao.append(textoSolucao, contagemSolucao);

  const cardVitoria = document.createElement('div');
  cardVitoria.className = 'banner banner--vitoria';
  cardVitoria.hidden = true;
  cardVitoria.setAttribute('role', 'status');

  const tituloVitoria = document.createElement('h2');
  tituloVitoria.className = 'banner__titulo';
  tituloVitoria.textContent = 'Grade Eliminada';

  const removidosVitoria = document.createElement('p');
  removidosVitoria.className = 'banner__linha';

  const estimativaVitoria = document.createElement('p');
  estimativaVitoria.className = 'banner__linha';

  const jogarNovamente = criarBotao('Jogar Novamente', () => manipuladores.aoJogarNovamente?.());
  const verDesempenho = criarBotao('Desempenho', () => manipuladores.aoVerDesempenho?.());

  cardVitoria.append(tituloVitoria, removidosVitoria, estimativaVitoria, jogarNovamente, verDesempenho);
  elemento.append(bannerSolucao, cardVitoria);

  return {
    renderizar({ vista, status, solucao, palitosRemovidos }) {
      bannerSolucao.hidden = vista !== 'solucao';
      if (vista === 'solucao' && solucao) {
        contagemSolucao.textContent = solucao.proven
          ? `Melhor forma encontrada: ${solucao.quantidade} palito(s).`
          : `Estimativa: ${solucao.quantidade} palito(s) — ainda não comprovadamente ótima.`;
      }

      const mostrarVitoria = status === 'vencido' && vista !== 'solucao';
      cardVitoria.hidden = !mostrarVitoria;
      verDesempenho.hidden = vista === 'desempenho';
      if (mostrarVitoria) {
        removidosVitoria.textContent = `${palitosRemovidos} palitos removidos`;
        estimativaVitoria.textContent = solucao
          ? `Estimativa heurística: ${solucao.quantidade} palitos`
          : 'Estimativa heurística indisponível';
      }
    },
  };
}

function criarBotao(texto, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao botao--verde';
  botao.textContent = texto;
  botao.addEventListener('click', aoClicar);
  return botao;
}
```

- [ ] **Step 2: Acrescentar os estilos ao final de `src/styles/components.css`**

```css
.banner { border-radius: var(--raio); padding: var(--espaco-3); text-align: center; }
.banner__linha { margin: 0 0 var(--espaco-1); font-size: 0.8rem; }
.banner__titulo { margin: 0 0 var(--espaco-2); font-family: var(--fonte-titulo); font-size: 1rem; }

.banner--solucao { background: var(--acento-rosa); color: var(--superficie); }
.banner--vitoria { background: var(--vitoria-fundo); color: var(--vitoria-tinta); }
.banner--vitoria .botao { display: block; margin: var(--espaco-1) auto 0; min-width: 180px; }
```

- [ ] **Step 3: Verificar os dois estados isoladamente**

`banners.js` ainda não é importado por ninguém — a fiação vem na Task 12. Para não deixar a task sem verificação, monte os dois estados à mão. Acrescente temporariamente ao final de `src/main.js`:

```js
import { criarBanners } from './ui/banners.js';

const banners = criarBanners(document.querySelector('#banners'), {
  aoJogarNovamente: () => console.log('jogar novamente'),
  aoVerDesempenho: () => console.log('desempenho'),
});

// Estado 1: modo solucao
banners.renderizar({
  vista: 'solucao',
  status: 'jogando',
  solucao: { quantidade: 12, proven: false },
  palitosRemovidos: 0,
});
```

Rode `npx --yes serve .` e compare o banner rosa com `docs/prototipos/alta-02-solucao.png`.

Depois troque o bloco por:

```js
banners.renderizar({
  vista: 'jogo',
  status: 'vencido',
  solucao: { quantidade: 12, proven: false },
  palitosRemovidos: 13,
});
```

Compare o card verde com `docs/prototipos/alta-03-jogo-finalizado.png`: título "Grade Eliminada", "13 palitos removidos", "Estimativa heurística: 12 palitos" e os dois botões verdes empilhados.

- [ ] **Step 4: Remover o bloco temporário de `src/main.js`**

Desfaça as duas adições do passo anterior — `main.js` volta ao conteúdo que tinha ao final da Task 10. Confirme que o console fica sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/ui/banners.js src/styles/components.css
git commit -m "Adiciona banner do modo solucao e card de vitoria"
```

---

## Task 12: Tela Desempenho, composição final e verificação

**Files:**
- Create: `src/ui/performance.js`
- Create: `src/ui/app.js`
- Modify: `src/main.js` (substituir pela versão final)
- Modify: `src/styles/components.css` (acrescentar ao final)
- Create: `README.md`

**Interfaces:**
- Consumes: `criarPartida` de `core/engine.js`; `calcularResumo`, `formatarPercentual` de `core/metrics.js`; `resolver` de `solver/index.js`; `carregarDataset`, `escolherGrade`, `configDaGrade`, `ErroDataset` de `dataset/loader.js`; todos os módulos de `ui/`
- Produces: `criarDesempenho(elemento) -> { renderizar(resumo) }`; `iniciarAplicacao(documento) -> Promise<void>`

- [ ] **Step 1: Implementar `src/ui/performance.js`**

```js
import { formatarPercentual } from '../core/metrics.js';

export function criarDesempenho(elemento) {
  const tiles = document.createElement('div');
  tiles.className = 'cartao tiles';

  const tempo = criarTile('Tempo');
  const removidos = criarTile('Palitos Removidos');
  const referencia = criarTile('Solução de referência');
  const eficiencia = criarTile('Eficiência');
  tiles.append(tempo.raiz, removidos.raiz, referencia.raiz, eficiencia.raiz);

  const grafico = document.createElement('div');
  grafico.className = 'cartao grafico';

  const titulo = document.createElement('h2');
  titulo.className = 'grafico__titulo';
  titulo.textContent = 'Seu Resultado × Solução Real';

  const barraJogador = criarBarra('Seu Resultado', 'barra--jogador');
  const barraReferencia = criarBarra('Ideal (estimado)', 'barra--referencia');

  // Secao 6.7 da especificacao exige os excedentes no resumo; o prototipo tem
  // apenas quatro tiles, entao eles entram como legenda abaixo do grafico.
  const excedentes = document.createElement('p');
  excedentes.className = 'grafico__nota';

  grafico.append(titulo, barraJogador.raiz, barraReferencia.raiz, excedentes);

  elemento.append(tiles, grafico);

  return {
    renderizar(resumo) {
      tempo.valor.textContent = resumo.tempoFormatado;
      removidos.valor.textContent = String(resumo.palitosRemovidos);
      referencia.valor.textContent = resumo.minimo === null ? '—' : String(resumo.minimo);
      eficiencia.valor.textContent = formatarPercentual(resumo.eficiencia);
      excedentes.textContent = resumo.excedentes === null
        ? 'Solução de referência indisponível.'
        : `${resumo.excedentes} remoção(ões) além da referência.`;

      const maior = Math.max(resumo.palitosRemovidos, resumo.minimo ?? 0, 1);
      barraJogador.aplicar(resumo.palitosRemovidos, maior);
      barraReferencia.aplicar(resumo.minimo ?? 0, maior);
    },
  };
}

function criarTile(rotulo) {
  const raiz = document.createElement('div');
  raiz.className = 'tile';

  const valor = document.createElement('strong');
  valor.className = 'tile__valor';
  valor.textContent = '—';

  const texto = document.createElement('span');
  texto.className = 'tile__rotulo';
  texto.textContent = rotulo;

  raiz.append(valor, texto);
  return { raiz, valor };
}

function criarBarra(rotulo, classe) {
  const raiz = document.createElement('div');
  raiz.className = 'barra';

  const nome = document.createElement('span');
  nome.className = 'barra__rotulo';
  nome.textContent = rotulo;

  const trilha = document.createElement('div');
  trilha.className = 'barra__trilha';

  const preenchimento = document.createElement('div');
  preenchimento.className = `barra__preenchimento ${classe}`;

  const valor = document.createElement('span');
  valor.className = 'barra__valor';

  trilha.append(preenchimento);
  raiz.append(nome, trilha, valor);

  return {
    raiz,
    aplicar(quantia, maior) {
      preenchimento.style.width = `${Math.round((quantia / maior) * 100)}%`;
      valor.textContent = String(quantia);
    },
  };
}
```

- [ ] **Step 2: Implementar `src/ui/app.js`**

```js
import { criarPartida } from '../core/engine.js';
import { calcularResumo } from '../core/metrics.js';
import { resolver } from '../solver/index.js';
import { carregarDataset, escolherGrade, configDaGrade, ErroDataset } from '../dataset/loader.js';
import { criarStore } from './store.js';
import { criarTabuleiro } from './board.js';
import { criarControles } from './controls.js';
import { criarStats } from './stats.js';
import { criarBanners } from './banners.js';
import { criarDesempenho } from './performance.js';

const TAMANHO_INICIAL = 4;

export async function iniciarAplicacao(documento) {
  const elementos = {
    tabuleiro: documento.querySelector('#tabuleiro'),
    controles: documento.querySelector('#controles'),
    acoes: documento.querySelector('#acoes'),
    stats: documento.querySelector('#stats'),
    banners: documento.querySelector('#banners'),
    desempenho: documento.querySelector('#desempenho'),
    erro: documento.querySelector('#erro'),
    cartaoTabuleiro: documento.querySelector('.cartao--tabuleiro'),
  };

  const store = criarStore({ vista: 'jogo', solucao: null, config: null, tique: 0 });
  let jogo = null;
  let dataset = null;

  const tabuleiro = criarTabuleiro(elementos.tabuleiro, {
    aoAtivarPalito: (id) => {
      if (store.obter().vista !== 'jogo') return;
      jogo.removerPalito(id);
    },
  });
  const stats = criarStats(elementos.stats);
  const desempenho = criarDesempenho(elementos.desempenho);
  const banners = criarBanners(elementos.banners, {
    aoJogarNovamente: () => novaGrade(store.obter().config.n),
    aoVerDesempenho: () => store.atualizar({ vista: 'desempenho' }),
  });
  const controles = criarControles(elementos.controles, elementos.acoes, {
    aoEscolherTamanho: (n) => trocarTamanho(n),
    aoNovoGrid: () => novaGrade(store.obter().config.n),
    aoSolucionar: () => mostrarSolucao(),
    aoVoltarJogo: () => store.atualizar({ vista: 'jogo' }),
    aoDesfazer: () => jogo.desfazer(),
  });

  function relatarErro(mensagem) {
    elementos.erro.textContent = mensagem;
    elementos.erro.hidden = false;
  }

  function limparErro() {
    elementos.erro.hidden = true;
  }

  async function trocarTamanho(n) {
    try {
      dataset = await carregarDataset(n);
      limparErro();
      novaGrade(n);
    } catch (erro) {
      relatarErro(erro instanceof ErroDataset
        ? `Não foi possível carregar as grades ${n}×${n}: ${erro.message}`
        : `Erro inesperado ao carregar as grades ${n}×${n}.`);
    }
  }

  function novaGrade(n) {
    const atual = store.obter().config;
    const grid = escolherGrade(dataset, { exceto: atual?.n === n ? atual.id : null });
    const config = configDaGrade(dataset, grid);

    if (jogo) {
      jogo.reiniciar(config);
    } else {
      jogo = criarPartida(config);
      jogo.inscrever(desenhar);
    }

    store.atualizar({ vista: 'jogo', solucao: null, config });
    desenhar(jogo.obterEstado());
  }

  async function mostrarSolucao() {
    try {
      const solucao = await resolver(store.obter().config);
      store.atualizar({ vista: 'solucao', solucao });
      limparErro();
    } catch (erro) {
      relatarErro(`Não foi possível calcular a solução: ${erro.message}`);
    }
  }

  function desenhar(estadoJogo = jogo.obterEstado()) {
    const ui = store.obter();
    const emSolucao = ui.vista === 'solucao';

    tabuleiro.renderizar(estadoJogo, {
      solucao: emSolucao ? ui.solucao?.palitos : null,
      interativo: ui.vista === 'jogo',
    });
    stats.renderizar(estadoJogo);
    controles.renderizar({
      n: estadoJogo.n,
      vista: ui.vista,
      podeDesfazer: estadoJogo.historico.length > 0,
    });
    banners.renderizar({
      vista: ui.vista,
      status: estadoJogo.status,
      solucao: ui.solucao,
      palitosRemovidos: estadoJogo.palitosRemovidos,
    });

    elementos.cartaoTabuleiro.hidden = ui.vista === 'desempenho';
    elementos.stats.hidden = ui.vista === 'desempenho';
    elementos.desempenho.hidden = ui.vista !== 'desempenho';

    if (ui.vista === 'desempenho') {
      desempenho.renderizar(calcularResumo({
        palitosRemovidos: estadoJogo.palitosRemovidos,
        minimo: ui.solucao?.quantidade ?? null,
        iniciadoEm: estadoJogo.iniciadoEm,
        finalizadoEm: estadoJogo.finalizadoEm,
      }));
    }
  }

  store.inscrever(async () => {
    // A tela de desempenho precisa da referencia; busca sob demanda uma unica vez.
    const ui = store.obter();
    if (ui.vista === 'desempenho' && !ui.solucao) {
      try {
        const solucao = await resolver(ui.config);
        store.atualizar({ solucao });
        return;
      } catch (erro) {
        relatarErro(`Não foi possível obter a solução de referência: ${erro.message}`);
      }
    }
    desenhar();
  });

  await trocarTamanho(TAMANHO_INICIAL);
}
```

- [ ] **Step 3: Substituir `src/main.js` pela versão final**

```js
import { iniciarAplicacao } from './ui/app.js';

await iniciarAplicacao(document);
```

- [ ] **Step 4: Acrescentar os estilos ao final de `src/styles/components.css`**

```css
.tiles { display: flex; padding: var(--espaco-2) 0; }
.tile { flex: 1; text-align: center; padding: 0 var(--espaco-1); }
.tile + .tile { border-left: 1px solid var(--borda); }
.tile__valor { display: block; font-size: 1.2rem; }
.tile__rotulo { font-size: 0.68rem; color: var(--tinta-suave); }

.grafico__titulo { margin: 0 0 var(--espaco-3); font-family: var(--fonte-titulo); font-size: 1rem; text-align: center; }
.barra { display: grid; grid-template-columns: 110px 1fr 32px; align-items: center; gap: var(--espaco-2); margin-bottom: var(--espaco-2); }
.barra__rotulo { font-size: 0.72rem; color: var(--tinta-suave); }
.barra__trilha { background: var(--fundo); border-radius: 3px; height: 16px; }
.barra__preenchimento { height: 100%; border-radius: 3px; transition: width 200ms ease; }
.barra--jogador { background: var(--acento-ouro); }
.barra--referencia { background: var(--vitoria-tinta); }
.barra__valor { font-size: 0.75rem; font-weight: 700; }
.grafico__nota { margin: var(--espaco-3) 0 0; font-size: 0.72rem; color: var(--tinta-suave); text-align: center; }
```

- [ ] **Step 5: Rodar toda a bateria de testes**

```
node --test tests/
```

Esperado: todos PASS. Nenhum teste deve ter sido quebrado pelas tasks de interface.

- [ ] **Step 6: Verificação manual completa contra os quatro protótipos**

Com `npx --yes serve .` rodando, percorra o roteiro comparando cada item com o PNG correspondente em `docs/prototipos/`:

*Tela Jogo (`alta-01-inicio-de-jogo.png`)*
1. Carrega em 4×4 com 4×4 destacado no seletor.
2. Clicar num palito preto: some, "PALITOS REMOVIDOS" sobe, "QUADRADOS RESTANTES" cai.
3. Clicar num palito bege ou tracejado: nada acontece, nenhum contador muda.
4. "Voltar Última Jogada" desfaz uma remoção por clique, até voltar ao estado inicial, quando desabilita.
5. Trocar para 7×7: o tabuleiro remonta maior e os contadores zeram.
6. "Novo Grid": carrega outra grade do mesmo tamanho, com id diferente do anterior.

*Tela Solução (`alta-02-solucao.png`)*
7. "Solucionar": aparece o banner rosa, os palitos da solução ficam vermelhos, o botão vira "Voltar ao Jogo" e o botão rosa some.
8. Clicar num palito nesse modo não remove nada.
9. "Voltar ao Jogo" restaura a tela de jogo com o progresso intacto.

*Tela Finalizado (`alta-03-jogo-finalizado.png`)*
10. Remover palitos até zerar "QUADRADOS RESTANTES": aparece o card verde "Grade Eliminada" com a contagem e a estimativa.
11. Desfazer depois da vitória: o card some e a partida volta a aceitar jogadas.

*Tela Desempenho (`alta-04-desempenho.png`)*
12. "Desempenho": aparecem os quatro tiles e o gráfico com duas barras, a dourada do jogador e a verde da referência.
13. A eficiência exibida bate com `(referência / removidos) × 100`, e a legenda abaixo do gráfico mostra os excedentes (seção 6.7 da especificação).
14. "Jogar Novamente" volta para uma partida nova.

*Transversal*
15. Console do navegador sem nenhum erro, em especial sem violação de CSP.
16. Navegação só por teclado: Tab alcança os palitos removíveis, Enter remove.

- [ ] **Step 7: Criar o `README.md`**

```markdown
# Broken Grid

Puzzle de lógica em navegador — Projeto Integrador I, UDESC.

Remova o menor número possível de palitos até não sobrar nenhum quadrado completo.
A grade já vem com palitos **quebrados** (ausentes) e **bloqueados** (irremovíveis).

## Como rodar

Requer Node 22+. Não há dependências para instalar.

    npx serve .

Abra o endereço indicado no terminal. Módulos ES não carregam por `file://`,
por isso o servidor estático é necessário.

## Testes

    node --test tests/

## Regenerar o dataset

    node tools/gerar-dataset.mjs --quantidade 20

## Estado atual

Esta é a etapa de **interface gráfica**. O motor de jogo é real: quadrados vivos,
desfazer e vitória funcionam de verdade. O **solver ainda não existe** — o módulo
`src/solver/` devolve a solução de referência gravada no dataset, marcada como
`proven: false`. A heurística gulosa e a busca exata entram na etapa de algoritmos,
substituindo apenas `src/solver/referencia.js`.

## Documentação

- Especificação e requisitos: `docs/Broken Grid - Especificação e Requisitos.pdf`
- Design da interface: `docs/superpowers/specs/`
- Protótipos: `docs/prototipos/`
```

- [ ] **Step 8: Commit**

```bash
git add src/ui/performance.js src/ui/app.js src/main.js src/styles/components.css README.md
git commit -m "Adiciona tela de desempenho e composicao final da aplicacao"
```

---

## Verificação final

- [ ] `node --test tests/` — toda a bateria passa
- [ ] `grep -rn "document\|window\|fetch" src/core/` não retorna nada (regra de dependência)
- [ ] `grep -rn "innerHTML\|eval(" src/` não retorna nada (regra de segurança)
- [ ] `grep -rn "http://\|https://" src/ index.html` não retorna nada além de namespaces XML
- [ ] Os 16 itens do roteiro de verificação manual da Task 12 passam
- [ ] `git log --oneline` mostra um commit por task, todos com mensagem em português
