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
