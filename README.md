# broken-grid

Trabalho I de Projeto Integrador I

**Broken Grid** (*Killing Squares — Broken Grid*) é um puzzle de lógica jogável no
navegador, desenvolvido como Projeto Integrador I da UDESC.

---

## O jogo

Uma grade N×N de pontos ligados por palitos horizontais e verticais forma quadrados
alinhados aos eixos, de 1×1 até N×N. O objetivo é **remover o menor número possível de
palitos até que não sobre nenhum quadrado completo**.

O problema é NP-completo — e é exatamente essa a motivação didática da disciplina.

A variação *Broken Grid* acrescenta dois obstáculos já presentes na grade inicial:

| Estado | Significado |
| --- | --- |
| `removivel` | palito presente, o jogador pode remover |
| `bloqueado` | palito presente, mas **não** pode ser removido |
| `quebrado` | palito **ausente** desde o início da partida |
| `removido` | palito que o jogador removeu |

### Regra que sustenta tudo (RN03)

Um quadrado só morre quando um de seus lados está **`quebrado` ou `removido`**.
Um lado `bloqueado` conta como **presente** — ele atrapalha o jogador sem ajudar a
eliminar quadrados. É essa assimetria que torna o puzzle interessante.

Tamanhos suportados: **4×4, 5×5, 6×6 e 7×7**, escolhidos antes de carregar a grade.
É possível desfazer **apenas a última jogada**: depois de voltar, o jogador precisa
remover outro palito antes de desfazer de novo.

---

## Equipe

Guilherme Gomes Wolff · Luan Caetano Camargo · Lucas Felicio Jacinto ·
Lucas Leonardo Ratzmann · Thiago Rafael Schulze

---

## Como rodar

O projeto é **HTML, CSS e JavaScript puros, com zero dependências de runtime** —
nenhum bundler, nenhum framework, nenhum CDN. Mas ele usa ES modules e carrega o
dataset por `fetch`, então **não funciona abrindo `index.html` direto do disco**
(`file://` é bloqueado pela política de mesma origem). Sirva a pasta por HTTP:

```bash
npm start          # sobe um servidor estático na raiz do projeto
```

`npm start` chama `npx serve`, que baixa o pacote na primeira execução — se a rede
estiver lenta, qualquer outro servidor estático apontado para a raiz do repositório
serve igual (a extensão *Live Server* do VS Code, `python -m http.server`, etc.).
Depois é só abrir a URL que ele imprimir.

Requisito: Node 20+ (desenvolvido no 22.17).

`node tools/verificar-solver.mjs` valida o solver contra as 80 grades do dataset e
imprime a comparação entre a heurística gulosa e a busca exata:

```bash
node tools/verificar-solver.mjs
```

---

## Estrutura

```
index.html            casca da página + Content-Security-Policy
src/
  main.js             ponto de entrada: chama iniciarAplicacao(document)
  core/               regras do jogo — sem DOM, sem rede
    geometry.js         ids de palito (h|v:linha:coluna), quadrados, bordas
    rules.js            estados do palito e motivos de recusa
    grid.js             montagem da grade e contador de quadrados vivos
    engine.js           motor da partida: remover, desfazer, reiniciar
    metrics.js          excedentes, eficiência, tempo
  dataset/loader.js   carrega e VALIDA os JSONs de grade
  solver/             algoritmo da solução mínima
    bits.js             operações de máscara sobre Uint32Array
    instancia.js        compilação da grade e pré-processamento
    guloso.js           heurística gulosa (fase 1)
    exato.js            branch and bound fatiado (fase 2)
    index.js            contrato: resolver(config, opcoes)
  ui/                 tudo que toca o DOM
    app.js              composição e orquestração
    store.js            estado de interface (vista, solução, config)
    layout.js            geometria de tela (puro, sem DOM)
    board.js            tabuleiro em SVG
    controls.js         seletor de tamanho e barras de ação
    stats.js            painel de estatísticas
    banners.js          banner de modo solução e card de vitória
    performance.js      tela de desempenho
  styles/             tokens.css → base.css → components.css
data/grids/           datasets pré-curados: 4x4, 5x5, 6x6, 7x7
tools/gerar-dataset.mjs   gerador offline dos datasets
docs/                 especificação, protótipos e diagramas
```

### Regra de dependência

O fluxo de importação é **de fora para dentro, nunca o contrário**:

```
ui/  →  dataset/  →  core/
ui/  →  solver/   →  core/
```

`core/` não importa nada de `ui/`, `dataset/` ou `solver/`. `core/`, `dataset/`,
`solver/`, `ui/store.js` e `ui/layout.js` são todos livres de DOM — é por isso que
podem rodar no Node sem navegador nem jsdom.

### Decisões de segurança

- **CSP restritiva** declarada no `index.html`: `default-src 'none'` com
  `script-src`/`style-src` limitados a `'self'`. Nenhum recurso externo, nenhum CDN,
  nenhum `unsafe-inline`.
- **Zero `eval` e zero `innerHTML`** com dado dinâmico — todo texto entra por
  `textContent`.
- **Dataset é entrada não confiável**: `dataset/loader.js` valida a forma do JSON e
  rejeita arquivo malformado ou adulterado com erro claro, em vez de deixar o dado
  ruim vazar para o motor.
