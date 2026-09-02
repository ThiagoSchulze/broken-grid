# Broken Grid — Solver da solução mínima (etapa de Algoritmos)

**Data:** 2026-09-02
**Etapa do cronograma:** Algoritmos (01/09 e 08/09)
**Etapa anterior:** [Interface gráfica](2026-08-19-broken-grid-interface-design.md) (25/08)

## 1. Objetivo

Substituir o mock de `src/solver/` por uma resolução real da instância: **fase gulosa
seguida de busca exata com poda**, conforme a seção 13 da especificação. Ao final desta
etapa nenhum número exibido pelo jogo vem gravado no dataset — todos são calculados ao
vivo, sobre a grade original, a cada partida.

O que sai do mock:

| Hoje | Depois |
| --- | --- |
| `solver/referencia.js` devolve o campo `referencia` do JSON | Guloso + busca exata resolvem a instância |
| `data/grids/*.json` guardam um conjunto de corte pré-calculado | Guardam só `n`, `quebrados` e `bloqueados` |
| `app.js:172` (`estimativaDaConfig`) lê o número do dataset | Deixa de existir |
| `proven` é sempre `false` | `true` quando a busca fecha dentro do orçamento |
| `origem: 'dataset'` | `origem: 'guloso'` ou `'exato'` |

Fora de escopo: recalibrar o campo `dificuldade` do dataset (pendência já registrada no
README), alterar as telas aprovadas contra os protótipos de alta fidelidade, e a avaliação
experimental em si (22/09) — esta etapa apenas produz os dados que ela consome.

## 2. Decisões desta etapa

| # | Decisão | Por quê |
| --- | --- | --- |
| D1 | Guloso e exato rodam **em sequência**, e o guloso alimenta o teto da poda | Leitura literal da seção 13. O guloso custa milissegundos; rodá-lo em paralelo desperdiçaria justamente o teto que faz o branch and bound podar. |
| D2 | O par roda **ao carregar a grade**, em duas etapas: guloso síncrono, exato fatiado | Atende "roda ao vivo, a cada partida" sem violar o RNF02 — a interface nunca congela e o número já aparece no primeiro instante. |
| D3 | O campo `referencia` **sai** do dataset, do loader e do gerador | A especificação diz que o dataset não guarda valor de solução. Era dívida assumida na etapa anterior (decisão D7 daquele design). |
| D4 | A busca exata inclui **forçados, dominância e cota inferior por empacotamento** | O branch and bound do PDF, sozinho, poda por "não consigo empatar" — fraco demais para 6×6 e 7×7. São refinamentos da mesma formulação, não outro algoritmo. |
| D5 | O resultado carrega um bloco `diagnostico` com os números dos dois algoritmos | A etapa de 22/09 precisa comparar guloso × exato. Os campos atuais do contrato não mudam, então a interface não é afetada. |
| D6 | Sem Web Worker | O fatiamento cooperativo já resolve o RNF02, e um worker traria mensageria e uma cópia do núcleo por um ganho que não se justifica nesta escala. |
| D7 | Sem reintroduzir `tests/`; a verificação vira um script em `tools/` | A suíte foi removida deliberadamente em `3978fe2` (25/08). Ver seção 14. |

## 3. Formulação

Cobertura mínima (*minimum hitting set*):

- **Universo a cobrir:** os quadrados **vivos na configuração inicial** — todos os quatro
  lados presentes, de qualquer tamanho de 1×1 a N×N. Quadrado que depende de palito
  quebrado já nasce morto e não entra.
- **Conjunto de cada quadrado:** apenas seus lados **removíveis**. Lado bloqueado conta
  como presente (mantém o quadrado vivo) mas não pode ser escolhido.
- **Objetivo:** o menor conjunto de palitos que intersecte todos esses conjuntos.

Essa assimetria — bloqueado mantém o quadrado vivo mas não serve de solução — é o que
diferencia o Broken Grid do Killing Squares original e o que reduz o espaço de busca de
forma irregular, tornando algumas instâncias bem mais difíceis do que o tamanho `n` sugere.

Escala máxima por tamanho:

| N | palitos totais | quadrados possíveis | removíveis (típico) |
| --- | --- | --- | --- |
| 4 | 40 | 30 | ~25 |
| 5 | 60 | 55 | ~40 |
| 6 | 84 | 91 | ~55 |
| 7 | 112 | 140 | ~80 |

## 4. Instância compilada (`solver/instancia.js`)

O solver não toca o estado do jogo. Ele compila a `config` inicial numa instância própria —
é assim que a RN07 ("nunca sobre o progresso do jogador") vale por construção, sem cópia de
estado mutável.

