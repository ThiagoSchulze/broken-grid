# Broken Grid — Design da Interface Gráfica

**Data:** 2026-08-19
**Etapa do cronograma:** Interface gráfica (entrega de 25/08)
**Status:** aguardando revisão

## 1. Contexto

O Broken Grid é um puzzle de lógica para navegador, variação do Killing Squares, especificado em
`docs/Broken Grid - Especificação e Requisitos.pdf`. O jogador remove palitos de uma grade N×N
até que nenhum quadrado completo reste, usando o menor número de remoções possível. A grade
já nasce com dois tipos de obstáculo: palitos **quebrados** (ausentes desde o início) e
**bloqueados** (presentes, porém irremovíveis).

Este documento especifica **apenas a etapa de interface gráfica**. O repositório está vazio de
código: esta é a primeira estrutura do projeto.

## 2. Escopo

### Dentro do escopo

- Estrutura de pastas e fronteiras de módulo exigidas pelo RNF03.
- Motor de jogo **funcional**: detecção de quadrados vivos, remoção validada, desfazer,
  reinício, condição de vitória e contadores.
- As quatro telas do protótipo, fiéis ao Figma: Jogo, Solução, Jogo Finalizado, Desempenho.
- Dataset de grades pré-curadas em JSON, com id único, e o utilitário offline que as gera.
- Contrato público do módulo solver, com implementação provisória.
- Testes automatizados do núcleo.

### Fora do escopo (etapas seguintes)

- **Solver real** (heurística gulosa + busca exata com poda) — etapa de 01/09 e 08/09.
- Histórico de partidas e gráficos de evolução entre tentativas (seção 6.8 da especificação).
- Geração de grades em tempo de execução — contraria a seção 13 da especificação.
- Internacionalização, contas de usuário, qualquer backend.

## 3. Decisões

| # | Decisão | Motivo |
|---|---------|--------|
| D1 | Motor de jogo real; apenas o solver fica mockado | Sem recalcular quadrados vivos não há jogo. Detectar quadrados é regra do jogo, não algoritmo de resolução. |
| D2 | HTML/CSS/JS com ES modules nativos, sem framework nem bundler | RNF01/RNF04; repositório que qualquer integrante ou avaliador roda sem instalar nada. |
| D3 | Testes com o runner nativo `node --test` | O núcleo é JS puro sem DOM; zero dependências no repositório. |
| D4 | Estado central único + renderizadores inscritos | Uma fonte de verdade; desfazer e vitória se propagam de um lugar só. |
| D5 | Tabuleiro em SVG | Cada palito é um elemento com id: clique, foco, `:hover` e o tracejado do quebrado saem do CSS. |
| D6 | Grades geradas por utilitário offline em `tools/`, commitadas em `data/` | Seção 13: "Nova grade" só escolhe um id do dataset. Curadoria reproduzível. |
| D7 | O dataset guarda uma **solução de referência provisória** | O protótipo exige destacar palitos e exibir um número de comparação, e o solver não existe ainda. Campo marcado como não-ótimo; sai quando o solver real entrar. |
| D8 | Tela Desempenho cobre só a partida atual | A seção 6.8 diz que os resultados "poderão ser utilizados" para histórico — possibilidade, não requisito desta etapa. |

**Sobre D7 — divergência consciente da especificação.** A seção 13 afirma que o dataset "não
guarda o valor ótimo". Nesta entrega ele guarda um conjunto de corte de referência, porque as
telas Solução e Desempenho não são demonstráveis sem isso. O campo é explicitamente marcado
como `proven: false`, a interface o rotula como estimativa, e ele é removido do schema quando o
solver real assumir. A especificação volta a valer integralmente na etapa de algoritmos.

## 4. Arquitetura

### 4.1 Estrutura de pastas

