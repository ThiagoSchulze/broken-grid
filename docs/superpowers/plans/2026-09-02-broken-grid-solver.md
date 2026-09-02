# Solver do Broken Grid — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mock de `src/solver/` por um solver real de cobertura mínima — guloso como teto, busca exata com poda como prova — e remover do dataset todo número de solução pré-calculado.

**Architecture:** A `config` inicial da grade é compilada numa instância de cobertura mínima em bitmask (`Uint32Array`), reduzida por pré-processamento (forçados, dominância entre quadrados, dominância entre palitos), resolvida pelo guloso em microssegundos e depois provada por um branch and bound de pilha explícita, executado em fatias de 8 ms para não bloquear a interface. O contrato público `resolver(config, opcoes)` continua com os mesmos cinco campos de 19/08, mais um bloco `diagnostico` para a avaliação experimental de 22/09.

**Tech Stack:** JavaScript ES modules puro, sem dependências de runtime, sem bundler. Node 20+ apenas para os scripts de `tools/`. Navegador para o jogo.

**Spec:** `docs/superpowers/specs/2026-09-02-broken-grid-solver-design.md`

## Global Constraints

- **Zero dependências de runtime.** Nada de npm install, nada de CDN. `package.json` não ganha `dependencies`.
- **ES modules** em todo lugar (`"type": "module"` já está no `package.json`). Extensão `.js` explícita em todo import.
- **Regra de dependência:** `src/solver/` importa **somente** de `src/core/`. Nunca de `ui/`, `dataset/` ou DOM. Nenhum arquivo de `solver/` pode referenciar `document`, `window` ou `fetch`.
- **Sem `tests/` e sem `npm test`.** A suíte foi removida de propósito em `3978fe2`. Toda verificação vive em `tools/verificar-solver.mjs`, rodado com `node tools/verificar-solver.mjs`.
- **Código sem comentários explicativos.** O projeto removeu JSDoc e justificativas em `3978fe2`; sobram apenas notas curtas onde o código sozinho engana. Siga esse estilo — as explicações longas deste plano são para você, não para o arquivo.
- **Identificadores em português**, sem acentos nos nomes de símbolos (`resolverGuloso`, `cotaInferior`, `palitosDoQuadrado`), acompanhando `core/` e `ui/`.
- **Determinismo obrigatório (RNF05):** todo desempate resolve pelo menor índice. A mesma grade deve produzir sempre o mesmo conjunto.
- **Node 20+** (desenvolvido no 22.17).
- Todos os comandos deste plano rodam a partir da raiz do repositório.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/solver/bits.js` | Operações de máscara sobre blocos de `Uint32Array`. Sem conhecimento do domínio. |
| `src/solver/instancia.js` | `ErroSolver`; compila a `config` em instância de cobertura; reduz a instância. |
| `src/solver/guloso.js` | Fase 1: heurística gulosa e poda de redundância. |
| `src/solver/exato.js` | Cota inferior por empacotamento e branch and bound fatiado. |
| `src/solver/index.js` | Contrato público, orquestração das duas fases, orçamento, cessão de thread e cancelamento. |
| `src/solver/referencia.js` | **Removido.** |
| `src/dataset/loader.js` | Perde a validação do campo `referencia`. |
| `src/ui/app.js` | Dispara o solver ao carregar a grade; cancela o anterior; deixa de estimar pelo dataset. |
| `tools/gerar-dataset.mjs` | Para de gravar `referencia` no JSON. |
| `tools/verificar-solver.mjs` | Verificação e benchmark. Cresce a cada tarefa. |

## Uma nota sobre as asserções deste plano

O pré-processamento é difícil de prever no papel: quais quadrados e palitos ele descarta
depende de interações entre obstáculos. Por isso as verificações das Tasks 3–5 checam
**invariantes** (todo quadrado ativo tem grau ≥ 1, a cota nunca passa do ótimo, o resultado
é minimal) e **casos construídos à mão**, nunca contagens previstas de cabeça. A rede de
segurança real é o oráculo de força bruta introduzido na Task 5 e aplicado às 20 grades
4×4 na Task 9: ele é independente do solver e pega qualquer erro de redução ou de poda.

---

## Task 1: Operações de bitmask

**Files:**
- Create: `src/solver/bits.js`
- Create: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `palavras(bits) -> number`, `criarMascara(bits) -> Uint32Array`, `definirBit(mascara, i)`, `temBit(mascara, i) -> boolean`, `popcount(x) -> number`, `contar(fonte, desloc, n) -> number`, `contarInterseccao(filtro, fonte, desloc, n) -> number`, `subtrair(alvo, fonte, desloc, n)`, `unir(alvo, fonte, desloc, n)`, `copiar(alvo, fonte, desloc, n)`, `estaVazia(mascara, n) -> boolean`, `haInterseccao(filtro, fonte, desloc, n) -> boolean`, `contido(fonte, deslocA, deslocB, n) -> boolean`, `iguais(fonte, deslocA, deslocB, n) -> boolean`, `contidoComFiltro(fonte, deslocA, deslocB, filtro, n) -> boolean`, `iguaisComFiltro(fonte, deslocA, deslocB, filtro, n) -> boolean`, `limparBitEm(fonte, desloc, i)`, `zerarBloco(fonte, desloc, n)`.

Convenção: todo bloco vive num `Uint32Array` plano; `desloc` é o índice da primeira palavra do bloco e `n` é o número de palavras por bloco. Máscaras avulsas (`filtro`, `alvo`) começam na posição 0.

- [ ] **Step 1: Criar o arranjo de verificação**

Crie `tools/verificar-solver.mjs`:

```js
// Uso: node tools/verificar-solver.mjs

let total = 0;
let falhas = 0;

