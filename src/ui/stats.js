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