```
ProjetoIntegradorI/
├─ index.html
├─ src/
│  ├─ core/                 # JS puro, zero DOM
│  │   ├─ geometry.js       # enumera palitos e quadrados de uma grade N×N
│  │   ├─ grid.js           # monta o tabuleiro a partir da config + índice palito→quadrados
│  │   ├─ rules.js          # RN01–RN13
│  │   └─ engine.js         # estado, ações, desfazer, vitória, contadores
│  ├─ solver/
│  │   ├─ index.js          # contrato público
│  │   └─ referencia.js     # implementação provisória desta entrega
│  ├─ dataset/
│  │   └─ loader.js         # fetch + validação de schema
│  ├─ ui/
│  │   ├─ store.js          # observador
│  │   ├─ board.js          # tabuleiro SVG
│  │   ├─ controls.js       # seletor N, Novo Grid, Solucionar, Voltar Última Jogada
│  │   ├─ stats.js          # palitos removidos / quadrados restantes
│  │   ├─ banners.js        # banner do modo Solução e card Grade Eliminada
│  │   ├─ performance.js    # tiles e gráfico comparativo
│  │   └─ app.js            # composição
│  ├─ styles/
│  │   ├─ tokens.css
│  │   ├─ base.css
│  │   └─ components.css
│  └─ main.js
├─ data/grids/              # 4x4.json, 5x5.json, 6x6.json, 7x7.json
├─ tools/gerar-dataset.mjs
├─ tests/core/
└─ docs/
   ├─ Broken Grid - Especificação e Requisitos.pdf
   ├─ prototipos/           # PNGs extraídos do PDF (média e alta fidelidade)
   ├─ diagramas/
   └─ superpowers/specs/
```

### 4.2 Regra de dependência

```
ui      ──▶ core, solver, dataset
core    ──▶ (nada)
solver  ──▶ core (somente geometria)
dataset ──▶ (nada)
```

`core/` não importa DOM, solver nem dataset. `solver/` recebe uma configuração de grade e devolve
um resultado, sem tocar no estado da partida. `ui/` é a única camada que conhece as outras.

Consequência prática, que é o objetivo do RNF03: substituir `solver/referencia.js` por uma busca
exata em setembro não exige abrir nenhum arquivo de `ui/` nem de `core/`.

## 5. Modelo de dados

### 5.1 Palitos

Grade N×N tem (N+1)² pontos e **2·N·(N+1)** palitos.

Identificador textual, estável e legível:

- Horizontal: `h:<linha>:<coluna>` com linha ∈ [0, N], coluna ∈ [0, N-1]
- Vertical: `v:<linha>:<coluna>` com linha ∈ [0, N-1], coluna ∈ [0, N]

Estados (RN01, RN02): `removivel`, `bloqueado`, `quebrado`, `removido`.

### 5.2 Quadrados

Enumerados pela geometria, independentemente do estado dos palitos: para cada tamanho k de 1 a N
e cada posição (r, c) em que k cabe. Total de quadrados = Σ (N−k+1)² para k de 1 a N
(4×4 → 30 quadrados; 7×7 → 140).

Cada quadrado guarda tamanho, canto e a lista dos 4k palitos da borda.

### 5.3 Vivo, morto e o índice reverso

Um quadrado está **vivo** enquanto todos os palitos da borda estiverem presentes — `removivel` e
`bloqueado` contam como presentes; só `quebrado` e `removido` matam o quadrado (RN03).

Em vez de varrer o tabuleiro a cada jogada, cada quadrado mantém um contador `ausentes` e a grade
mantém um índice `palito → quadrados afetados`, construído uma única vez:

- remover palito: para cada quadrado do índice, `ausentes++`; na transição 0→1, `quadradosVivos--`
- desfazer: `ausentes--`; na transição 1→0, `quadradosVivos++`

Custo por jogada proporcional ao número de quadrados que tocam aquele palito, não ao tabuleiro
inteiro — é o "controle de estado eficiente" da seção 13 da especificação.

### 5.4 Estado da partida

```js
{
  n, gridId,
  palitos: { [id]: 'removivel' | 'bloqueado' | 'quebrado' | 'removido' },
  quadradosVivos, palitosRemovidos,
  historico: [id, ...],          // pilha para desfazer
  status: 'jogando' | 'vencido',
  iniciadoEm, finalizadoEm       // timestamps; a UI só formata
}
```

## 6. Dataset