- **Estado encapsulado em closure**, nunca em `window`. A UI jamais escreve no estado
  direto: ela só chama ações do motor, e é o motor que valida. Recusar a remoção de
  um palito bloqueado, quebrado ou já removido é regra de motor, não efeito de CSS.
- **Sem coleta de dados, sem telemetria, sem chamada de rede** além do próprio
  dataset local.

---

## Estado atual

Esta entrega é a etapa de **algoritmos** (02/09) do cronograma da disciplina.

- ✅ **Motor de jogo real** — remoção, contagem de quadrados vivos, detecção de
  vitória, desfazer e reinício são implementados de verdade.
- ✅ **Interface completa e jogável**, seguindo os protótipos de alta fidelidade:
  tela de jogo, modo solução, card de vitória e tela de desempenho.
- ✅ **Solver implementado.** `src/solver/` resolve a instância ao vivo, a cada grade:
  heurística gulosa como teto e busca exata com poda como prova. A busca roda em fatias
  de 8 ms, então a interface nunca congela, e o número exibido é promovido de
  "estimativa" para comprovadamente ótimo quando a busca fecha dentro do orçamento
  (100 ms em 4×4, 5×5 e 6×6, 2000 ms em 7×7).
- ✅ **Verificado em navegador** contra os quatro protótipos de alta fidelidade, sem
  nenhum erro de CSP ou de módulo no console. Duas diferenças conscientes em relação
  ao Figma permanecem: os tiles da tela de desempenho não têm os ícones do protótipo,
  e o gráfico não tem rótulos numéricos no eixo x.
- ✅ **Distribuição de dificuldade do dataset calibrada.** O rótulo deixou de olhar o
  número absoluto de palitos e passou a olhar a **razão** entre o mínimo comprovado da
  grade e o mínimo da grade limpa do mesmo tamanho (9, 14, 19 e 26 palitos para 4×4,
  5×5, 6×6 e 7×7). Com isso as três faixas aparecem em todos os tamanhos — antes 6×6 e
  7×7 saíam 20/20 `dificil`. Nenhum arquivo de `src/ui/` lê esse campo: ele é metadado
  de dataset, e o número mínimo mostrado em jogo continua vindo do solver ao vivo.

---

## Regerar o dataset

Os 80 grids (20 por tamanho) são gerados **offline** e versionados. O gerador usa um
PRNG determinístico (Mulberry32), então a mesma seed produz sempre o mesmo dataset.

```bash
node tools/gerar-dataset.mjs                          # padrão: 20 grades por tamanho
node tools/gerar-dataset.mjs --quantidade 30 --seed 12345
```

A construção garante **por construção** que toda grade é solucionável e que nenhum
palito bloqueado é indispensável: os quebrados são sorteados primeiro, um conjunto de
corte é montado a partir dos quadrados ainda vivos e podado de redundâncias, e só
então os bloqueados são distribuídos — sempre **fora** do conjunto de corte.
Esse conjunto de corte não é gravado no JSON: ele existe apenas durante a geração, para
garantir que nenhum palito bloqueado seja indispensável. O número mínimo de cada grade é
calculado ao vivo pelo solver, a cada partida.

### Rótulo de dificuldade

Depois que a grade passa pela deduplicação, o gerador chama o **solver de verdade** com
orçamento de 60 s e exige `proven: true` — se a busca não fechar, a geração falha em vez
de gravar um rótulo que dependeria da velocidade da máquina. O mínimo obtido é dividido
pelo mínimo da grade limpa do mesmo tamanho:

| razão `mínimo / referência` | rótulo |
| --- | --- |
| ≤ 0,58 | `facil` |
| ≤ 0,75 | `medio` |
| > 0,75 | `dificil` |

A referência sai do próprio solver (9 palitos na 4×4 limpa, 14 na 5×5, 19 na 6×6 e 26 na
7×7), então nenhum número mágico fica escrito à mão. Distribuição atual das 80 grades:

| tamanho | fácil | médio | difícil |
| --- | --- | --- | --- |
| 4×4 | 5 | 6 | 9 |
| 5×5 | 5 | 9 | 6 |
| 6×6 | 3 | 13 | 4 |
| 7×7 | 6 | 9 | 5 |

`node tools/verificar-solver.mjs` recalcula o rótulo de cada uma das 80 grades a partir
do mínimo provado e falha se o JSON estiver fora de sincronia com o classificador.

---

## Documentação

- [`docs/Broken Grid - Especificação e Requisitos.pdf`](docs/) — especificação
  completa: requisitos funcionais (RF01–RF13), não funcionais (RNF01–RNF05), casos de
  uso (UC01–UC10) e regras de negócio.
- [`docs/prototipos/`](docs/prototipos) — protótipos de média e alta fidelidade das
  quatro telas.
- [`docs/algoritmo-do-solver.md`](docs/algoritmo-do-solver.md) — guia de estudo do
  algoritmo: modelagem como cobertura mínima, o que cada arquivo de `src/solver/` faz,
  linha a linha das partes difíceis, complexidade e roteiro de apresentação.
- [`docs/diagramas/`](docs/diagramas) — diagrama de casos de uso e diagramas de
  atividades.
