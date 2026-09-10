// Livre de DOM: pode rodar no Node, junto das verificacoes de tools/.
// O solver so garante o minimo quando fecha a prova dentro do orcamento de tempo;
// chamar de "otima" uma busca interrompida seria afirmar o que nao foi provado.
export function rotuloSolucao(solucao) {
  return solucao?.proven ? 'Solução ótima' : 'Solução aproximada';
}