### 6.1 Schema (`data/grids/<n>x<n>.json`)

```json
{
  "schemaVersion": 1,
  "n": 4,
  "geradoEm": "2026-08-19",
  "seed": 12345,
  "grids": [
    {
      "id": "g4-001",
      "quebrados": ["h:0:2", "v:1:3"],
      "bloqueados": ["h:2:1", "v:3:0"],
      "dificuldade": "medio",
      "referencia": { "palitos": ["h:1:1", "v:2:2"], "quantidade": 2, "proven": false }
    }
  ]
}
```

Cada grade tem id único (RNF05), permitindo carregar uma instância específica e reproduzir a mesma
partida em testes.

### 6.2 Validação no carregamento

O loader valida **forma**, não solucionabilidade — RN04 e RN05 são responsabilidade da curadoria,
conforme o RF11. Rejeita com mensagem clara quando: `schemaVersion` não suportado; `n` fora de
{4,5,6,7}; id ausente ou duplicado; palito com formato ou coordenada inválida; interseção entre
`quebrados` e `bloqueados`; `referencia.palitos` contendo palito quebrado ou bloqueado;
`quantidade` diferente do tamanho da lista.

Um JSON malformado ou adulterado produz erro visível na interface — nunca um tabuleiro pela metade.

### 6.3 Gerador offline (`tools/gerar-dataset.mjs`)

Constrói cada grade de modo que os invariantes valham **por construção**, sem precisar de solver:

1. Sorteia o conjunto de palitos **quebrados** (proporção conforme a dificuldade alvo).
2. Constrói um conjunto de corte C: enquanto houver quadrado vivo, escolhe um quadrado vivo e um
   de seus lados ainda presentes, e adiciona a C. Ao terminar, C elimina todos os quadrados.
3. **Poda de redundância:** remove de C todo palito cuja retirada mantenha C eliminando tudo. O
   resultado é um conjunto *minimal* (irredutível), próximo do mínimo sem ser comprovadamente ótimo.
4. Sorteia os **bloqueados** apenas entre palitos que não estão em C e não são quebrados.
   Como C ⊆ removíveis, RN04 e RN05 ficam satisfeitos automaticamente.
5. Descarta grades triviais (poucos quadrados vivos iniciais) e duplicadas.
6. Emite o JSON com C como `referencia`, `proven: false`, e registra a seed usada.

**Volume alvo:** 20 grades por tamanho, distribuídas entre as três dificuldades.

**Consequência a assumir:** como C é minimal e não mínimo, um jogador pode terminar com menos
palitos que a referência, o que faria a eficiência passar de 100%. A interface não trunca esse
valor; ela rotula o número como estimativa. O caso desaparece quando o solver real entrar.

## 7. Contrato do solver

```js
// src/solver/index.js
/**
 * @param {GridConfig} config  configuração inicial da grade (RN07: nunca o progresso do jogador)
 * @returns {Promise<SolverResult>}
 */
export async function resolver(config, opcoes = {}) { /* ... */ }

// SolverResult
// {
//   palitos: string[],      ids que compõem a solução
//   quantidade: number,
//   proven: boolean,        true só quando comprovadamente ótima
//   origem: 'dataset' | 'guloso' | 'exato',
//   tempoMs: number
// }
```

Implementação desta entrega (`referencia.js`): devolve o campo `referencia` do dataset com
`proven: false` e `origem: 'dataset'`. A interface já trata `proven` hoje — é o mesmo campo que,
na etapa de algoritmos, sinalizará "orçamento de tempo estourado, solução não comprovadamente ótima".

## 8. Motor (`core/engine.js`)

```js
criarPartida(config) // -> { obterEstado, removerPalito, desfazer, reiniciar, inscrever }
```

- `obterEstado()` — snapshot congelado (`Object.freeze`)
- `removerPalito(id)` — `{ ok: true }` ou `{ ok: false, motivo }`
- `desfazer()` — `{ ok }`
- `reiniciar(config)`
- `inscrever(fn)` — devolve função de cancelamento

