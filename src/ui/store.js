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
