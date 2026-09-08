// Uso: node tools/verificar-solver.mjs

import { montarGrade, registrarAusencia } from '../src/core/grid.js';
import { ESTADOS } from '../src/core/rules.js';

let total = 0;
let falhas = 0;

function checar(nome, condicao, detalhe = '') {
  total += 1;
  if (condicao) {
    console.log(`  ok    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? `: ${detalhe}` : ''}`);
  }
}

function secao(titulo) {
  console.log(`\n== ${titulo}`);
}

async function principal() {
  await verificarBits();
  await verificarInstancia();
  await verificarReducao();
  await verificarGuloso();
  await verificarExato();
  await verificarContrato();
  await verificarDataset();
  await verificarDificuldade();
  await verificarVarredura();

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
  const disjunto = new Uint32Array([0b1001, 0]);
  checar('haInterseccao negativo', !bits.haInterseccao(disjunto, fonte, 2, 2));

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

async function verificarGuloso() {
  const { compilarInstancia, reduzirInstancia } = await import('../src/solver/instancia.js');
  const { resolverGuloso, cobre } = await import('../src/solver/guloso.js');
  secao('guloso');

  for (const n of [4, 5, 6, 7]) {
    const instancia = compilarInstancia({ n, quebrados: [], bloqueados: [] });
    const reducao = reduzirInstancia(instancia);
    const guloso = resolverGuloso(instancia, reducao);

    checar(`${n}x${n}: a solucao cobre tudo`, cobre(instancia, reducao.ativos, guloso.escolhidos));
    const inicioGulosos = reducao.obrigatorios.length;
    checar(
      `${n}x${n}: a solucao e minimal`,
      guloso.escolhidos.every((_, i) => i < inicioGulosos || !cobre(
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

  const forcada = compilarInstancia({ n: 4, quebrados: [], bloqueados: ['h:0:0', 'h:1:0', 'v:0:0'] });
  const reducaoForcada = reduzirInstancia(forcada);
  const gulosoForcado = resolverGuloso(forcada, reducaoForcada);
  const inicioGulososForcado = reducaoForcada.obrigatorios.length;
  checar('4x4 com um obrigatorio: forca exatamente um obrigatorio', reducaoForcada.obrigatorios.length === 1);
  checar(
    '4x4 com um obrigatorio: a solucao e minimal',
    gulosoForcado.escolhidos.every((_, i) => i < inicioGulososForcado || !cobre(
      forcada,
      reducaoForcada.ativos,
      gulosoForcado.escolhidos.filter((__, j) => j !== i),
    )),
  );

  const instancia = compilarInstancia({ n: 4, quebrados: [], bloqueados: [] });
  const reducao = reduzirInstancia(instancia);
  const guloso = resolverGuloso(instancia, reducao);
  checar(
    '4x4 limpa: o guloso fica num intervalo plausivel',
    guloso.escolhidos.length >= 8 && guloso.escolhidos.length <= 20,
    `${guloso.escolhidos.length}`,
  );
}

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
    'ORCAMENTO_PADRAO tem exatamente os valores ajustados pela varredura',
    ORCAMENTO_PADRAO[4] === 100 && ORCAMENTO_PADRAO[5] === 100
      && ORCAMENTO_PADRAO[6] === 100 && ORCAMENTO_PADRAO[7] === 2000,
  );
  checar('ORCAMENTO_PADRAO e congelado', Object.isFrozen(ORCAMENTO_PADRAO));

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

async function verificarDificuldade() {
  const { readFile } = await import('node:fs/promises');
  const { validarDataset } = await import('../src/dataset/loader.js');
  const { classificarDificuldade, referenciaDaGradeLimpa, contarDificuldades } = await import('./gerar-dataset.mjs');
  secao('dificuldade');

  // A referencia e o minimo da grade limpa. Se o solver mudar de resposta aqui,
  // todo rotulo do dataset muda junto — por isso os valores estao fixados.
  const esperadas = { 4: 9, 5: 14, 6: 19, 7: 26 };
  for (const n of [4, 5, 6, 7]) {
    const referencia = await referenciaDaGradeLimpa(n);
    checar(`${n}x${n}: referencia da grade limpa`, referencia === esperadas[n], `${referencia}`);
  }

  checar('razao baixa cai em facil', classificarDificuldade(4, 9) === 'facil');
  checar('razao no limiar de facil ainda e facil', classificarDificuldade(58, 100) === 'facil');
  checar('logo acima do limiar vira medio', classificarDificuldade(59, 100) === 'medio');
  checar('razao no limiar de medio ainda e medio', classificarDificuldade(75, 100) === 'medio');
  checar('logo acima do limiar vira dificil', classificarDificuldade(76, 100) === 'dificil');
  checar('grade igual a limpa e dificil', classificarDificuldade(9, 9) === 'dificil');

  let recusou = false;
  try {
    classificarDificuldade(3, 0);
  } catch {
    recusou = true;
  }
  checar('referencia zero e recusada', recusou);

  for (const n of [4, 5, 6, 7]) {
    const url = new URL(`../data/grids/${n}x${n}.json`, import.meta.url);
    const dados = validarDataset(JSON.parse(await readFile(url, 'utf8')));
    const contagem = contarDificuldades(dados.grids);

    checar(
      `${n}x${n}: toda grade tem rotulo de dificuldade`,
      dados.grids.every((g) => typeof g.dificuldade === 'string'),
    );
    checar(
      `${n}x${n}: as tres faixas aparecem`,
      contagem.facil > 0 && contagem.medio > 0 && contagem.dificil > 0,
      `${contagem.facil}/${contagem.medio}/${contagem.dificil}`,
    );
    checar(
      `${n}x${n}: nenhuma faixa domina o tamanho`,
      Math.max(contagem.facil, contagem.medio, contagem.dificil) <= dados.grids.length * 0.7,
      `${contagem.facil} facil, ${contagem.medio} medio, ${contagem.dificil} dificil`,
    );
  }
}

async function verificarVarredura() {
  const { readFile } = await import('node:fs/promises');
  const { validarDataset, configDaGrade } = await import('../src/dataset/loader.js');
  const { resolver } = await import('../src/solver/index.js');
  const { classificarDificuldade, referenciaDaGradeLimpa } = await import('./gerar-dataset.mjs');
  secao('varredura das 80 grades');

  const linhas = [];

  for (const n of [4, 5, 6, 7]) {
    const url = new URL(`../data/grids/${n}x${n}.json`, import.meta.url);
    const dataset = validarDataset(JSON.parse(await readFile(url, 'utf8')));
    const referencia = await referenciaDaGradeLimpa(n);

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

      if (resultado.proven) {
        const rotulo = classificarDificuldade(resultado.quantidade, referencia);
        checar(
          `${grid.id}: dificuldade bate com o minimo provado`,
          grid.dificuldade === rotulo,
          `gravado ${grid.dificuldade}, recalculado ${rotulo} (${resultado.quantidade}/${referencia})`,
        );
      }

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
        dificuldade: grid.dificuldade,
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
    const faixas = ['facil', 'medio', 'dificil']
      .map((faixa) => `${doTamanho.filter((l) => l.dificuldade === faixa).length} ${faixa}`)
      .join(', ');
    console.log(
      `${n}x${n}: ${provadas}/${doTamanho.length} provadas, pior tempo do exato ${piorMs.toFixed(1)} ms, `
      + `guloso ${excedente.toFixed(2)} palito(s) acima do exato em media, ${faixas}`,
    );
  }
}

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

await principal();