A compilação chama `montarGrade()` de `core/grid.js`: os quadrados com `ausentes === 0` são
exatamente os vivos na configuração inicial. O solver continua importando só de `core/`,
respeitando a regra de dependência do RNF03.

Saem três estruturas, todas alocadas uma única vez:

**Índices densos.** Só os palitos `REMOVIVEL` recebem índice `0..m-1`. Um `Map<string,
number>` e o vetor inverso fazem a tradução na entrada e na saída. No 7×7 isso já reduz 112
palitos para cerca de 80.

**`palitosDoQuadrado`** — `Uint32Array(q * palavrasM)`, a máscara dos lados removíveis de
cada quadrado. Com `m ≤ 112`, são no máximo 4 palavras de 32 bits.

**`quadradosDoPalito`** — `Uint32Array(m * palavrasQ)`, a máscara dos quadrados que cada
palito cobre. É o índice reverso da seção 14 do PDF, na forma que o guloso consome: o ganho
de um palito é `popcount(quadradosDoPalito[p] & descobertos)`, sem varrer nada.

As duas representações são duais e valem a memória: no 7×7 somam menos de 4 KB, e em troca
toda a busca roda em operações de palavra, sem `Set` e sem alocação dentro do laço.

## 5. Pré-processamento

Roda uma vez sobre a instância compilada, até estabilizar. Encolhe o problema antes de
qualquer busca.

**Insolubilidade.** Quadrado vivo com máscara vazia (quatro lados presentes, todos
bloqueados) torna a instância impossível → `ErroSolver`. A curadoria garante que não ocorre
(RN04/RN05), mas o solver não confia no dataset — o `loader.js` já trata JSON como entrada
não confiável e essa postura se mantém.

**Forçados.** Quadrado com exatamente um lado removível: aquele palito pertence a **toda**
solução. Entra na resposta obrigatória, cobre tudo o que cobre, e o passo repete — eliminar
quadrados cria novos forçados. Em grades com muitos bloqueados, que são as piores para a
busca, essa regra sozinha costuma fixar boa parte da solução.

**Dominância.** Se a máscara do quadrado A contém a de B, cobrir B cobre A — A sai da
instância. Custo `O(q² × palavras)`: no 7×7, cerca de 78 mil operações de inteiro. O ganho
é grande porque quadrados grandes quase sempre dominam algum quadrado menor contido neles.

Guloso e exato consomem a **mesma** instância reduzida, então os números dos dois são
comparáveis diretamente no bloco de diagnóstico.

## 6. Fase 1 — guloso (`solver/guloso.js`)

```
solucao ← obrigatórios do pré-processamento
enquanto existir quadrado descoberto:
    escolhe o palito com maior popcount(quadradosDoPalito[p] & descobertos)
    empate → menor índice          (determinismo: RNF05)
    solucao ← solucao + p ; descobertos ← descobertos & ~quadradosDoPalito[p]
poda de redundância:
    para cada p de solucao, em ordem inversa de inserção:
        se solucao \ {p} ainda cobre tudo → remove p
```

A poda final torna o conjunto **minimal** (irredutível) — a mesma técnica que
`tools/gerar-dataset.mjs` já usa para o conjunto de corte. Minimal não é mínimo, mas é um
teto honesto e barato.

Custo `O(k × m × palavras)`: microssegundos em qualquer um dos quatro tamanhos. É por isso
que ele pode rodar de forma síncrona no carregamento da grade sem que ninguém perceba.

## 7. Cota inferior por empacotamento

Uma cota inferior admissível, recalculada em cada nó da busca sobre os quadrados ainda
descobertos:

```
usados ← máscara vazia ; cota ← 0
para cada quadrado descoberto, em ordem crescente de |máscara|:
    se (máscara & usados) == 0:  cota ← cota + 1 ; usados ← usados | máscara
```

Quadrados que não compartilham nenhum palito removível exigem, cada um, um palito só seu —
logo `cota` nunca superestima. Custo `O(q × palavras)` por nó, desprezível perto do que ela
economiza: é ela que transforma a poda de "este ramo não consegue empatar" em "este ramo
não chega nem perto", que é o que faz branch and bound funcionar de verdade.

## 8. Fase 2 — busca exata (`solver/exato.js`)

Branch and bound sobre a instância reduzida, com o guloso como `melhor` inicial.

**Ramificação** (seção 13 do PDF): escolhe o quadrado descoberto com **menos lados
removíveis** e testa cada um deles. O fator de ramificação fica limitado ao menor conjunto
da instância — 4 no pior caso, frequentemente 2 ou 3 depois dos bloqueados.

**Ordem dos candidatos:** decrescente por quantos quadrados descobertos o palito cobre.
Achar cedo uma solução boa aperta o teto e poda o resto da árvore.

