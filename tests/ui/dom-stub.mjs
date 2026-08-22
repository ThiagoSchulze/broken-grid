// Stub de DOM minimo — cobre exatamente a superficie que src/ui usa:
// createElement/createElementNS, setAttribute/removeAttribute, classList,
// append, textContent, hidden, dataset, addEventListener, closest, querySelector.
class ClassList {
  constructor(no) { this.no = no; this.set = new Set(); }
  add(...cs) { cs.forEach((c) => this.set.add(c)); }
  remove(...cs) { cs.forEach((c) => this.set.delete(c)); }
  toggle(c, forcar) { if (forcar) this.set.add(c); else this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  get value() { return [...this.set].join(' '); }
}

export class Elemento {
  constructor(tag, ns = null) {
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns;
    this.atributos = new Map();
    this.filhos = [];
    this.pai = null;
    this.ouvintes = new Map();
    this.classList = new ClassList(this);
    // `dataset` espelha para atributos data-*, como no DOM real.
    const atributos = this.atributos;
    this.dataset = new Proxy({}, {
      get: (_, nome) => atributos.get('data-' + String(nome)),
      set: (_, nome, valor) => { atributos.set('data-' + String(nome), String(valor)); return true; },
      has: (_, nome) => atributos.has('data-' + String(nome)),
    });
    this._texto = '';
    this.hidden = false;
    this.style = {};
    this.disabled = false;
  }
  setAttribute(nome, valor) {
    this.atributos.set(nome, String(valor));
    if (nome === 'class') { this.classList.set = new Set(String(valor).split(/\s+/).filter(Boolean)); }
  }
  getAttribute(nome) { return this.atributos.has(nome) ? this.atributos.get(nome) : null; }
  removeAttribute(nome) { this.atributos.delete(nome); }
  hasAttribute(nome) { return this.atributos.has(nome); }
  append(...nos) { for (const no of nos) { no.pai = this; this.filhos.push(no); } }
  replaceChildren(...nos) { this.filhos = []; this.append(...nos); }
  set textContent(v) { this._texto = String(v); this.filhos = []; }
  get textContent() { return this._texto || this.filhos.map((f) => f.textContent).join(''); }
  set className(v) { this.setAttribute('class', v); }
  get className() { return this.classList.value; }
  addEventListener(tipo, fn) {
    if (!this.ouvintes.has(tipo)) this.ouvintes.set(tipo, []);
    this.ouvintes.get(tipo).push(fn);
  }
  disparar(tipo, evento) {
    let no = this;
    while (no) {
      for (const fn of no.ouvintes.get(tipo) ?? []) fn(evento);
      no = no.pai;
    }
  }
  closest(seletor) {
    const attr = seletor.replace(/^\[|\]$/g, '');
    let no = this;
    while (no) { if (no.atributos.has(attr)) return no; no = no.pai; }
    return null;
  }
  querySelector(seletor) { return buscar(this, seletor); }
  todos(filtro, acc = []) {
    for (const f of this.filhos) { if (filtro(f)) acc.push(f); f.todos(filtro, acc); }
    return acc;
  }
}

function casa(no, seletor) {
  if (seletor.startsWith('#')) return no.getAttribute('id') === seletor.slice(1);
  if (seletor.startsWith('.')) return no.classList.contains(seletor.slice(1));
  return no.tagName === seletor.toUpperCase();
}
function buscar(raiz, seletor) {
  for (const f of raiz.filhos) {
    if (casa(f, seletor)) return f;
    const achado = buscar(f, seletor);
    if (achado) return achado;
  }
  return null;
}

export function criarDocumento(ids) {
  const raiz = new Elemento('body');
  const doc = {
    createElement: (t) => new Elemento(t),
    createElementNS: (ns, t) => new Elemento(t, ns),
    querySelector: (s) => (casa(raiz, s) ? raiz : buscar(raiz, s)),
    raiz,
  };
  for (const id of ids) {
    const el = new Elemento('div');
    el.setAttribute('id', id);
    raiz.append(el);
  }
  const cartao = new Elemento('section');
  cartao.setAttribute('class', 'cartao cartao--tabuleiro');
  const tab = doc.querySelector('#tabuleiro');
  raiz.filhos = raiz.filhos.filter((f) => f !== tab);
  cartao.append(tab);
  raiz.append(cartao);
  return doc;
}