function checar(nome, condicao, detalhe = '') {
  total += 1;
  if (condicao) {
    console.log(`  ok    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

function secao(titulo) {
  console.log(`\n== ${titulo}`);
}

async function principal() {
  await verificarBits();

  console.log(`\n${total - falhas}/${total} verificacoes passaram`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

async function verificarBits() {
  const bits = await import('../src/solver/bits.js');
  secao('bits');

  checar('palavras arredonda para cima', bits.palavras(33) === 2 && bits.palavras(32) === 1);
  checar('palavras nunca devolve zero', bits.palavras(0) === 1);

  const m = bits.criarMascara(70);
  checar('criarMascara dimensiona certo', m.length === 3);
  bits.definirBit(m, 0);
  bits.definirBit(m, 33);
  bits.definirBit(m, 69);
  checar('definirBit e temBit combinam', bits.temBit(m, 0) && bits.temBit(m, 33) && bits.temBit(m, 69));
  checar('temBit nega o que nao foi marcado', !bits.temBit(m, 1) && !bits.temBit(m, 34));
  checar('contar conta os bits do bloco', bits.contar(m, 0, 3) === 3);

  checar('popcount de zero', bits.popcount(0) === 0);
  checar('popcount de palavra cheia', bits.popcount(0xffffffff) === 32);
  checar('popcount do bit alto', bits.popcount(0x80000000) === 1);

  const fonte = new Uint32Array([0b1011, 0, 0b0110, 0]);
  const filtro = new Uint32Array([0b0011, 0]);
  checar('contarInterseccao', bits.contarInterseccao(filtro, fonte, 0, 2) === 2);
  checar('haInterseccao positivo', bits.haInterseccao(filtro, fonte, 0, 2));
  checar('haInterseccao negativo', !bits.haInterseccao(filtro, fonte, 2, 2));

  const alvo = new Uint32Array([0b1111, 0]);
  bits.subtrair(alvo, fonte, 0, 2);
  checar('subtrair limpa os bits da fonte', alvo[0] === 0b0100);
  bits.unir(alvo, fonte, 2, 2);
  checar('unir acumula', alvo[0] === 0b0110);
  bits.copiar(alvo, fonte, 0, 2);
  checar('copiar sobrescreve', alvo[0] === 0b1011);
  checar('estaVazia nega mascara com bit', !bits.estaVazia(alvo, 2));
  bits.zerarBloco(alvo, 0, 2);
  checar('zerarBloco esvazia', bits.estaVazia(alvo, 2));

  const pares = new Uint32Array([0b0011, 0, 0b0111, 0, 0b0011, 0]);
  checar('contido reconhece subconjunto', bits.contido(pares, 0, 2, 2));
  checar('contido nega superconjunto', !bits.contido(pares, 2, 0, 2));
  checar('iguais reconhece copias', bits.iguais(pares, 0, 4, 2));
  checar('iguais nega diferentes', !bits.iguais(pares, 0, 2, 2));

  const comFiltro = new Uint32Array([0b1101, 0, 0b0101, 0]);
  const recorte = new Uint32Array([0b0101, 0]);
  checar('contidoComFiltro com recorte', bits.contidoComFiltro(comFiltro, 0, 2, recorte, 2));
  checar('iguaisComFiltro com recorte', bits.iguaisComFiltro(comFiltro, 0, 2, recorte, 2));

  const bloco = new Uint32Array([0b1111, 0]);
  bits.limparBitEm(bloco, 0, 2);
  checar('limparBitEm apaga um bit', bloco[0] === 0b1011);
}

await principal();
```

Note o par `contidoComFiltro`/`iguaisComFiltro`: sem o recorte, `0b1101` não está contido em `0b0101`; com o filtro `0b0101` aplicado aos dois lados, ambos viram `0b0101` e a resposta é sim. É exatamente a operação que a dominância entre palitos precisa, comparando coberturas restritas aos quadrados ainda ativos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA com `Cannot find module` apontando para `src/solver/bits.js`.

- [ ] **Step 3: Implementar `src/solver/bits.js`**

```js
export function palavras(bits) {
  return Math.max(1, Math.ceil(bits / 32));
}

export function criarMascara(bits) {
  return new Uint32Array(palavras(bits));
}

export function definirBit(mascara, i) {
  mascara[i >>> 5] |= 1 << (i & 31);
}

export function temBit(mascara, i) {
  return (mascara[i >>> 5] & (1 << (i & 31))) !== 0;
}

export function popcount(x) {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

export function contar(fonte, desloc, n) {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += popcount(fonte[desloc + i]);
  return total;
}

export function contarInterseccao(filtro, fonte, desloc, n) {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += popcount(filtro[i] & fonte[desloc + i]);
  return total;
}

export function subtrair(alvo, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) alvo[i] &= ~fonte[desloc + i];
}

export function unir(alvo, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) alvo[i] |= fonte[desloc + i];
}

export function copiar(alvo, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) alvo[i] = fonte[desloc + i];
}

export function estaVazia(mascara, n) {
  for (let i = 0; i < n; i += 1) if (mascara[i] !== 0) return false;
  return true;
}

export function haInterseccao(filtro, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) if ((filtro[i] & fonte[desloc + i]) !== 0) return true;
  return false;
}

export function contido(fonte, deslocA, deslocB, n) {
  for (let i = 0; i < n; i += 1) {
    if ((fonte[deslocA + i] & ~fonte[deslocB + i]) !== 0) return false;
  }
  return true;
}

export function iguais(fonte, deslocA, deslocB, n) {
  for (let i = 0; i < n; i += 1) {
    if (fonte[deslocA + i] !== fonte[deslocB + i]) return false;
  }
  return true;
}

export function contidoComFiltro(fonte, deslocA, deslocB, filtro, n) {
  for (let i = 0; i < n; i += 1) {
    const a = fonte[deslocA + i] & filtro[i];
    const b = fonte[deslocB + i] & filtro[i];
    if ((a & ~b) !== 0) return false;
  }
  return true;
}

export function iguaisComFiltro(fonte, deslocA, deslocB, filtro, n) {
  for (let i = 0; i < n; i += 1) {
    if ((fonte[deslocA + i] & filtro[i]) !== (fonte[deslocB + i] & filtro[i])) return false;
  }
  return true;
}

export function limparBitEm(fonte, desloc, i) {
  fonte[desloc + (i >>> 5)] &= ~(1 << (i & 31));
}

export function zerarBloco(fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) fonte[desloc + i] = 0;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, terminando em `N/N verificacoes passaram`, código de saída 0.

- [ ] **Step 5: Commit**

```bash
git add src/solver/bits.js tools/verificar-solver.mjs
git commit -m "Adiciona as operacoes de bitmask do solver"
```

---

## Task 2: Compilar a configuração em instância de cobertura

**Files:**
- Create: `src/solver/instancia.js`
- Modify: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: `bits.js` da Task 1; `montarGrade` de `src/core/grid.js`; `ESTADOS` de `src/core/rules.js`.
- Produces:
  - `class ErroSolver extends Error` — construtor `(mensagem, { cancelado = false } = {})`, define `this.name = 'ErroSolver'` e `this.cancelado`.
  - `compilarInstancia(config) -> Instancia`, onde `Instancia` é
    `{ n, m, q, palavrasM, palavrasQ, palitos: string[], palitosDoQuadrado: Uint32Array, quadradosDoPalito: Uint32Array }`.
    `m` é a quantidade de palitos removíveis, `q` a de quadrados vivos na configuração inicial, `palitos[i]` é o id textual do palito de índice `i`. `palitosDoQuadrado` tem `q` blocos de `palavrasM` palavras; `quadradosDoPalito` tem `m` blocos de `palavrasQ` palavras.

- [ ] **Step 1: Escrever a verificação que falha**

Em `tools/verificar-solver.mjs`, adicione `await verificarInstancia();` logo depois de `await verificarBits();` dentro de `principal()`, e acrescente a função ao final do arquivo, antes de `await principal();`:

```js
async function verificarInstancia() {
  const { compilarInstancia, ErroSolver } = await import('../src/solver/instancia.js');
  const bits = await import('../src/solver/bits.js');
  secao('instancia');

  const limpa = compilarInstancia({ n: 4, quebrados: [], bloqueados: [] });
  checar('4x4 limpa tem 40 palitos removiveis', limpa.m === 40, `m=${limpa.m}`);
  checar('4x4 limpa tem 30 quadrados vivos', limpa.q === 30, `q=${limpa.q}`);
  checar('palavras dimensionadas', limpa.palavrasM === 2 && limpa.palavrasQ === 1);

  const ip = limpa.palitos.indexOf('h:0:0');
  checar('h:0:0 existe entre os removiveis', ip !== -1);
  checar(
    'h:0:0 cobre 4 quadrados numa 4x4 limpa',
    bits.contar(limpa.quadradosDoPalito, ip * limpa.palavrasQ, limpa.palavrasQ) === 4,
  );
  checar(
    'o primeiro quadrado tem 4 lados removiveis',
    bits.contar(limpa.palitosDoQuadrado, 0, limpa.palavrasM) === 4,
  );

  const comQuebrado = compilarInstancia({ n: 4, quebrados: ['h:0:0'], bloqueados: [] });
  checar('palito quebrado sai dos removiveis', comQuebrado.m === 39, `m=${comQuebrado.m}`);
  checar('quebrado mata os quadrados que dependem dele', comQuebrado.q === 26, `q=${comQuebrado.q}`);

  const comBloqueado = compilarInstancia({ n: 4, quebrados: [], bloqueados: ['h:0:0'] });
  checar('palito bloqueado sai dos removiveis', comBloqueado.m === 39, `m=${comBloqueado.m}`);
  checar('bloqueado mantem os quadrados vivos', comBloqueado.q === 30, `q=${comBloqueado.q}`);
  checar(
    'quadrado com um lado bloqueado fica com 3 lados removiveis',
    bits.contar(comBloqueado.palitosDoQuadrado, 0, comBloqueado.palavrasM) === 3,
  );

  checar('ErroSolver carrega a marca de cancelado', new ErroSolver('x', { cancelado: true }).cancelado === true);
  checar('ErroSolver nasce nao cancelado', new ErroSolver('x').cancelado === false);
}
```

De onde vêm os números: numa 4×4 existem 30 quadrados (16 de 1×1, 9 de 2×2, 4 de 3×3, 1 de 4×4) e 40 palitos (2 × 4 × 5). O palito `h:0:0` é o lado superior esquerdo e participa de 4 quadrados — o 1×1, o 2×2, o 3×3 e o 4×4, todos ancorados em (0,0) — por isso quebrá-lo deixa 26 vivos. Bloqueá-lo não mata quadrado nenhum, só tira o palito das máscaras: é a assimetria da RN03, e é a única linha desta tarefa que pode estar sutilmente errada.

O quadrado de índice 0 é o primeiro emitido por `listarQuadrados`: tamanho 1, linha 0, coluna 0.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA com `Cannot find module` apontando para `src/solver/instancia.js`.

- [ ] **Step 3: Implementar `src/solver/instancia.js`**

```js
import { montarGrade } from '../core/grid.js';
import { ESTADOS } from '../core/rules.js';
import * as bits from './bits.js';

export class ErroSolver extends Error {
  constructor(mensagem, { cancelado = false } = {}) {
    super(mensagem);
    this.name = 'ErroSolver';
    this.cancelado = cancelado;
  }
}

export function compilarInstancia(config) {
  const grade = montarGrade(config);

  const palitos = [];
  const indiceDoPalito = new Map();
  for (const [id, estado] of grade.palitos) {
    if (estado !== ESTADOS.REMOVIVEL) continue;
    indiceDoPalito.set(id, palitos.length);
    palitos.push(id);
  }

  const vivos = grade.quadrados.filter((quadrado) => quadrado.ausentes === 0);

  const m = palitos.length;
  const q = vivos.length;
  const palavrasM = bits.palavras(m);
  const palavrasQ = bits.palavras(q);

  const palitosDoQuadrado = new Uint32Array(q * palavrasM);
  const quadradosDoPalito = new Uint32Array(m * palavrasQ);

  for (let iq = 0; iq < q; iq += 1) {
    for (const borda of vivos[iq].bordas) {
      const ip = indiceDoPalito.get(borda);
      if (ip === undefined) continue;
      palitosDoQuadrado[iq * palavrasM + (ip >>> 5)] |= 1 << (ip & 31);
      quadradosDoPalito[ip * palavrasQ + (iq >>> 5)] |= 1 << (iq & 31);
    }
  }

  return { n: grade.n, m, q, palavrasM, palavrasQ, palitos, palitosDoQuadrado, quadradosDoPalito };
}
```

`indiceDoPalito.get(borda)` devolve `undefined` para lado bloqueado — ele é presente (mantém o quadrado vivo, e por isso o quadrado entrou em `vivos`) mas não entra em máscara nenhuma. Essa única linha é a regra RN03 inteira.

A ordem de `grade.palitos` e de `grade.quadrados` vem de `listarPalitos`/`listarQuadrados` e é determinística — é dela que sai a reprodutibilidade do RNF05.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, código de saída 0.

- [ ] **Step 5: Commit**

```bash
git add src/solver/instancia.js tools/verificar-solver.mjs
git commit -m "Compila a configuracao da grade em instancia de cobertura minima"
```

---

## Task 3: Pré-processamento da instância

**Files:**
- Modify: `src/solver/instancia.js`
- Modify: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: `compilarInstancia` da Task 2.
- Produces: `reduzirInstancia(instancia) -> Reducao`, onde `Reducao` é
  `{ ativos: Uint32Array, obrigatorios: number[], grau: Int32Array, ordemPorGrau: Int32Array }`.
  `ativos` é a máscara dos quadrados que sobraram; `obrigatorios` são índices de palitos que estão em toda solução; `grau[iq]` é a quantidade de lados removíveis do quadrado após os descartes; `ordemPorGrau` lista os quadrados **ativos** em ordem crescente de grau, desempatando pelo índice.
  A função **muta** `instancia.palitosDoQuadrado` e `instancia.quadradosDoPalito`, apagando os palitos descartados.
  Lança `ErroSolver` quando um quadrado ativo fica sem nenhum lado removível.

- [ ] **Step 1: Escrever a verificação que falha**

Adicione `await verificarReducao();` em `principal()`, depois de `verificarInstancia()`, e a função:

```js
async function verificarReducao() {
  const { compilarInstancia, reduzirInstancia, ErroSolver } = await import('../src/solver/instancia.js');
  const bits = await import('../src/solver/bits.js');
  secao('reducao');

  for (const n of [4, 5, 6, 7]) {
    const instancia = compilarInstancia({ n, quebrados: [], bloqueados: [] });
    const antes = instancia.q;
    const reducao = reduzirInstancia(instancia);
    const depois = bits.contar(reducao.ativos, 0, instancia.palavrasQ);

    checar(`${n}x${n}: a reducao nunca cresce`, depois <= antes, `${antes} -> ${depois}`);
    checar(`${n}x${n}: sobra algo para resolver`, depois >= 1);
    checar(
      `${n}x${n}: todo quadrado ativo tem lado removivel`,
      reducao.ordemPorGrau.every((iq) => reducao.grau[iq] >= 1),
    );
    checar(
      `${n}x${n}: ordemPorGrau lista exatamente os ativos`,
      reducao.ordemPorGrau.length === depois
        && reducao.ordemPorGrau.every((iq) => bits.temBit(reducao.ativos, iq)),
    );
    checar(
      `${n}x${n}: ordemPorGrau nao decresce`,
      reducao.ordemPorGrau.every((iq, i, lista) => i === 0 || reducao.grau[lista[i - 1]] <= reducao.grau[iq]),
    );
    checar(
      `${n}x${n}: nenhum obrigatorio repetido`,
      new Set(reducao.obrigatorios).size === reducao.obrigatorios.length,
    );
  }

  const forcada = compilarInstancia({ n: 4, quebrados: [], bloqueados: ['h:0:0', 'h:1:0', 'v:0:0'] });
  const alvo = forcada.palitos.indexOf('v:0:1');
  const reducaoForcada = reduzirInstancia(forcada);
  checar(
    'quadrado com um unico lado livre forca aquele palito',
    reducaoForcada.obrigatorios.includes(alvo),
    `obrigatorios=${reducaoForcada.obrigatorios.map((i) => forcada.palitos[i]).join(',')}`,
  );

  let lancou = false;
  try {
    reduzirInstancia(compilarInstancia({
      n: 4,
      quebrados: [],
      bloqueados: ['h:0:0', 'h:1:0', 'v:0:0', 'v:0:1'],
    }));
  } catch (erro) {
    lancou = erro instanceof ErroSolver;
  }
  checar('quadrado sem lado removivel e instancia impossivel', lancou);
}
```

O caso construído: o quadrado 1×1 no canto (0,0) tem os lados `h:0:0`, `h:1:0`, `v:0:0` e `v:0:1`. Bloqueando os três primeiros, sobra um único lado removível — logo `v:0:1` está em toda solução. Bloqueando os quatro, o quadrado nunca morre e a instância é impossível. Esses dois são os únicos resultados do pré-processamento que dá para prever no papel; o resto é verificado por invariante.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA em `reduzirInstancia is not a function`.

- [ ] **Step 3: Implementar a redução**

Acrescente ao final de `src/solver/instancia.js`:

```js
export function reduzirInstancia(instancia) {
  const { m, q, palavrasM, palitosDoQuadrado } = instancia;

  const ativos = bits.criarMascara(q);
  for (let iq = 0; iq < q; iq += 1) bits.definirBit(ativos, iq);

  const vivos = bits.criarMascara(m);
  for (let ip = 0; ip < m; ip += 1) bits.definirBit(vivos, ip);

  const obrigatorios = [];
  let mudou = true;

  while (mudou) {
    mudou = false;
    if (forcarUnitarios(instancia, ativos, vivos, obrigatorios)) mudou = true;
    if (descartarQuadradosDominados(instancia, ativos)) mudou = true;
    if (descartarPalitosDominados(instancia, ativos, vivos)) mudou = true;
  }

  const grau = new Int32Array(q);
  const ordem = [];
  for (let iq = 0; iq < q; iq += 1) {
    if (!bits.temBit(ativos, iq)) continue;
    grau[iq] = bits.contar(palitosDoQuadrado, iq * palavrasM, palavrasM);
    ordem.push(iq);
  }
  ordem.sort((a, b) => (grau[a] - grau[b]) || (a - b));

  return { ativos, obrigatorios, grau, ordemPorGrau: Int32Array.from(ordem) };
}

function forcarUnitarios(instancia, ativos, vivos, obrigatorios) {
  const { q, palavrasM, palavrasQ, palitosDoQuadrado, quadradosDoPalito } = instancia;
  let mudou = false;

  for (let iq = 0; iq < q; iq += 1) {
    if (!bits.temBit(ativos, iq)) continue;
    const grau = bits.contar(palitosDoQuadrado, iq * palavrasM, palavrasM);
    if (grau === 0) throw new ErroSolver('quadrado sem lado removivel: instancia impossivel');
    if (grau !== 1) continue;

    const ip = primeiroBit(palitosDoQuadrado, iq * palavrasM, palavrasM);
    obrigatorios.push(ip);
    bits.subtrair(ativos, quadradosDoPalito, ip * palavrasQ, palavrasQ);
    descartarPalito(instancia, vivos, ip);
    mudou = true;
  }

  return mudou;
}

function descartarQuadradosDominados(instancia, ativos) {
  const { q, palavrasM, palitosDoQuadrado } = instancia;
  let mudou = false;

  for (let a = 0; a < q; a += 1) {
    if (!bits.temBit(ativos, a)) continue;
    for (let b = 0; b < q; b += 1) {
      if (a === b || !bits.temBit(ativos, b)) continue;
      if (!bits.contido(palitosDoQuadrado, b * palavrasM, a * palavrasM, palavrasM)) continue;
      if (bits.iguais(palitosDoQuadrado, a * palavrasM, b * palavrasM, palavrasM) && a < b) continue;
      limparBitDe(ativos, a);
      mudou = true;
      break;
    }
  }

  return mudou;
}

function descartarPalitosDominados(instancia, ativos, vivos) {
  const { m, palavrasQ, quadradosDoPalito } = instancia;
  let mudou = false;

  for (let p = 0; p < m; p += 1) {
    if (!bits.temBit(vivos, p)) continue;
    for (let r = 0; r < m; r += 1) {
      if (p === r || !bits.temBit(vivos, r)) continue;
      if (!bits.contidoComFiltro(quadradosDoPalito, p * palavrasQ, r * palavrasQ, ativos, palavrasQ)) continue;
      if (bits.iguaisComFiltro(quadradosDoPalito, p * palavrasQ, r * palavrasQ, ativos, palavrasQ) && p < r) continue;
      descartarPalito(instancia, vivos, p);
      mudou = true;
      break;
    }
  }

  return mudou;
}

function descartarPalito(instancia, vivos, ip) {
  const { q, palavrasM, palavrasQ, palitosDoQuadrado, quadradosDoPalito } = instancia;
  limparBitDe(vivos, ip);
  bits.zerarBloco(quadradosDoPalito, ip * palavrasQ, palavrasQ);
  for (let iq = 0; iq < q; iq += 1) bits.limparBitEm(palitosDoQuadrado, iq * palavrasM, ip);
}

function limparBitDe(mascara, i) {
  mascara[i >>> 5] &= ~(1 << (i & 31));
}

function primeiroBit(fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) {
    const palavra = fonte[desloc + i];
    if (palavra !== 0) return i * 32 + (31 - Math.clz32(palavra & -palavra));
  }
  return -1;
}
```

Quatro pontos que quebram em silêncio se você mudar:

**A ordem dentro de `forcarUnitarios`.** `bits.subtrair(ativos, ...)` precisa vir *antes* de `descartarPalito`, porque `descartarPalito` zera a linha de cobertura do palito. Invertido, os quadrados que ele cobria continuariam ativos para sempre.

**Os desempates `&& a < b` e `&& p < r`.** Quando duas máscaras são idênticas, cada uma domina a outra; sem o desempate as duas seriam descartadas, e a solução ficaria errada. Com ele, sobrevive a de menor índice.

**Por que descartar um palito obrigatório.** Assim que ele entra em `obrigatorios`, sua cobertura já foi debitada de `ativos`. Mantê-lo faria o guloso escolhê-lo de novo, contando duas vezes.

**Por que a dominância entre palitos usa filtro e a de quadrados não.** As máscaras de quadrado são mutadas quando um palito é descartado, então já refletem o estado atual. Já a cobertura de um palito continua listando quadrados que podem ter saído de `ativos` — daí `contidoComFiltro`, que compara só a parte que ainda importa.

`primeiroBit` isola o bit menos significativo com `palavra & -palavra` e localiza sua posição com `Math.clz32`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, código de saída 0.

- [ ] **Step 5: Commit**

```bash
git add src/solver/instancia.js tools/verificar-solver.mjs
git commit -m "Adiciona o pre-processamento da instancia do solver"
```

---

## Task 4: Fase gulosa

**Files:**
- Create: `src/solver/guloso.js`
- Modify: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: `compilarInstancia`, `reduzirInstancia`, `ErroSolver` da Task 3.
- Produces:
  - `resolverGuloso(instancia, reducao) -> { escolhidos: number[], alemDosObrigatorios: number }` — `escolhidos` são índices de palitos, começando pelos obrigatórios; `alemDosObrigatorios` é `escolhidos.length - reducao.obrigatorios.length`.
  - `cobre(instancia, universo, palitos) -> boolean` — verdadeiro quando o conjunto de índices `palitos` cobre todos os quadrados da máscara `universo`.

- [ ] **Step 1: Escrever a verificação que falha**

Adicione `await verificarGuloso();` em `principal()` e a função:

```js
async function verificarGuloso() {
  const { compilarInstancia, reduzirInstancia } = await import('../src/solver/instancia.js');
  const { resolverGuloso, cobre } = await import('../src/solver/guloso.js');
  secao('guloso');

  for (const n of [4, 5, 6, 7]) {
    const instancia = compilarInstancia({ n, quebrados: [], bloqueados: [] });
    const reducao = reduzirInstancia(instancia);
    const guloso = resolverGuloso(instancia, reducao);

    checar(`${n}x${n}: a solucao cobre tudo`, cobre(instancia, reducao.ativos, guloso.escolhidos));
    checar(
      `${n}x${n}: a solucao e minimal`,
      guloso.escolhidos.every((_, i) => !cobre(
        instancia,
        reducao.ativos,
        guloso.escolhidos.filter((__, j) => j !== i),
      )),
    );
    checar(`${n}x${n}: nao repete palito`, new Set(guloso.escolhidos).size === guloso.escolhidos.length);
    checar(
      `${n}x${n}: a contagem alem dos obrigatorios bate`,
      guloso.alemDosObrigatorios === guloso.escolhidos.length - reducao.obrigatorios.length,
    );

    const outro = resolverGuloso(instancia, reducao);
    checar(`${n}x${n}: e deterministico`, outro.escolhidos.join(',') === guloso.escolhidos.join(','));
  }

  const instancia = compilarInstancia({ n: 4, quebrados: [], bloqueados: [] });
  const reducao = reduzirInstancia(instancia);
  const guloso = resolverGuloso(instancia, reducao);
  checar(
    '4x4 limpa: o guloso fica num intervalo plausivel',
    guloso.escolhidos.length >= 8 && guloso.escolhidos.length <= 20,
    `${guloso.escolhidos.length}`,
  );
}
```

O piso 8 é uma cota real, não um chute: uma 4×4 tem 16 quadrados 1×1 e nenhum palito pertence à borda de mais de dois deles, logo nenhuma solução usa menos de 8 palitos. O teto 20 é folgado de propósito — serve só para pegar resultado absurdo.

A minimalidade é a propriedade que a poda de redundância garante: nenhum palito da resposta pode sair sem descobrir algum quadrado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA com `Cannot find module` apontando para `src/solver/guloso.js`.

- [ ] **Step 3: Implementar `src/solver/guloso.js`**

```js
import * as bits from './bits.js';
import { ErroSolver } from './instancia.js';

export function cobre(instancia, universo, palitos) {
  const { palavrasQ, quadradosDoPalito } = instancia;
  const restante = Uint32Array.from(universo);
  for (const ip of palitos) bits.subtrair(restante, quadradosDoPalito, ip * palavrasQ, palavrasQ);
  return bits.estaVazia(restante, palavrasQ);
}

export function resolverGuloso(instancia, reducao) {
  const { m, palavrasQ, quadradosDoPalito } = instancia;

  const descobertos = Uint32Array.from(reducao.ativos);
  const gulosos = [];

  while (!bits.estaVazia(descobertos, palavrasQ)) {
    let melhor = -1;
    let melhorGanho = 0;

    for (let ip = 0; ip < m; ip += 1) {
      const ganho = bits.contarInterseccao(descobertos, quadradosDoPalito, ip * palavrasQ, palavrasQ);
      if (ganho > melhorGanho) {
        melhorGanho = ganho;
        melhor = ip;
      }
    }

    if (melhor === -1) throw new ErroSolver('nenhum palito cobre os quadrados restantes');

    gulosos.push(melhor);
    bits.subtrair(descobertos, quadradosDoPalito, melhor * palavrasQ, palavrasQ);
  }

  for (let i = gulosos.length - 1; i >= 0; i -= 1) {
    const resto = gulosos.filter((_, j) => j !== i);
    if (cobre(instancia, reducao.ativos, resto)) gulosos.splice(i, 1);
  }

  return {
    escolhidos: [...reducao.obrigatorios, ...gulosos],
    alemDosObrigatorios: gulosos.length,
  };
}
```

`ganho > melhorGanho`, e não `>=`, é o que preserva o menor índice no empate — é daqui que sai o determinismo do RNF05.

A poda percorre de trás para frente porque `splice` reindexa: indo do fim para o começo, os índices ainda não visitados não se deslocam. E ela só percorre `gulosos`, nunca os obrigatórios: um palito obrigatório é o único lado removível de algum quadrado, e esse quadrado já saiu de `reducao.ativos` — a poda não teria como perceber que ele é indispensável.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, código de saída 0.

- [ ] **Step 5: Commit**

```bash
git add src/solver/guloso.js tools/verificar-solver.mjs
git commit -m "Adiciona a fase gulosa do solver"
```

---

## Task 5: Cota inferior, busca exata fatiada e oráculo de força bruta

**Files:**
- Create: `src/solver/exato.js`
- Modify: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: `bits.js`; `Instancia` e `Reducao` das Tasks 2–3; `cobre` da Task 4.
- Produces:
  - `cotaInferior(instancia, reducao, descobertos, usados) -> number` — `usados` é um buffer de `palavrasM` palavras, reaproveitado entre chamadas; a função o zera antes de usar.
  - `prepararBusca(instancia, reducao, tetoInicial) -> Busca`, onde `Busca` é
    `{ executarFatia(limiteMs) -> 'concluido' | 'pausado', melhorTamanho() -> number, melhorCaminho() -> number[] | null, nos() -> number, cotaRaiz() -> number }`.
    `tetoInicial` é `guloso.alemDosObrigatorios`. `melhorTamanho()` e `melhorCaminho()` contam **apenas** os palitos além dos obrigatórios. `melhorCaminho()` devolve `null` enquanto a busca não superar o teto.
  - No arranjo de verificação: `elimina(config, palitos) -> boolean` e `otimoPorForcaBruta(config, teto) -> number | null`, usados também na Task 9.

- [ ] **Step 1: Acrescentar os helpers de oráculo ao arranjo**

No topo de `tools/verificar-solver.mjs`, logo abaixo do comentário de uso, acrescente os imports estáticos:

```js
import { montarGrade, registrarAusencia } from '../src/core/grid.js';
import { ESTADOS } from '../src/core/rules.js';
```

E acrescente, ao final do arquivo, antes de `await principal();`:

```js
function elimina(config, palitos) {
  const grade = montarGrade(config);
  for (const id of palitos) {
    if (grade.palitos.get(id) !== ESTADOS.REMOVIVEL) return false;
    grade.palitos.set(id, ESTADOS.REMOVIDO);
    registrarAusencia(grade, id);
  }
  return grade.quadradosVivos === 0;
}

function otimoPorForcaBruta(config, teto) {
  const grade = montarGrade(config);
  const vivos = grade.quadrados.filter((quadrado) => quadrado.ausentes === 0);
  if (vivos.length === 0) return 0;
  if (vivos.length > 30) throw new Error('forca bruta so vale para instancias de ate 30 quadrados');

  const mascaraDoPalito = new Map();
  for (const [id, estado] of grade.palitos) {
    if (estado !== ESTADOS.REMOVIVEL) continue;
    let mascara = 0;
    vivos.forEach((quadrado, i) => {
      if (quadrado.bordas.includes(id)) mascara |= 1 << i;
    });
    mascaraDoPalito.set(id, mascara);
  }

  const ladosDoQuadrado = vivos.map(
    (quadrado) => quadrado.bordas.filter((id) => mascaraDoPalito.has(id)),
  );
  const alvo = (1 << vivos.length) - 1;

  for (let k = 1; k < teto; k += 1) {
    if (buscar(0, k)) return k;
  }
  return null;

  function buscar(coberto, restam) {
    if (coberto === alvo) return true;
    if (restam === 0) return false;

    let iq = 0;
    while ((coberto & (1 << iq)) !== 0) iq += 1;

    for (const id of ladosDoQuadrado[iq]) {
      if (buscar(coberto | mascaraDoPalito.get(id), restam - 1)) return true;
    }
    return false;
  }
}
```

`otimoPorForcaBruta` devolve o tamanho da menor solução com **menos** palitos que `teto`, ou `null` se não existir nenhuma.

Ele é um oráculo independente: não importa nada de `src/solver/`, monta a grade pelo `core/` e faz aprofundamento iterativo puro — sem pré-processamento, sem cota inferior, sem ordenação de candidatos, sem teto do guloso. As duas únicas coisas que compartilha com a busca real são a formulação e a ideia de ramificar pelo primeiro quadrado descoberto, que é o que o mantém viável: o fator de ramificação fica em no máximo 4, então o custo é `4^k` em vez dos `C(40, k)` de uma enumeração de subconjuntos, que seriam bilhões de casos numa 4×4 limpa.

Justamente por não compartilhar redução nem poda, ele pega os dois erros mais prováveis: uma dominância que descarta o que não devia e uma cota inferior que superestima.

O limite de 30 quadrados existe porque a máscara é um inteiro de 32 bits. Só instâncias 4×4 passam por aí.

- [ ] **Step 2: Escrever a verificação que falha**

Adicione `await verificarExato();` em `principal()` e a função:

```js
async function verificarExato() {
  const { compilarInstancia, reduzirInstancia } = await import('../src/solver/instancia.js');
  const { resolverGuloso, cobre } = await import('../src/solver/guloso.js');
  const { prepararBusca, cotaInferior } = await import('../src/solver/exato.js');
  secao('exato');

  const casos = [
    { rotulo: '4x4 limpa', config: { n: 4, quebrados: [], bloqueados: [] } },
    { rotulo: '4x4 com obstaculos', config: { n: 4, quebrados: ['h:2:1', 'v:1:2'], bloqueados: ['h:0:0', 'v:3:3', 'h:4:2'] } },
  ];

  for (const caso of casos) {
    const instancia = compilarInstancia(caso.config);
    const reducao = reduzirInstancia(instancia);
    const guloso = resolverGuloso(instancia, reducao);

    const usados = new Uint32Array(instancia.palavrasM);
    const cota = cotaInferior(instancia, reducao, reducao.ativos, usados);
    checar(`${caso.rotulo}: cota nao passa do guloso`, cota <= guloso.alemDosObrigatorios, `${cota} vs ${guloso.alemDosObrigatorios}`);

    const busca = prepararBusca(instancia, reducao, guloso.alemDosObrigatorios);
    let situacao = 'pausado';
    while (situacao === 'pausado') situacao = busca.executarFatia(200);
    checar(`${caso.rotulo}: a busca conclui`, situacao === 'concluido');
    checar(
      `${caso.rotulo}: o otimo nao e pior que o guloso`,
      busca.melhorTamanho() <= guloso.alemDosObrigatorios,
      `${busca.melhorTamanho()} vs ${guloso.alemDosObrigatorios}`,
    );
    checar(`${caso.rotulo}: o otimo respeita a cota`, busca.melhorTamanho() >= cota);

    const caminho = busca.melhorCaminho();
    const solucao = caminho === null ? guloso.escolhidos : [...reducao.obrigatorios, ...caminho];
    checar(`${caso.rotulo}: a solucao cobre a instancia reduzida`, cobre(instancia, reducao.ativos, solucao));
    checar(`${caso.rotulo}: nao repete palito`, new Set(solucao).size === solucao.length);

    const ids = solucao.map((ip) => instancia.palitos[ip]);
    checar(`${caso.rotulo}: a solucao mata a grade de verdade`, elimina(caso.config, ids));
    checar(
      `${caso.rotulo}: forca bruta confirma o otimo`,
      otimoPorForcaBruta(caso.config, ids.length) === null,
      `existe solucao menor que ${ids.length}`,
    );
  }

  const grande = compilarInstancia({ n: 7, quebrados: [], bloqueados: [] });
  const reducaoGrande = reduzirInstancia(grande);
  const gulosoGrande = resolverGuloso(grande, reducaoGrande);
  const buscaGrande = prepararBusca(grande, reducaoGrande, gulosoGrande.alemDosObrigatorios);
  const situacaoGrande = buscaGrande.executarFatia(8);
  checar('fatia de 8ms devolve o controle', situacaoGrande === 'concluido' || situacaoGrande === 'pausado');
  checar('a fatia visitou nos', buscaGrande.nos() > 0, `nos=${buscaGrande.nos()}`);
}
```

O segundo caso tem obstáculos de propósito: é onde o pré-processamento realmente age, e onde um erro de dominância aparece. Os dois casos são conferidos contra a força bruta, então esta tarefa já prova a corretude do conjunto guloso + redução + busca em instâncias pequenas.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA com `Cannot find module` apontando para `src/solver/exato.js`.

- [ ] **Step 4: Implementar `src/solver/exato.js`**

```js
import * as bits from './bits.js';

const NOS_ENTRE_RELOGIOS = 1024;

export function cotaInferior(instancia, reducao, descobertos, usados) {
  const { palavrasM, palitosDoQuadrado } = instancia;
  const { ordemPorGrau } = reducao;

  usados.fill(0);
  let cota = 0;

  for (let i = 0; i < ordemPorGrau.length; i += 1) {
    const iq = ordemPorGrau[i];
    if (!bits.temBit(descobertos, iq)) continue;
    if (bits.haInterseccao(usados, palitosDoQuadrado, iq * palavrasM, palavrasM)) continue;
    cota += 1;
    bits.unir(usados, palitosDoQuadrado, iq * palavrasM, palavrasM);
  }

  return cota;
}

export function prepararBusca(instancia, reducao, tetoInicial) {
  const { palavrasM, palavrasQ, palitosDoQuadrado, quadradosDoPalito } = instancia;
  const { ativos, ordemPorGrau } = reducao;

  const usados = new Uint32Array(palavrasM);
  const caminho = [];
  const buffers = [];
  const pilha = [];

  let melhorTamanho = tetoInicial;
  let melhorCaminho = null;
  let nos = 0;

  const raiz = Uint32Array.from(ativos);
  const cotaRaiz = cotaInferior(instancia, reducao, raiz, usados);

  if (!bits.estaVazia(raiz, palavrasQ) && melhorTamanho > 0) {
    pilha.push(criarQuadro(raiz, 0));
  }

  function buffer(profundidade) {
    while (buffers.length <= profundidade) buffers.push(new Uint32Array(palavrasQ));
    return buffers[profundidade];
  }

  function escolherQuadrado(descobertos) {
    for (let i = 0; i < ordemPorGrau.length; i += 1) {
      const iq = ordemPorGrau[i];
      if (bits.temBit(descobertos, iq)) return iq;
    }
    return -1;
  }

  function candidatosDe(iq, descobertos) {
    const lista = [];
    const desloc = iq * palavrasM;
    for (let palavra = 0; palavra < palavrasM; palavra += 1) {
      let restante = palitosDoQuadrado[desloc + palavra];
      while (restante !== 0) {
        const isolado = restante & -restante;
        lista.push(palavra * 32 + (31 - Math.clz32(isolado)));
        restante ^= isolado;
      }
    }

    const ganho = new Map();
    for (const ip of lista) {
      ganho.set(ip, bits.contarInterseccao(descobertos, quadradosDoPalito, ip * palavrasQ, palavrasQ));
    }
    lista.sort((a, b) => (ganho.get(b) - ganho.get(a)) || (a - b));
    return lista;
  }

  function criarQuadro(descobertos, profundidade) {
    const iq = escolherQuadrado(descobertos);
    return { descobertos, profundidade, candidatos: candidatosDe(iq, descobertos), proximo: 0 };
  }

  function executarFatia(limiteMs) {
    const fim = agora() + limiteMs;
    let desdeORelogio = 0;

    while (pilha.length > 0) {
      if (desdeORelogio >= NOS_ENTRE_RELOGIOS) {
        desdeORelogio = 0;
        if (agora() >= fim) return 'pausado';
      }
      desdeORelogio += 1;
      nos += 1;

      const topo = pilha[pilha.length - 1];
      if (topo.proximo >= topo.candidatos.length) {
        pilha.pop();
        continue;
      }

      const ip = topo.candidatos[topo.proximo];
      topo.proximo += 1;

      const profundidade = topo.profundidade;
      caminho[profundidade] = ip;

      const proximos = buffer(profundidade);
      bits.copiar(proximos, topo.descobertos, 0, palavrasQ);
      bits.subtrair(proximos, quadradosDoPalito, ip * palavrasQ, palavrasQ);

      if (bits.estaVazia(proximos, palavrasQ)) {
        if (profundidade + 1 < melhorTamanho) {
          melhorTamanho = profundidade + 1;
          melhorCaminho = caminho.slice(0, profundidade + 1);
        }
        continue;
      }

      if (profundidade + 1 + cotaInferior(instancia, reducao, proximos, usados) >= melhorTamanho) continue;

      pilha.push(criarQuadro(proximos, profundidade + 1));
    }

    return 'concluido';
  }

  return {
    executarFatia,
    melhorTamanho: () => melhorTamanho,
    melhorCaminho: () => (melhorCaminho === null ? null : [...melhorCaminho]),
    nos: () => nos,
    cotaRaiz: () => cotaRaiz,
  };
}

function agora() {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
```

Cinco armadilhas deste arquivo:

**`buffer(profundidade)` devolve sempre a mesma máscara para uma profundidade.** É seguro porque, quando o quadro na profundidade `d` avança para o próximo candidato, todos os quadros mais fundos já foram desempilhados — ninguém mais lê `buffers[d]`. Não troque por alocação nova: são milhões de nós.

**`caminho[profundidade] = ip` sobrescreve posições antigas o tempo todo.** Só as posições `0..profundidade` valem, e é por isso que a cópia usa `slice(0, profundidade + 1)`.

**A poda é `>=`, não `>`.** Precisamos de solução estritamente melhor que `melhorTamanho` para o ramo valer a pena.

**O primeiro quadro só é empilhado se ainda há quadrado descoberto e `melhorTamanho > 0`.** Instância já resolvida pelo pré-processamento devolve `'concluido'` na primeira fatia, com `melhorCaminho()` em `null`.

**`melhorCaminho()` devolve cópia.** Sem ela, quem chamar recebe um vetor que a busca ainda vai reescrever.

- [ ] **Step 5: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, código de saída 0. A seção `exato` leva alguns segundos: a força bruta na 4×4 limpa é o trecho lento, e é ela que prova que a redução e a cota não estão cortando soluções válidas.

- [ ] **Step 6: Commit**

```bash
git add src/solver/exato.js tools/verificar-solver.mjs
git commit -m "Adiciona a busca exata fatiada com cota inferior"
```

---

## Task 6: Contrato público do solver

**Files:**
- Create/Replace: `src/solver/index.js`
- Delete: `src/solver/referencia.js`
- Modify: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: tudo das Tasks 2–5.
- Produces:
  - `resolver(config, { orcamentoMs, fatiaMs, sinal, aoMelhorar } = {}) -> Promise<SolverResult>`.
  - `ErroSolver` (reexportado de `instancia.js`).
  - `ORCAMENTO_PADRAO` — objeto congelado `{ 4: 200, 5: 200, 6: 1000, 7: 2000 }`, em milissegundos.
  - `SolverResult` conforme a seção 10 da spec.

- [ ] **Step 1: Escrever a verificação que falha**

Adicione `await verificarContrato();` em `principal()` e a função:

```js
async function verificarContrato() {
  const { resolver, ErroSolver, ORCAMENTO_PADRAO } = await import('../src/solver/index.js');
  secao('contrato');

  const config = { id: 'sintetica-4', n: 4, quebrados: [], bloqueados: [] };
  const resultado = await resolver(config, { orcamentoMs: 30000, fatiaMs: 200 });

  checar('devolve lista de ids textuais', resultado.palitos.every((id) => typeof id === 'string'));
  checar('quantidade bate com a lista', resultado.quantidade === resultado.palitos.length);
  checar('origem e guloso ou exato', ['guloso', 'exato'].includes(resultado.origem));
  checar('4x4 limpa fecha a prova', resultado.proven === true, `origem=${resultado.origem}`);
  checar('tempoMs e numero', typeof resultado.tempoMs === 'number');
  checar('a solucao mata a grade', elimina(config, resultado.palitos));
  checar(
    'diagnostico traz as duas fases',
    typeof resultado.diagnostico.guloso.quantidade === 'number'
      && typeof resultado.diagnostico.exato.concluiu === 'boolean',
  );
  checar('o exato nunca piora o guloso', resultado.quantidade <= resultado.diagnostico.guloso.quantidade);
  checar('a cota nao passa do resultado', resultado.diagnostico.cotaInferior <= resultado.quantidade);
  checar(
    'ORCAMENTO_PADRAO cobre os quatro tamanhos',
    [4, 5, 6, 7].every((n) => typeof ORCAMENTO_PADRAO[n] === 'number'),
  );

  const parciais = [];
  await resolver(config, {
    orcamentoMs: 30000,
    fatiaMs: 200,
    aoMelhorar: (parcial) => parciais.push(parcial.quantidade),
  });
  checar('aoMelhorar e chamado ao menos uma vez', parciais.length >= 1, `${parciais.length}`);
  checar(
    'as parciais nunca aumentam',
    parciais.every((valor, i) => i === 0 || valor <= parciais[i - 1]),
    parciais.join(','),
  );

  const repetido = await resolver(config, { orcamentoMs: 30000, fatiaMs: 200 });
  checar('duas execucoes coincidem', repetido.palitos.join(',') === resultado.palitos.join(','));

  const todosHorizontais = [];
  for (let linha = 0; linha <= 4; linha += 1) {
    for (let coluna = 0; coluna < 4; coluna += 1) todosHorizontais.push(`h:${linha}:${coluna}`);
  }
  const morta = await resolver({ id: 'morta', n: 4, quebrados: todosHorizontais, bloqueados: [] });
  checar('grade sem quadrado vivo resolve com zero palitos', morta.quantidade === 0 && morta.palitos.length === 0);
  checar('grade sem quadrado vivo e provada', morta.proven === true);

  const controlador = new AbortController();
  controlador.abort();
  let cancelou = false;
  try {
    await resolver({ id: 'cancelada', n: 7, quebrados: [], bloqueados: [] }, { sinal: controlador.signal });
  } catch (erro) {
    cancelou = erro instanceof ErroSolver && erro.cancelado === true;
  }
  checar('sinal ja abortado cancela', cancelou);

  const apertado = await resolver({ id: 'apertada', n: 7, quebrados: [], bloqueados: [] }, { orcamentoMs: 1 });
  checar('orcamento minusculo nao quebra', typeof apertado.quantidade === 'number');
  checar('orcamento minusculo ainda devolve resposta util', apertado.quantidade > 0);
}
```

A grade "morta" quebra todos os 20 palitos horizontais de uma 4×4. Como todo quadrado precisa de uma aresta horizontal em cima e outra embaixo, nenhum sobrevive — é o caso-limite da seção 13 da spec.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA em `resolver is not a function` ou `ORCAMENTO_PADRAO is not defined`.

- [ ] **Step 3: Reescrever `src/solver/index.js`**

Substitua o conteúdo inteiro por:

```js
import { compilarInstancia, reduzirInstancia, ErroSolver } from './instancia.js';
import { resolverGuloso } from './guloso.js';
import { prepararBusca } from './exato.js';
import * as bits from './bits.js';

export { ErroSolver };

export const ORCAMENTO_PADRAO = Object.freeze({ 4: 200, 5: 200, 6: 1000, 7: 2000 });

const FATIA_PADRAO_MS = 8;

export async function resolver(config, { orcamentoMs, fatiaMs, sinal, aoMelhorar } = {}) {
  const inicio = agora();
  conferirCancelamento(sinal);

  const instancia = compilarInstancia(config);
  const quadradosVivos = instancia.q;
  const reducao = reduzirInstancia(instancia);
  const quadradosAposReducao = bits.contar(reducao.ativos, 0, instancia.palavrasQ);

  const inicioGuloso = agora();
  const guloso = resolverGuloso(instancia, reducao);
  const tempoGuloso = agora() - inicioGuloso;

  const busca = prepararBusca(instancia, reducao, guloso.alemDosObrigatorios);
  const base = {
    guloso: { quantidade: guloso.escolhidos.length, tempoMs: tempoGuloso },
    cotaInferior: reducao.obrigatorios.length + busca.cotaRaiz(),
    obrigatorios: reducao.obrigatorios.length,
    palitosRemoviveis: instancia.m,
    quadradosVivos,
    quadradosAposReducao,
  };

  const inicioExato = agora();

  const relatar = (caminho, origem, concluiu) => montar(instancia, reducao, guloso, caminho, {
    proven: concluiu,
    origem,
    tempoMs: agora() - inicio,
    diagnostico: {
      ...base,
      exato: {
        quantidade: reducao.obrigatorios.length + busca.melhorTamanho(),
        tempoMs: agora() - inicioExato,
        nos: busca.nos(),
        concluiu,
      },
    },
  });

  aoMelhorar?.(relatar(null, 'guloso', false));

  const limite = orcamentoMs ?? ORCAMENTO_PADRAO[instancia.n] ?? 1000;
  const fatia = fatiaMs ?? FATIA_PADRAO_MS;

  let situacao = 'pausado';
  let ultimoRelatado = guloso.alemDosObrigatorios;

  while (situacao === 'pausado') {
    situacao = busca.executarFatia(fatia);
    if (situacao === 'concluido') break;

    if (busca.melhorTamanho() < ultimoRelatado) {
      ultimoRelatado = busca.melhorTamanho();
      aoMelhorar?.(relatar(busca.melhorCaminho(), 'exato', false));
    }

    if (agora() - inicioExato >= limite) break;
    await ceder();
    conferirCancelamento(sinal);
  }

  const concluiu = situacao === 'concluido';
  const caminho = busca.melhorCaminho();
  return relatar(caminho, caminho === null ? 'guloso' : 'exato', concluiu);
}

function montar(instancia, reducao, guloso, caminho, extras) {
  const indices = caminho === null ? guloso.escolhidos : [...reducao.obrigatorios, ...caminho];
  const palitos = indices.map((ip) => instancia.palitos[ip]);
  return { palitos, quantidade: palitos.length, ...extras };
}

function conferirCancelamento(sinal) {
  if (sinal?.aborted) throw new ErroSolver('busca cancelada', { cancelado: true });
}

function ceder() {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

function agora() {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
```

`melhorTamanho()` e `cotaRaiz()` contam só a parte além dos obrigatórios; por isso `reducao.obrigatorios.length` é somado em todo lugar que vai para o `diagnostico`. Mudar isso produz números silenciosamente errados no relatório de 22/09.

`origem` é `'guloso'` quando a busca não superou o teto — inclusive no caso feliz em que ela **provou** que o guloso já era ótimo (`proven: true`, `origem: 'guloso'`).

O guloso e o primeiro `aoMelhorar` acontecem antes do primeiro `await`, ou seja, de forma síncrona para quem chamou. É o que garante que a interface nunca fique sem número.

- [ ] **Step 4: Remover o mock**

```bash
git rm src/solver/referencia.js
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, código de saída 0.

- [ ] **Step 6: Commit**

```bash
git add src/solver/index.js tools/verificar-solver.mjs
git commit -m "Substitui o mock do solver pelo contrato real"
```

---

## Task 7: Tirar a solução de referência do dataset

**Files:**
- Modify: `src/dataset/loader.js`
- Modify: `tools/gerar-dataset.mjs`
- Modify: `data/grids/4x4.json`, `5x5.json`, `6x6.json`, `7x7.json` (regerados)
- Modify: `tools/verificar-solver.mjs`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: `configDaGrade(dataset, grid)` passa a devolver `{ id, n, quebrados, bloqueados }`, sem `referencia`. `validarDataset` deixa de exigir o campo.

- [ ] **Step 1: Escrever a verificação que falha**

Adicione `await verificarDataset();` em `principal()` e a função:

```js
async function verificarDataset() {
  const { readFile } = await import('node:fs/promises');
  const { validarDataset, configDaGrade } = await import('../src/dataset/loader.js');
  secao('dataset');

  for (const n of [4, 5, 6, 7]) {
    const url = new URL(`../data/grids/${n}x${n}.json`, import.meta.url);
    const dados = JSON.parse(await readFile(url, 'utf8'));
    checar(`${n}x${n}: json valida`, validarDataset(dados) === dados);
    checar(`${n}x${n}: nenhuma grade guarda referencia`, dados.grids.every((g) => g.referencia === undefined));
    checar(`${n}x${n}: 20 grades`, dados.grids.length === 20, `${dados.grids.length}`);

    const config = configDaGrade(dados, dados.grids[0]);
    checar(`${n}x${n}: config nao propaga referencia`, config.referencia === undefined);
    checar(
      `${n}x${n}: config tem o que o solver precisa`,
      config.n === n && typeof config.id === 'string'
        && Array.isArray(config.quebrados) && Array.isArray(config.bloqueados),
    );
  }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/verificar-solver.mjs`
Expected: FALHA nas verificações `nenhuma grade guarda referencia` e `config nao propaga referencia`.

- [ ] **Step 3: Tirar `referencia` do loader**

Em `src/dataset/loader.js`, apague este bloco inteiro de dentro do laço `for (const grid of dados.grids)`:

```js
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
```

E troque `configDaGrade` por:

```js
export function configDaGrade(dataset, grid) {
  return {
    id: grid.id,
    n: dataset.n,
    quebrados: grid.quebrados,
    bloqueados: grid.bloqueados,
  };
}
```

Não mexa em mais nada do arquivo: a validação de ids, de duplicatas e do conflito quebrado/bloqueado continua valendo, e `listaDePalitos` continua sendo usada pelos dois campos que sobraram.

- [ ] **Step 4: Parar de gravar `referencia` no gerador**

Em `tools/gerar-dataset.mjs`, dentro de `gerarGrade`, troque o `return` final por:

```js
    return {
      n,
      quebrados,
      bloqueados,
      dificuldade: classificarDificuldade(corte.length),
    };
```

E em `gerarDataset`, troque o `grids.push({ ... })` por:

```js
    grids.push({
      id: `g${n}-${String(grids.length + 1).padStart(3, '0')}`,
      quebrados: config.quebrados,
      bloqueados: config.bloqueados,
      dificuldade: config.dificuldade,
    });
```

O conjunto de corte continua sendo calculado dentro de `gerarGrade` — é ele que garante RN04/RN05 ao posicionar os bloqueados fora do corte, e é dele que sai `classificarDificuldade`. Só deixa de ser gravado.

- [ ] **Step 5: Regerar os datasets**

Run: `node tools/gerar-dataset.mjs`
Expected: quatro linhas no formato `...\data\grids\NxN.json: 20 grades`.

Run: `git diff --numstat data/grids/`
Expected: quatro linhas, todas com **0 na coluna de adições** — a seed não mudou, então `quebrados` e `bloqueados` são idênticos e o diff só remove o bloco `referencia`.

Se aparecer qualquer linha adicionada, **pare**: alguma coisa além do campo `referencia` mudou, e as grades do dataset deixariam de ser as mesmas de antes (RNF05).

- [ ] **Step 6: Rodar e ver passar**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, código de saída 0.

- [ ] **Step 7: Commit**

```bash
git add src/dataset/loader.js tools/gerar-dataset.mjs tools/verificar-solver.mjs data/grids/
git commit -m "Remove a solucao de referencia do dataset"
```

---

## Task 8: Ligar o solver na interface

**Files:**
- Modify: `src/ui/app.js`

**Interfaces:**
- Consumes: `resolver` e `ErroSolver` da Task 6; `configDaGrade` da Task 7.
- Produces: nada para tarefas seguintes. O store passa a receber `solucao` automaticamente a cada nova grade.

- [ ] **Step 1: Trocar o import**

Em `src/ui/app.js`, linha 3, troque:

```js
import { resolver } from '../solver/index.js';
```

por:

```js
import { resolver, ErroSolver } from '../solver/index.js';
```

- [ ] **Step 2: Declarar o controlador da busca**

Logo abaixo de `let dataset = null;`, acrescente:

```js
  let buscaAtual = null;
```

- [ ] **Step 3: Disparar o solver ao carregar a grade**

Em `novaGrade(n)`, acrescente uma linha ao final da função, depois de `desenhar(jogo.obterEstado());`:

```js
    dispararSolver(config);
```

E acrescente a função nova, logo depois de `novaGrade`:

```js
  function dispararSolver(config) {
    buscaAtual?.abort();
    const controlador = new AbortController();
    buscaAtual = controlador;

    const aplicar = (solucao) => {
      if (store.obter().config?.id !== config.id) return;
      store.atualizar({ solucao });
    };

    resolver(config, { sinal: controlador.signal, aoMelhorar: aplicar })
      .then(aplicar)
      .catch((erro) => {
        if (erro instanceof ErroSolver && erro.cancelado) return;
        relatarErro(`Não foi possível calcular a solução: ${erro.message}`);
      });
  }
```

A guarda por `config.id` é o que impede uma busca antiga de sobrescrever a solução da grade nova. E, como `resolver` roda o guloso antes do primeiro `await`, o primeiro `aplicar` acontece de forma síncrona, ainda dentro de `dispararSolver` — a interface nunca fica sem número.

- [ ] **Step 4: Simplificar as duas telas que pediam o solver**

Troque `mostrarSolucao` inteira por:

```js
  function mostrarSolucao() {
    if (!store.obter().solucao) return;
    store.atualizar({ vista: 'solucao' });
    limparErro();
  }
```

E o manipulador `aoVerDesempenho` passado a `criarBanners` por:

```js
    aoVerDesempenho: () => {
      if (!store.obter().config) return;
      store.atualizar({ vista: 'desempenho' });
      limparErro();
    },
```

Com isso `mostrarSolucao` deixa de ser `async` e o bloco `try/catch` dela some; o `aoSolucionar` que a chama continua igual.

- [ ] **Step 5: Remover a estimativa vinda do dataset**

Apague a função `estimativaDaConfig` do final do arquivo:

```js
function estimativaDaConfig(config) {
  const quantidade = config?.referencia?.quantidade;
  return typeof quantidade === 'number' ? { quantidade, proven: false } : null;
}
```

Dentro de `desenhar`, troque a chamada de `banners.renderizar` por:

```js
    banners.renderizar({
      vista: ui.vista,
      status: estadoJogo.status,
      solucao: ui.solucao,
      palitosRemovidos: estadoJogo.palitosRemovidos,
    });
```

E a de `desempenho.renderizar` por:

```js
      desempenho.renderizar(calcularResumo({
        palitosRemovidos: estadoJogo.palitosRemovidos,
        minimo: ui.solucao?.quantidade ?? null,
        iniciadoEm: estadoJogo.iniciadoEm,
        finalizadoEm: estadoJogo.finalizadoEm,
      }));
```

- [ ] **Step 6: Conferir que nada mais lê o campo removido**

Run: `grep -rn "referencia" src/`
Expected: nenhuma saída.

Run: `grep -rn "estimativaDaConfig" src/`
Expected: nenhuma saída.

Run: `grep -rn "document\|window\|fetch" src/solver/`
Expected: nenhuma saída.

- [ ] **Step 7: Verificar no navegador**

Run: `npm start`

Abra a URL impressa e confira, nesta ordem:

1. O console não mostra erro de CSP nem de módulo.
2. Numa grade 4×4, a tela Solução e o card de vitória dizem **"Melhor forma encontrada: N palito(s)"** — sem a palavra "Estimativa".
3. Troque para 7×7 e clique em Solucionar imediatamente: a tela abre sem travar. O número pode aparecer como estimativa e diminuir sozinho poucos segundos depois.
4. Clique em "Nova Grade" várias vezes seguidas, rápido: nenhum erro no console, e o número exibido sempre corresponde à grade na tela.
5. Jogue uma 4×4 até vencer e abra Desempenho: a eficiência **não** passa de 100%.

O item 5 é o teste de fumaça mais importante da tarefa: eficiência acima de 100% significava que o número de referência era pior que o do jogador — o defeito que esta etapa existe para eliminar.

- [ ] **Step 8: Commit**

```bash
git add src/ui/app.js
git commit -m "Dispara o solver ao carregar a grade e remove a estimativa do dataset"
```

---

## Task 9: Varredura das 80 grades, benchmark e README

**Files:**
- Modify: `tools/verificar-solver.mjs`
- Modify: `src/solver/index.js` (apenas os valores de `ORCAMENTO_PADRAO`)
- Modify: `README.md`

**Interfaces:**
- Consumes: tudo das tarefas anteriores, incluindo `elimina` e `otimoPorForcaBruta` da Task 5.
- Produces: `node tools/verificar-solver.mjs` valida as 80 grades e imprime a tabela guloso × exato da etapa de 22/09.

- [ ] **Step 1: Escrever a varredura**

Adicione `await verificarVarredura();` em `principal()`, depois de `verificarDataset()`, e estas duas funções:

```js
async function verificarVarredura() {
  const { readFile } = await import('node:fs/promises');
  const { validarDataset, configDaGrade } = await import('../src/dataset/loader.js');
  const { resolver } = await import('../src/solver/index.js');
  secao('varredura das 80 grades');

  const linhas = [];

  for (const n of [4, 5, 6, 7]) {
    const url = new URL(`../data/grids/${n}x${n}.json`, import.meta.url);
    const dataset = validarDataset(JSON.parse(await readFile(url, 'utf8')));

    for (const [posicao, grid] of dataset.grids.entries()) {
      const config = configDaGrade(dataset, grid);
      const resultado = await resolver(config, { orcamentoMs: 5000, fatiaMs: 200 });

      const quebrados = new Set(grid.quebrados);
      const bloqueados = new Set(grid.bloqueados);

      checar(`${grid.id}: elimina todos os quadrados`, elimina(config, resultado.palitos));
      checar(
        `${grid.id}: nao usa palito proibido`,
        resultado.palitos.every((id) => !quebrados.has(id) && !bloqueados.has(id)),
      );
      checar(
        `${grid.id}: solucao minimal`,
        resultado.palitos.every((_, i) => !elimina(config, resultado.palitos.filter((__, j) => j !== i))),
      );

      if (posicao < 3) {
        const repetido = await resolver(config, { orcamentoMs: 5000, fatiaMs: 200 });
        checar(`${grid.id}: deterministico`, repetido.palitos.join(',') === resultado.palitos.join(','));
      }

      if (n === 4) {
        const menor = otimoPorForcaBruta(config, resultado.quantidade);
        checar(
          `${grid.id}: forca bruta confirma o otimo`,
          menor === null,
          menor === null ? '' : `existe solucao com ${menor} palitos`,
        );
      }

      linhas.push({
        id: grid.id,
        n,
        guloso: resultado.diagnostico.guloso.quantidade,
        exato: resultado.quantidade,
        cota: resultado.diagnostico.cotaInferior,
        nos: resultado.diagnostico.exato.nos,
        msGuloso: resultado.diagnostico.guloso.tempoMs,
        msExato: resultado.diagnostico.exato.tempoMs,
        provado: resultado.proven,
      });
    }
  }

  imprimirBenchmark(linhas);
}

function imprimirBenchmark(linhas) {
  console.log('\n== benchmark guloso x exato');
  console.log('grade      n  guloso  exato   cota       nos  ms_guloso   ms_exato  provado');
  for (const l of linhas) {
    console.log(
      `${l.id.padEnd(10)} ${String(l.n).padEnd(2)} ${String(l.guloso).padStart(6)} `
      + `${String(l.exato).padStart(6)} ${String(l.cota).padStart(6)} ${String(l.nos).padStart(9)} `
      + `${l.msGuloso.toFixed(2).padStart(10)} ${l.msExato.toFixed(2).padStart(10)}  ${l.provado ? 'sim' : 'nao'}`,
    );
  }

  console.log('');
  for (const n of [4, 5, 6, 7]) {
    const doTamanho = linhas.filter((l) => l.n === n);
    if (doTamanho.length === 0) continue;
    const provadas = doTamanho.filter((l) => l.provado).length;
    const piorMs = Math.max(...doTamanho.map((l) => l.msExato));
    const excedente = doTamanho.reduce((soma, l) => soma + (l.guloso - l.exato), 0) / doTamanho.length;
    console.log(
      `${n}x${n}: ${provadas}/${doTamanho.length} provadas · pior tempo do exato ${piorMs.toFixed(1)} ms · `
      + `o guloso excede o melhor achado em ${excedente.toFixed(2)} palito(s) em media`,
    );
  }
}
```

A varredura leva alguns minutos: a força bruta das 20 grades 4×4 é o trecho lento, e é ela que garante que a busca exata não está devolvendo resposta subótima.

- [ ] **Step 2: Rodar a varredura**

Run: `node tools/verificar-solver.mjs`
Expected: todas as linhas `ok`, a tabela de 80 linhas, os quatro resumos por tamanho e código de saída 0.

Se alguma grade 4×4 falhar em `forca bruta confirma o otimo`, **pare**: é defeito na busca exata ou na redução, não no orçamento. Volte às Tasks 3 e 5.

- [ ] **Step 3: Ajustar os orçamentos com o que a tabela mostrou**

Olhe as quatro linhas de resumo. Para cada tamanho:

- Se todas as grades foram provadas e o pior tempo do exato ficou bem abaixo do valor em `ORCAMENTO_PADRAO` (`src/solver/index.js`), reduza o orçamento para cerca do dobro do pior tempo medido, arredondado para cima numa centena de milissegundos.
- Se alguma grade não foi provada, aumente o orçamento — até no máximo 3000 ms. Acima disso, aceite que aquele tamanho às vezes devolve `proven: false`; é o comportamento previsto na seção 17 da spec.

Edite `ORCAMENTO_PADRAO` com os valores escolhidos e anote-os para o passo seguinte.

- [ ] **Step 4: Atualizar o README**

Em `README.md`, seção "Estado atual", substitua o item que começa com `- ⏳ **Solver ainda não implementado.**` por (trocando cada `N` pelos números que você acabou de escolher):

```markdown
- ✅ **Solver implementado.** `src/solver/` resolve a instância ao vivo, a cada grade:
  heurística gulosa como teto e busca exata com poda como prova. A busca roda em fatias
  de 8 ms, então a interface nunca congela, e o número exibido é promovido de
  "estimativa" para comprovadamente ótimo quando a busca fecha dentro do orçamento
  (N ms em 4×4 e 5×5, N ms em 6×6, N ms em 7×7).
```

Na seção "Regerar o dataset", substitua a frase que termina em `(daí o proven: false: ele resolve, mas não há prova de que seja mínimo)` por:

```markdown
Esse conjunto de corte não é gravado no JSON: ele existe apenas durante a geração, para
garantir que nenhum palito bloqueado seja indispensável. O número mínimo de cada grade é
calculado ao vivo pelo solver, a cada partida.
```

Na árvore da seção "Estrutura", substitua a linha `  solver/             solução de referência (ver "Estado atual")` por estas seis linhas, respeitando a indentação das linhas vizinhas:

    solver/             algoritmo da solução mínima
      bits.js             operações de máscara sobre Uint32Array
      instancia.js        compilação da grade e pré-processamento
      guloso.js           heurística gulosa (fase 1)
      exato.js            branch and bound fatiado (fase 2)
      index.js            contrato: resolver(config, opcoes)

E ao final da seção "Como rodar", acrescente um parágrafo dizendo que `node tools/verificar-solver.mjs` valida o solver contra as 80 grades do dataset e imprime a comparação entre a heurística gulosa e a busca exata, seguido de um bloco de código `bash` com esse comando.

- [ ] **Step 5: Commit**

```bash
git add tools/verificar-solver.mjs src/solver/index.js README.md
git commit -m "Valida o solver contra as 80 grades e ajusta os orcamentos"
```

---

## Fechamento

Depois da Task 9, confirme de uma vez:

```bash
node tools/verificar-solver.mjs
grep -rn "referencia" src/ data/
grep -rn "document\|window\|fetch" src/solver/
git status
```

Esperado: verificação terminando com código 0; nenhuma saída nos dois `grep`; árvore de trabalho limpa.