**Poda:** `|solução parcial| + cotaInferior(descobertos) ≥ melhor` → descarta o ramo.

**Propagação em cada nó:** depois de escolher um palito, reaplica os forçados. Os palitos
fixados assim entram na contagem do nó, não como novo nível da árvore.

**Pilha explícita, não recursão.** Cada quadro guarda a máscara de descobertos, a lista de
candidatos, o índice do próximo e os palitos já fixados naquele nó. Desfazer é restaurar a
máscara do quadro. Isso evita estouro de pilha e — mais importante — permite **parar a
busca no meio e retomá-la depois**, que é o que o fatiamento exige.

**Prova de otimalidade:** se a pilha esvazia sem estourar o orçamento, `melhor` é
comprovadamente mínimo (`proven: true`). Inclui o caso em que a busca não melhora o guloso:
aí o guloso já era ótimo e é promovido a `proven: true`.

## 9. Orçamento, fatiamento e cancelamento

O orquestrador (`solver/index.js`) roda a busca em fatias:

```
executarFatia()  →  síncrono, até 8 ms ou até a pilha esvaziar
                    (relógio conferido a cada 1024 nós)
entre fatias     →  await ceder()   // scheduler.yield() ?? setTimeout(0)
                    confere sinal.aborted e o orçamento total
```

Nenhuma fatia bloqueia o quadro de animação, e o número do guloso já está na tela desde o
primeiro instante — o RNF02 vale durante toda a busca.

Orçamento total por tamanho (ponto de partida, a ser afinado com o benchmark da seção 14):

| N | orçamento | expectativa |
| --- | --- | --- |
| 4×4, 5×5 | 200 ms | prova o ótimo praticamente sempre |
| 6×6 | 1 s | prova na maioria das grades |
| 7×7 | 2 s | prova em parte; senão devolve o melhor achado |

Estourado o orçamento, vale o melhor conhecido com `proven: false` e
`diagnostico.exato.concluiu: false` — a interface já diz "estimativa … ainda não
comprovadamente ótima" (`ui/banners.js:40`), sem mudança nenhuma.

**Cancelamento:** o `AbortSignal` é conferido entre fatias. Trocar de grade aborta a busca
anterior; a Promise rejeita com um `ErroSolver` marcado `cancelado: true`, que o `app.js`
silencia.

## 10. Contrato público

```js
// src/solver/index.js
resolver(config, { orcamentoMs, sinal, aoMelhorar } = {}) -> Promise<SolverResult>

// SolverResult
// {
//   palitos: string[],
//   quantidade: number,
//   proven: boolean,                    true só quando a busca fechou
//   origem: 'guloso' | 'exato',
//   tempoMs: number,
//   diagnostico: {
//     guloso: { quantidade, tempoMs },
//     exato:  { quantidade, tempoMs, nos, concluiu },
//     cotaInferior: number,             cota da instância reduzida, na raiz
//     obrigatorios: number,             palitos fixados pelo pré-processamento
//     palitosRemoviveis: number,
//     quadradosVivos: number,           antes da redução
//     quadradosAposReducao: number
//   }
// }
```

Os cinco campos do topo são **exatamente** os do contrato de 19/08, com `'dataset'` saindo
do union de `origem`. `origem` diz quem produziu o conjunto devolvido: `'guloso'` quando a
busca não melhorou nada, `'exato'` quando melhorou — combinado com `proven`, isso distingue
os três desfechos possíveis (guloso provado ótimo, exato provado ótimo, melhor esforço com
orçamento estourado). `aoMelhorar(parcial)` recebe o mesmo formato com `proven: false`: uma
vez quando o guloso termina e novamente a cada melhora da busca. Quem não passa
`aoMelhorar` recebe só a Promise, como hoje — é o caso do script de benchmark.

## 11. Integração na interface

Mudanças em `src/ui/app.js`, todas dentro de `novaGrade()` e das duas chamadas atuais:

1. `novaGrade()` aborta a busca anterior, cria um `AbortController` e dispara
   `resolver(config, { sinal, aoMelhorar })`.
2. `aoMelhorar` e a resolução da Promise só escrevem no store se
   `store.obter().config?.id` ainda for o da grade que originou a busca.
3. `mostrarSolucao()` e `aoVerDesempenho` passam a **ler** `store.obter().solucao`, já
   preenchida, em vez de chamar `resolver()` por conta própria.
4. `estimativaDaConfig()` é removida.

`board.js`, `stats.js`, `banners.js` e `performance.js` não mudam: já consomem
`solucao.quantidade` e `solucao.proven`. O número exibido pode cair de "estimativa 16" para
"ótimo 14" enquanto o jogador olha a tela — comportamento desejado e já coberto pelo texto
que a interface usa.