Motivos de recusa: `bloqueado`, `quebrado`, `ja-removido`, `inexistente`, `partida-encerrada`.

Comportamentos:

- **Remover** (RN11): valida, marca `removido`, atualiza quadrados do índice, incrementa contador,
  empilha no histórico; se `quadradosVivos === 0`, muda status para `vencido` e grava `finalizadoEm`.
- **Desfazer** (RN09, RN10): desempilha, restaura o palito, reativa quadrados que voltam a ficar
  completos, decrementa o contador. Aplicável sucessivamente até o estado inicial. Se a partida
  estava vencida, volta para `jogando`.
- **Reiniciar** (RN08): descarta grade e progresso e monta a partida com outra config.
- **Tempo** (6.6): `iniciadoEm` no carregamento da grade, `finalizadoEm` na vitória. O motor guarda
  os instantes; a UI faz o tique de exibição.

## 9. Interface

### 9.1 Telas como estados da mesma página

O protótipo mostra o mesmo cabeçalho, os mesmos controles e o mesmo tabuleiro nas quatro telas —
elas são estados, não páginas. Duas variáveis ortogonais:

- `status` do motor: `jogando` | `vencido`
- `vista` da interface: `jogo` | `solucao` | `desempenho`

| Combinação | O que aparece |
|---|---|
| jogo + jogando | controles, stats, tabuleiro interativo, "Voltar Última Jogada" |
| jogo + vencido | acrescenta o card verde "Grade Eliminada" com "Jogar Novamente" e "Desempenho" |
| solucao | banner rosa com a contagem de referência, tabuleiro **não interativo** com os palitos da solução destacados, botão dourado "Voltar ao Jogo" |
| desempenho | quatro tiles (tempo, palitos removidos, solução de referência, eficiência), gráfico "Seu Resultado × Solução Real" e o card verde |

O modo Solução desenha sobre a **grade original** (RN07), não sobre o progresso do jogador — é
apenas visualização e não altera o estado da partida.

### 9.2 Tabuleiro SVG

`viewBox` derivado de N, com margem fixa. Cada palito é um `<g data-id="h:0:2">` contendo a linha
visível e uma linha transparente de ~16px de espessura como área de clique. Um único ouvinte
delegado no `<svg>` resolve `data-id` a partir do alvo.

Classes por estado: `.palito--removivel`, `.palito--bloqueado`, `.palito--quebrado`,
`.palito--removido`, `.palito--solucao`. Quebrado é tracejado claro; removido não é desenhado.

Legenda fixa abaixo do tabuleiro: Removível · Bloqueado · Quebrado.

### 9.3 Paleta (`styles/tokens.css`)

Amostrada dos protótipos de alta fidelidade:

| Token | Hex | Uso |
|---|---|---|
| `--fundo` | `#edebe3` | fundo da página |
| `--superficie` | `#ffffff` | cards |
| `--tinta` | `#1b1f22` | texto |
| `--acento-ouro` | `#c4a841` | Solucionar, barra do jogador no gráfico |
| `--acento-rosa` | `#ffafaf` | Voltar Última Jogada, banner do modo Solução |
| `--solucao` | `#b23a48` | palitos destacados no modo Solução |
| `--vitoria-fundo` | `#dceae4` | card Grade Eliminada |
| `--vitoria-tinta` | `#2f6f5e` | texto e botões do card de vitória |
| `--palito` | `#000000` | palito removível |
| `--palito-bloqueado` | `#9c9284` | palito bloqueado |
| `--palito-quebrado` | `#d5d3cd` | palito quebrado (tracejado) |
| `--preto-botao` | `#111111` | botão Novo Grid |

Tipografia: serifada para títulos e sem serifa para o resto, usando **pilhas de fontes locais** —
nenhum recurso externo é carregado (ver seção 11). O Figma continua sendo a referência final de
espaçamento.

### 9.4 Acessibilidade

Palitos removíveis são focáveis por teclado e acionáveis por Enter/Espaço, com rótulo descrevendo
orientação, posição e estado. Contadores e a mensagem de vitória ficam em região `aria-live`, para
que a mudança seja anunciada. Palitos bloqueados e quebrados não recebem foco.

