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
