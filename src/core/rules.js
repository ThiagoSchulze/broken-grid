export const ESTADOS = Object.freeze({
  REMOVIVEL: 'removivel',
  BLOQUEADO: 'bloqueado',
  QUEBRADO: 'quebrado',
  REMOVIDO: 'removido',
});

export function estaPresente(estado) {
  return estado === ESTADOS.REMOVIVEL || estado === ESTADOS.BLOQUEADO;
}

export function motivoRecusa(estado) {
  switch (estado) {
    case ESTADOS.REMOVIVEL: return null;
    case ESTADOS.BLOQUEADO: return 'bloqueado';
    case ESTADOS.QUEBRADO: return 'quebrado';
    case ESTADOS.REMOVIDO: return 'ja-removido';
    default: return 'inexistente';
  }
}