## 10. Rastreabilidade

| Requisito | Onde é atendido |
|---|---|
| RF01, RF09 | `ui/controls.js` + `dataset/loader.js` |
| RF02, RF11 | `dataset/loader.js` + `tools/gerar-dataset.mjs` |
| RF03, RF05 | `ui/board.js` + `core/rules.js` (a recusa é do motor, não do CSS) |
| RF04, RF06 | `core/engine.js` (índice reverso e contador de vivos) |
| RF07 | `ui/stats.js` |
| RF08, RF12 | `solver/index.js` (contrato) + `ui/banners.js` — provisório nesta etapa |
| RF10 | `index.html` sem dependências externas |
| RF13 | `core/engine.js` (desfazer) + `ui/controls.js` |
| RNF01, RNF04 | ES modules nativos, sem build |
| RNF02 | atualização proporcional aos quadrados afetados, não ao tabuleiro |
| RNF03 | regra de dependência da seção 4.2 |
| RNF05 | id único por grade no schema |
| RN01–RN13 | `core/rules.js` e `core/engine.js`, com teste dedicado por regra |

## 11. Segurança

**Higiene de front-end**

- CSP restritiva via `<meta http-equiv="Content-Security-Policy">`:
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'`
- Nenhum recurso externo: sem CDN, sem fontes remotas, sem analytics. Atende também o RNF01.
- Nada de `eval`, `new Function` ou `innerHTML` com dado dinâmico. O DOM é construído por
  `createElement`/`createElementNS` e preenchido por `textContent`.
- O JSON do dataset passa por `JSON.parse` em try/catch e pela validação da seção 6.2 antes de
  virar tabuleiro.

**Integridade do estado**

- O estado vive em closure dentro do motor; `obterEstado()` devolve snapshot congelado. Não há
  `window.engine`.
- A interface nunca escreve no estado: só chama ações que o motor valida. Recusar a remoção de um
  palito bloqueado é regra do motor — o CSS apenas comunica visualmente o que o motor já garante.
- Consequência: a métrica de desempenho não é falseável por engano da interface nem por manipulação
  casual pelo console.

**Privacidade**

- Nenhuma coleta de dado pessoal, nenhuma telemetria, nenhuma chamada de rede além dos arquivos
  estáticos da própria origem.
- Esta entrega não usa `localStorage`. Se o histórico da seção 6.8 entrar depois, o conteúdo lido
  de volta deve ser tratado como não-confiável e passar por validação de schema.

## 12. Testes (`node --test`)

- **geometria**: contagem de palitos e quadrados para N de 4 a 7; bordas de um quadrado k×k.
- **regras**: quadrado com lado quebrado nasce morto; bloqueado conta como presente; remoção de
  bloqueado, quebrado ou já removido é recusada com o motivo correto.
- **motor**: contador sobe e desce corretamente; `quadradosVivos` acompanha as transições; desfazer
  em sequência restaura exatamente o estado inicial; vitória dispara quando zera e é revertida pelo
  desfazer.
- **loader**: cada regra de validação da seção 6.2 rejeita com mensagem clara.
- **gerador**: toda grade emitida satisfaz RN04 e RN05, e sua `referencia` de fato elimina todos os
  quadrados vivos.

Sem testes de DOM nesta etapa: a interface é validada manualmente contra os protótipos em
`docs/prototipos/`.

## 13. Como rodar

ES modules não carregam por `file://`. Desenvolvimento com qualquer servidor estático, por exemplo
`npx serve .`; testes com `node --test tests/`.

## 14. Questões em aberto

1. Fonte tipográfica exata usada no Figma (a paleta foi amostrada dos protótipos; a tipografia não
   pôde ser extraída do PDF).
2. Confirmar 20 grades por tamanho como volume adequado do dataset.
3. Os números do mockup da tela Desempenho são inconsistentes entre si (12 removidos, ótimo 10,
   eficiência 0%). A implementação segue a fórmula da seção 6.5 da especificação —
   `(mínimo / removidos) × 100` — e ignora os valores literais do desenho.