## 12. Dataset, loader e gerador

- `dataset/loader.js`: a validação de `referencia` sai; `configDaGrade()` para de propagar
  o campo.
- `tools/gerar-dataset.mjs`: continua construindo o conjunto de corte internamente — é ele
  que garante RN04/RN05 posicionando os bloqueados fora do corte — mas deixa de gravá-lo.
- `data/grids/*.json`: regerados com a **mesma seed**. Como a lógica de sorteio não muda, o
  diff remove apenas o campo `referencia`; `quebrados` e `bloqueados` ficam idênticos, e os
  ids das grades continuam válidos (RNF05).

## 13. Erros e casos-limite

| Situação | Comportamento |
| --- | --- |
| Nenhum quadrado vivo na grade inicial | `{ palitos: [], quantidade: 0, proven: true, origem: 'exato' }` |
| Quadrado vivo sem lado removível | `ErroSolver` — instância impossível, dataset adulterado |
| Orçamento estourado | Melhor conhecido, `proven: false`, `concluiu: false` |
| Busca abortada (troca de grade) | Rejeita com `ErroSolver` marcado `cancelado`; o `app.js` silencia |
| `config` com `n` não suportado | `ErroGrade`, propagado de `montarGrade()` |

## 14. Verificação

A suíte de testes foi removida deliberadamente em `3978fe2` (25/08), junto com `npm test`.
Em vez de reintroduzir `tests/`, a verificação entra como **script executável em
`tools/verificar-solver.mjs`**, que serve ao mesmo tempo de validação e de benchmark da
etapa de 22/09.

Para cada uma das 80 grades do dataset, sem orçamento:

1. **Cobertura** — a solução elimina todos os quadrados vivos.
2. **Legalidade** — nenhum palito da solução é quebrado ou bloqueado.
3. **Minimalidade** — remover qualquer palito da solução quebra a cobertura.
4. **Otimalidade cruzada (só 4×4)** — força bruta sobre todos os subconjuntos de tamanho
   menor que o resultado confirma que não existe solução menor. Um oráculo independente,
   viável nesse tamanho (`C(25,6)` está na casa das centenas de milhares).
5. **Determinismo** — duas execuções da mesma grade devolvem o mesmo conjunto.

E imprime a tabela do relatório: por grade, mínimo do guloso, mínimo do exato, cota
inferior, nós visitados, tempo de cada fase e se fechou. É dela que sairão os orçamentos
definitivos da seção 9.

## 15. Arquivos

| Arquivo | Ação |
| --- | --- |
| `src/solver/bits.js` | novo — operações de máscara sobre `Uint32Array` |
| `src/solver/instancia.js` | novo — compilação e pré-processamento |
| `src/solver/guloso.js` | novo — fase 1 |
| `src/solver/exato.js` | novo — cota inferior e branch and bound fatiado |
| `src/solver/index.js` | reescrito — contrato, orçamento, fatiamento, cancelamento |
| `src/solver/referencia.js` | removido |
| `src/dataset/loader.js` | editado — `referencia` sai da validação |
| `src/ui/app.js` | editado — disparo no carregamento, cancelamento, sem estimativa |
| `tools/gerar-dataset.mjs` | editado — para de gravar `referencia` |
| `tools/verificar-solver.mjs` | novo — validação e benchmark |
| `data/grids/*.json` | regerados |
| `README.md` | atualizado — seção "Estado atual" |

## 16. Rastreabilidade

| Requisito | Onde |
| --- | --- |
| RF08 — calcular a solução ótima da configuração inicial | `solver/` inteiro; disparo em `app.js:novaGrade` |
| RF12 — exibir a solução quando solicitado | `app.js:mostrarSolucao` lendo o store |
| RNF02 — resposta perceptivelmente instantânea | Guloso síncrono + fatias de 8 ms (seção 9) |
| RNF03 — algoritmo separado do jogo e da interface | `solver/` importa só `core/`; contrato inalterado |
| RNF05 — reprodutibilidade por id | Desempates determinísticos; verificado no item 5 da seção 14 |
| RN07 — nunca sobre o progresso do jogador | Instância compilada da `config` inicial (seção 4) |

## 17. Riscos

1. **7×7 pode não fechar dentro de 2 s.** Aceito: `proven: false` já é tratado pela
   interface e pela especificação. O benchmark dirá quantas grades ficam de fora, e o
   orçamento é o parâmetro a ajustar.
2. **Orçamentos são chute até a primeira medição.** Ficam todos num único módulo de
   constantes, para afinar com uma edição só.
3. **`dificuldade` do dataset segue descalibrada** (6×6 e 7×7 saem todas `dificil`). Com o
   ótimo real disponível a recalibração fica trivial, mas é escopo de outra etapa.
