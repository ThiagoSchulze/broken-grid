// Broken Grid — sketch de teste para o Tinkercad Circuits
// Arduino Uno + 40 NeoPixels + 4 potenciômetros (simulando os dois joysticks KY-023) + 3 botões.
//
// Roda o jogo inteiro só no Arduino, para validar fiação, ordem dos LEDs e cursor antes da
// montagem. No tabuleiro final o PC é o cérebro e o Nano é só periférico (Web Serial).
// Arquivo único de propósito: o editor do Tinkercad aceita um sketch só.
//
// Corrente de LEDs em zigue-zague (DO de um no DIN do próximo):
//   linha de horizontais da esquerda para a direita, depois a linha de verticais logo abaixo
//   da direita para a esquerda, e assim por diante.
//   h:r:c -> r*9 + c          v:r:c -> r*9 + 4 + (4 - c)
// Os ids h:r:c / v:r:c são os mesmos de src/core/geometry.js.
//
// No Tinkercad não existe FastLED nem KY-023: usamos Adafruit_NeoPixel (mesmo brilho 80)
// e um potenciômetro por eixo de joystick.

#include <Adafruit_NeoPixel.h>
#include <avr/pgmspace.h>

// Assinaturas de função usam só tipos nativos (uint8_t, uint64_t...): o Tinkercad insere os
// protótipos gerados na linha 1 do arquivo, antes de qualquer typedef, enum ou struct.

const uint8_t N = 4;
const uint8_t NUM_PALITOS = 2 * N * (N + 1);
const uint8_t MAX_QUADRADOS = 30;  // 16 + 9 + 4 + 1
const uint8_t SEM_CURSOR = 255;

const uint8_t PINO_LEDS = 6;
const uint8_t PINO_H_X = A0, PINO_H_Y = A1;  // joystick H: palitos horizontais
const uint8_t PINO_V_X = A2, PINO_V_Y = A3;  // joystick V: palitos verticais
const uint8_t PINO_REMOVER = 2;
const uint8_t PINO_VOLTAR = 3;
const uint8_t PINO_SOLUCAO = 4;

// mesmo brilho da montagem real (FastLED.setBrightness(80)); no Tinkercad, 255 sobrecarrega
// o 5V do Arduino simulado e as cores saem erradas
const uint8_t BRILHO = 80;
// No Tinkercad um NeoPixel branco aceso quase não se distingue de um apagado, então no
// simulador o cursor pisca em amarelo e o palito removido fica azul. Na placa real use false:
// cursor branco piscando e removido apagado, como na especificação.
const bool CORES_DO_SIMULADOR = true;
const uint16_t DEBOUNCE_MS = 25;
const uint16_t PISCA_MS = 300;
const uint16_t ORCAMENTO_NOS = 20000;

// Joystick: leitura analógica 0..1023. O centro de cada eixo é medido ao ligar (calibração,
// como se faz com o KY-023 real); afastar mais que ZONA_MORTA do centro conta como empurrado.
const int ZONA_MORTA = 200;
const uint16_t REPETE_APOS_MS = 500;   // segurando o joystick, o cursor repete...
const uint16_t REPETE_CADA_MS = 250;   // ...a cada 250 ms
// Valor alto no eixo X = direita; valor alto no eixo Y = para baixo. Inverta aqui se o
// joystick for montado girado.
const bool INVERTER_X = false;
const bool INVERTER_Y = false;

enum Estado : uint8_t { REMOVIVEL, BLOQUEADO, QUEBRADO, REMOVIDO };

// >>> GRADES (gerado por tools/gerar-grades-arduino.mjs a partir de data/grids/4x4.json)
struct Grade { uint8_t numero; uint64_t quebrados; uint64_t bloqueados; };
const uint8_t NUM_GRADES = 20;
const Grade GRADES[NUM_GRADES] PROGMEM = {
  {1, 0x000000000000D080ULL, 0x0000000000500C10ULL},  // g4-001 medio
  {2, 0x0000001000400442ULL, 0x0000000400000005ULL},  // g4-002 medio
  {3, 0x0000000810110400ULL, 0x00000090004C8815ULL},  // g4-003 medio
  {4, 0x000000A000000106ULL, 0x0000000111101891ULL},  // g4-004 dificil
  {5, 0x0000000090000000ULL, 0x000000C401500820ULL},  // g4-005 dificil
  {6, 0x0000000000040000ULL, 0x000000808C210810ULL},  // g4-006 dificil
  {7, 0x0000002280005300ULL, 0x0000000C30400401ULL},  // g4-007 facil
  {8, 0x0000004168400100ULL, 0x0000000000864050ULL},  // g4-008 dificil
  {9, 0x0000008008006000ULL, 0x0000000804A30001ULL},  // g4-009 dificil
  {10, 0x0000000981404101ULL, 0x000000000E092240ULL},  // g4-010 facil
  {11, 0x0000000080E00000ULL, 0x000000A040000110ULL},  // g4-011 dificil
  {12, 0x0000000208580000ULL, 0x0000002082002002ULL},  // g4-012 facil
  {13, 0x00000000020000B0ULL, 0x0000006028032046ULL},  // g4-013 medio
  {14, 0x0000000004040324ULL, 0x00000040820A0012ULL},  // g4-014 medio
  {15, 0x0000000000000000ULL, 0x0000000880101003ULL},  // g4-015 dificil
  {16, 0x00000000008A6A80ULL, 0x0000002041409100ULL},  // g4-016 facil
  {17, 0x0000000800400080ULL, 0x0000001002216550ULL},  // g4-017 dificil
  {18, 0x0000004401422800ULL, 0x0000001100000100ULL},  // g4-018 facil
  {19, 0x0000000012002080ULL, 0x0000000204131067ULL},  // g4-019 dificil
  {20, 0x0000000042024100ULL, 0x0000000808B40810ULL},  // g4-020 medio
};
// <<< GRADES

Adafruit_NeoPixel leds(NUM_PALITOS, PINO_LEDS, NEO_GRB + NEO_KHZ800);

// ------------------------------------------------------------------ máscaras de bits
// Sem deslocamento variável de 64 bits: no AVR ele vira um laço caro.

static inline uint64_t bitDe(uint8_t i) {
  uint64_t m = 0;
  ((uint8_t *)&m)[i >> 3] = (uint8_t)(1 << (i & 7));
  return m;
}

static inline bool temBit(uint64_t m, uint8_t i) {
  return ((const uint8_t *)&m)[i >> 3] & (uint8_t)(1 << (i & 7));
}

static uint8_t contarBits(uint64_t m) {
  uint8_t n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
}

// ------------------------------------------------------------------ geometria

uint8_t indiceH(uint8_t r, uint8_t c) { return r * 9 + c; }
uint8_t indiceV(uint8_t r, uint8_t c) { return r * 9 + 4 + (4 - c); }

bool ehHorizontal(uint8_t p) { return p / 9 == N || p % 9 < 4; }
uint8_t linhaDe(uint8_t p) { return p / 9; }
uint8_t colunaDe(uint8_t p) { return ehHorizontal(p) ? p % 9 : 8 - p % 9; }

// centro do palito em meias-casas: h:r:c -> (2c+1, 2r)   v:r:c -> (2c, 2r+1)
int8_t centroX(uint8_t p) { return ehHorizontal(p) ? 2 * colunaDe(p) + 1 : 2 * colunaDe(p); }
int8_t centroY(uint8_t p) { return ehHorizontal(p) ? 2 * linhaDe(p) : 2 * linhaDe(p) + 1; }

uint64_t quadrados[MAX_QUADRADOS];
uint8_t numQuadrados = 0;

void montarQuadrados() {
  numQuadrados = 0;
  for (uint8_t t = 1; t <= N; t++)
    for (uint8_t l = 0; l + t <= N; l++)
      for (uint8_t c = 0; c + t <= N; c++) {
        uint64_t m = 0;
        for (uint8_t i = 0; i < t; i++) {
          m |= bitDe(indiceH(l, c + i)) | bitDe(indiceH(l + t, c + i));
          m |= bitDe(indiceV(l + i, c)) | bitDe(indiceV(l + i, c + t));
        }
        quadrados[numQuadrados++] = m;
      }
}

void escreverId(uint8_t p) {
  Serial.print(ehHorizontal(p) ? F("h:") : F("v:"));
  Serial.print(linhaDe(p)); Serial.print(':'); Serial.print(colunaDe(p));
}

// "h:1:2" / "v:0:4" -> índice do LED, ou SEM_CURSOR se inválido
uint8_t lerId(const char *s) {
  char o = s[0];
  if ((o != 'h' && o != 'v') || s[1] != ':' || s[2] < '0' || s[2] > '9' || s[3] != ':' ||
      s[4] < '0' || s[4] > '9' || s[5] != '\0') return SEM_CURSOR;
  uint8_t l = s[2] - '0', c = s[4] - '0';
  if (o == 'h') return (l <= N && c < N) ? indiceH(l, c) : SEM_CURSOR;
  return (l < N && c <= N) ? indiceV(l, c) : SEM_CURSOR;
}

// ------------------------------------------------------------------ estado da partida

uint8_t estado[NUM_PALITOS];
uint8_t gradeAtual = 0;
uint8_t numeroDaGrade = 0;
uint64_t quebradosIni = 0, bloqueadosIni = 0, removidosMask = 0;
uint8_t percurso[NUM_PALITOS];
uint8_t removidos = 0;
bool podeDesfazer = false;
bool vitoria = false;
bool modoSolucao = false;
uint32_t inicioMs = 0;
uint8_t cursor = SEM_CURSOR;

uint64_t solucao = 0;
uint8_t minimo = 0;
bool provado = false;

uint8_t contarVivos() {
  uint64_t ausentes = quebradosIni | removidosMask;
  uint8_t vivos = 0;
  for (uint8_t i = 0; i < numQuadrados; i++)
    if (!(quadrados[i] & ausentes)) vivos++;
  return vivos;
}

// ------------------------------------------------------------------ solver
// Mesma formulação de src/solver/: cobertura mínima dos quadrados vivos da grade original,
// guloso como teto + branch and bound ramificando no quadrado com menos palitos removíveis.

uint8_t vivosIni[MAX_QUADRADOS];
uint8_t numVivosIni = 0;
uint64_t removiveisIni = 0;
uint16_t nos = 0;
bool estourou = false;

void buscar(uint64_t escolhidos, uint8_t profundidade) {
  if (nos >= ORCAMENTO_NOS) { estourou = true; return; }
  nos++;
  uint64_t ramo = 0, usados = 0;
  uint8_t menor = 255, cota = 0;
  for (uint8_t i = 0; i < numVivosIni; i++) {
    uint64_t q = quadrados[vivosIni[i]];
    if (q & escolhidos) continue;
    uint64_t r = q & removiveisIni;
    uint8_t k = contarBits(r);
    if (k < menor) { menor = k; ramo = r; }
    // quadrados sem palito removível em comum exigem um palito cada: cota inferior
    if (!(r & usados)) { cota++; usados |= r; }
  }
  if (menor == 255) {
    if (profundidade < minimo) { minimo = profundidade; solucao = escolhidos; }
    return;
  }
  if (profundidade + cota >= minimo) return;
  for (uint8_t e = 0; e < NUM_PALITOS; e++) {
    if (!temBit(ramo, e)) continue;
    buscar(escolhidos | bitDe(e), profundidade + 1);
    if (estourou) return;
  }
}

void resolver() {
  removiveisIni = 0;
  for (uint8_t p = 0; p < NUM_PALITOS; p++)
    if (estado[p] == REMOVIVEL) removiveisIni |= bitDe(p);
  numVivosIni = 0;
  for (uint8_t i = 0; i < numQuadrados; i++)
    if (!(quadrados[i] & quebradosIni)) vivosIni[numVivosIni++] = i;

  // fase 1: guloso — remove o palito que mata mais quadrados ainda vivos
  uint64_t escolhidos = 0;
  uint8_t qtd = 0;
  for (;;) {
    uint8_t melhorPalito = 255, melhorMortes = 0;
    for (uint8_t e = 0; e < NUM_PALITOS; e++) {
      if (!temBit(removiveisIni, e) || temBit(escolhidos, e)) continue;
      uint8_t mortes = 0;
      for (uint8_t i = 0; i < numVivosIni; i++) {
        uint64_t q = quadrados[vivosIni[i]];
        if (!(q & escolhidos) && temBit(q, e)) mortes++;
      }
      if (mortes > melhorMortes) { melhorMortes = mortes; melhorPalito = e; }
    }
    if (melhorPalito == 255) break;
    escolhidos |= bitDe(melhorPalito);
    qtd++;
  }
  minimo = qtd;
  solucao = escolhidos;

  // fase 2: busca exata
  nos = 0;
  estourou = false;
  buscar(0, 0);
  provado = !estourou;
}

// ------------------------------------------------------------------ cursor
// Só para em palito removível. "Linha" é uma fileira de palitos da mesma orientação:
// 5 linhas de 4 horizontais (r = 0..4) e 4 linhas de 5 verticais (r = 0..3).

bool removivel(uint8_t p) { return estado[p] == REMOVIVEL; }

uint8_t palitoEm(bool horizontal, uint8_t r, uint8_t c) {
  return horizontal ? indiceH(r, c) : indiceV(r, c);
}

// removível mais próximo do centro de 'origem' (empate: menor índice); filtra a orientação
// quando apenasOrientacao = 1 (horizontal) ou 2 (vertical)
uint8_t maisProximo(uint8_t origem, uint8_t apenasOrientacao) {
  uint8_t melhor = SEM_CURSOR;
  int melhorDist = 0x7FFF;
  for (uint8_t p = 0; p < NUM_PALITOS; p++) {
    if (!removivel(p)) continue;
    if (apenasOrientacao == 1 && !ehHorizontal(p)) continue;
    if (apenasOrientacao == 2 && ehHorizontal(p)) continue;
    int dx = centroX(p) - centroX(origem);
    int dy = centroY(p) - centroY(origem);
    int d = dx * dx + dy * dy;
    if (d < melhorDist) { melhorDist = d; melhor = p; }
  }
  return melhor;
}

uint8_t primeiroRemovivel() {
  for (uint8_t p = 0; p < NUM_PALITOS; p++)
    if (removivel(p)) return p;
  return SEM_CURSOR;
}

void anunciarCursor() {
  Serial.print(F("CURSOR "));
  if (cursor == SEM_CURSOR) Serial.print(F("nenhum"));
  else escreverId(cursor);
  Serial.println();
}

// ao longo da linha: próximo removível na direção; se não houver, fica parado
void moverAoLongo(int8_t passo) {
  bool h = ehHorizontal(cursor);
  uint8_t r = linhaDe(cursor);
  int8_t largura = h ? N : N + 1;
  for (int8_t c = colunaDe(cursor) + passo; c >= 0 && c < largura; c += passo) {
    uint8_t p = palitoEm(h, r, c);
    if (removivel(p)) { cursor = p; break; }
  }
}

// para outra linha: a próxima linha na direção que tenha algum removível, no palito mais
// próximo da coluna atual (empate: menor coluna); se não houver, fica parado
void moverEntreLinhas(int8_t passo) {
  bool h = ehHorizontal(cursor);
  int8_t linhas = h ? N + 1 : N;
  int8_t largura = h ? N : N + 1;
  int8_t c0 = colunaDe(cursor);
  for (int8_t r = linhaDe(cursor) + passo; r >= 0 && r < linhas; r += passo) {
    uint8_t melhor = SEM_CURSOR;
    int8_t melhorDist = 127;
    for (int8_t c = 0; c < largura; c++) {
      uint8_t p = palitoEm(h, r, c);
      int8_t d = c > c0 ? c - c0 : c0 - c;
      if (removivel(p) && d < melhorDist) { melhorDist = d; melhor = p; }
    }
    if (melhor != SEM_CURSOR) { cursor = melhor; return; }
  }
}

// joystick: 0 = H (horizontais), 1 = V (verticais). Mexer no joystick da outra orientação
// só troca o cursor para o removível mais próximo dela, sem andar.
void moverCursor(uint8_t joystick, int8_t dx, int8_t dy) {
  if (cursor == SEM_CURSOR) return;
  uint8_t antes = cursor;
  bool querHorizontal = joystick == 0;
  if (ehHorizontal(cursor) != querHorizontal) {
    uint8_t p = maisProximo(cursor, querHorizontal ? 1 : 2);
    if (p != SEM_CURSOR) cursor = p;
  } else if (dx) {
    moverAoLongo(dx);
  } else {
    moverEntreLinhas(dy);
  }
  if (cursor != antes) anunciarCursor();  // no fim da linha ele fica parado, sem repetir
}

// ------------------------------------------------------------------ ações

void carregarGrade(uint8_t g) {
  Grade grade;
  memcpy_P(&grade, &GRADES[g], sizeof grade);
  gradeAtual = g;
  numeroDaGrade = grade.numero;
  quebradosIni = grade.quebrados;
  bloqueadosIni = grade.bloqueados;
  for (uint8_t p = 0; p < NUM_PALITOS; p++)
    estado[p] = temBit(quebradosIni, p) ? QUEBRADO : temBit(bloqueadosIni, p) ? BLOQUEADO : REMOVIVEL;
  removidosMask = 0;
  removidos = 0;
  podeDesfazer = false;
  vitoria = false;
  modoSolucao = false;

  uint32_t t0 = millis();
  resolver();
  uint32_t gasto = millis() - t0;

  Serial.print(F("GRADE g4-"));
  if (numeroDaGrade < 100) Serial.print('0');
  if (numeroDaGrade < 10) Serial.print('0');
  Serial.print(numeroDaGrade);
  Serial.print(F(" minimo=")); Serial.print(minimo);
  Serial.print(F(" provado=")); Serial.print(provado ? 1 : 0);
  Serial.print(F(" nos=")); Serial.print(nos);
  Serial.print(F(" solver_ms=")); Serial.print(gasto);
  Serial.print(F(" vivos=")); Serial.println(contarVivos());
  cursor = primeiroRemovivel();
  anunciarCursor();
  inicioMs = millis();
}

void anunciarVitoria() {
  Serial.print(F("VITORIA tempo_ms=")); Serial.print(millis() - inicioMs);
  Serial.print(F(" removidos=")); Serial.print(removidos);
  Serial.print(F(" minimo=")); Serial.print(minimo);
  Serial.print(F(" excedentes=")); Serial.print(removidos - minimo);
  Serial.print(F(" eficiencia=")); Serial.print(100.0 * minimo / removidos, 2);
  Serial.print(F(" percurso="));
  for (uint8_t i = 0; i < removidos; i++) {
    if (i) Serial.print(',');
    escreverId(percurso[i]);
  }
  Serial.println();
}

void remover() {
  if (cursor == SEM_CURSOR || !removivel(cursor)) return;
  uint8_t p = cursor;
  estado[p] = REMOVIDO;
  removidosMask |= bitDe(p);
  percurso[removidos++] = p;
  podeDesfazer = true;
  uint8_t vivos = contarVivos();
  Serial.print(F("REMOVIDO "));
  escreverId(p);
  Serial.print(F(" removidos=")); Serial.print(removidos);
  Serial.print(F(" vivos=")); Serial.println(vivos);
  // depois de remover, o cursor vai para o removível mais próximo
  cursor = maisProximo(p, 0);
  anunciarCursor();
  if (vivos == 0) {
    vitoria = true;
    anunciarVitoria();
  }
}

// desfaz só a última jogada: depois de voltar, precisa remover outro palito
void desfazer() {
  if (!podeDesfazer || removidos == 0) {
    Serial.println(F("RECUSADO desfazer motivo=indisponivel"));
    return;
  }
  uint8_t p = percurso[--removidos];
  estado[p] = REMOVIVEL;
  removidosMask &= ~bitDe(p);
  podeDesfazer = false;
  cursor = p;
  Serial.print(F("DESFEITO "));
  escreverId(p);
  Serial.print(F(" removidos=")); Serial.print(removidos);
  Serial.print(F(" vivos=")); Serial.println(contarVivos());
  anunciarCursor();
}

// mostra a solução sobre a grade inicial; apertar de novo volta ao jogo onde estava
void alternarSolucao() {
  modoSolucao = !modoSolucao;
  if (!modoSolucao) { Serial.println(F("SOLUCAO off")); return; }
  Serial.print(F("SOLUCAO on minimo=")); Serial.print(minimo);
  Serial.print(F(" provado=")); Serial.print(provado ? 1 : 0);
  Serial.print(F(" palitos="));
  bool primeiro = true;
  for (uint8_t p = 0; p < NUM_PALITOS; p++) {
    if (!temBit(solucao, p)) continue;
    if (!primeiro) Serial.print(',');
    escreverId(p);
    primeiro = false;
  }
  Serial.println();
}

// Toda entrada (controle físico ou comando serial) passa por aqui, então as duas formas de
// jogar obedecem às mesmas regras. A grade fica congelada no modo solução e após a vitória.
bool jogadaPermitida() { return !modoSolucao && !vitoria; }

// ------------------------------------------------------------------ LEDs

uint32_t corRemovivel, corBloqueado, corSolucao, corVitoria, corCursor, corRemovido;
bool precisaDesenhar = true;
uint8_t ultimaFase = 255;

// cor já com o brilho aplicado (equivale a setBrightness(BRILHO))
uint32_t corComBrilho(uint8_t r, uint8_t g, uint8_t b) {
  return leds.Color((uint16_t)r * BRILHO / 255, (uint16_t)g * BRILHO / 255, (uint16_t)b * BRILHO / 255);
}

void prepararCores() {
  corRemovivel = corComBrilho(255, 255, 255);
  corBloqueado = corComBrilho(255, 0, 0);
  corSolucao = corComBrilho(0, 255, 255);
  corVitoria = corComBrilho(0, 255, 0);
  // cursor e removidos são poucos LEDs: no simulador vão em intensidade total para aparecer
  // (azul a 80/255 fica escuro demais na tela do Tinkercad)
  corCursor = CORES_DO_SIMULADOR ? leds.Color(255, 160, 0) : corRemovivel;
  corRemovido = CORES_DO_SIMULADOR ? leds.Color(0, 120, 255) : 0;
}

uint32_t corDoEstado(uint8_t e) {
  if (e == REMOVIVEL) return corRemovivel;
  if (e == BLOQUEADO) return corBloqueado;
  if (e == REMOVIDO) return corRemovido;
  return 0;  // quebrado: apagado
}

void desenhar(uint32_t agora) {
  uint8_t fase = (agora / PISCA_MS) & 1;
  if (!precisaDesenhar && fase == ultimaFase) return;
  precisaDesenhar = false;
  ultimaFase = fase;

  for (uint8_t p = 0; p < NUM_PALITOS; p++) {
    uint32_t cor;
    if (modoSolucao) {
      uint8_t original = temBit(quebradosIni, p) ? QUEBRADO : temBit(bloqueadosIni, p) ? BLOQUEADO : REMOVIVEL;
      cor = temBit(solucao, p) ? corSolucao : corDoEstado(original);
    } else if (vitoria) {
      cor = (estado[p] == REMOVIVEL || estado[p] == BLOQUEADO) ? corVitoria : corDoEstado(estado[p]);
    } else {
      cor = corDoEstado(estado[p]);
      // cursor piscando (aceso / apagado)
      if (p == cursor) cor = fase ? corCursor : 0;
    }
    leds.setPixelColor(p, cor);
  }
  leds.show();
}

// ------------------------------------------------------------------ joysticks

int8_t direcaoDoEixo(int valor, int centro, bool inverter) {
  int8_t d = valor < centro - ZONA_MORTA ? -1 : valor > centro + ZONA_MORTA ? 1 : 0;
  return inverter ? -d : d;
}

uint8_t pinosJoystick[2][2] = {{PINO_H_X, PINO_H_Y}, {PINO_V_X, PINO_V_Y}};
int centroJoystick[2][2];
int8_t ultimoDx[2] = {0, 0}, ultimoDy[2] = {0, 0};
uint32_t proximaRepeticao[2] = {0, 0};

// lê cada eixo parado ao ligar; por isso os joysticks devem estar soltos (no meio) no reset
void calibrarJoysticks() {
  for (uint8_t j = 0; j < 2; j++)
    for (uint8_t e = 0; e < 2; e++) {
      long soma = 0;
      for (uint8_t k = 0; k < 8; k++) soma += analogRead(pinosJoystick[j][e]);
      centroJoystick[j][e] = soma / 8;
    }
}

void lerJoysticks(uint32_t agora) {
  for (uint8_t j = 0; j < 2; j++) {
    int vx = analogRead(pinosJoystick[j][0]);
    int vy = analogRead(pinosJoystick[j][1]);
    int8_t dx = direcaoDoEixo(vx, centroJoystick[j][0], INVERTER_X);
    int8_t dy = direcaoDoEixo(vy, centroJoystick[j][1], INVERTER_Y);
    // diagonal: vale o eixo mais empurrado
    if (dx && dy) {
      if (abs(vx - centroJoystick[j][0]) >= abs(vy - centroJoystick[j][1])) dy = 0; else dx = 0;
    }
    bool mudou = dx != ultimoDx[j] || dy != ultimoDy[j];
    ultimoDx[j] = dx;
    ultimoDy[j] = dy;
    if (!dx && !dy) continue;
    if (mudou) proximaRepeticao[j] = agora + REPETE_APOS_MS;
    else if (agora >= proximaRepeticao[j]) proximaRepeticao[j] = agora + REPETE_CADA_MS;
    else continue;
    if (jogadaPermitida()) { moverCursor(j, dx, dy); precisaDesenhar = true; }
  }
}

// ------------------------------------------------------------------ botões
// INPUT_PULLUP: o botão liga o pino ao GND, então apertado = LOW.

uint8_t pinosBotao[3] = {PINO_REMOVER, PINO_VOLTAR, PINO_SOLUCAO};
bool botaoApertado[3] = {false, false, false};
bool botaoLeitura[3] = {false, false, false};
uint32_t botaoMudouEm[3] = {0, 0, 0};

void acaoDoBotao(uint8_t i) {
  if (i == 2) alternarSolucao();
  else if (!jogadaPermitida()) return;
  else if (i == 0) remover();
  else desfazer();
  precisaDesenhar = true;
}

void lerBotoes(uint32_t agora) {
  for (uint8_t i = 0; i < 3; i++) {
    bool leitura = digitalRead(pinosBotao[i]) == LOW;
    if (leitura != botaoLeitura[i]) { botaoLeitura[i] = leitura; botaoMudouEm[i] = agora; }
    if (agora - botaoMudouEm[i] >= DEBOUNCE_MS && leitura != botaoApertado[i]) {
      botaoApertado[i] = leitura;
      if (leitura) acaoDoBotao(i);
    }
  }
}

// ------------------------------------------------------------------ serial
// Uma linha por comando, para testar sem mexer nos controles:
//   H D | H E | H C | H B      joystick H para direita, esquerda, cima, baixo
//   V D | V E | V C | V B      joystick V
//   REMOVER [id] | VOLTAR | SOLUCAO | NOVA | GRADE <n> | ESTADO

char linha[24];
uint8_t tamLinha = 0;
const uint16_t FIM_DE_COMANDO_MS = 400;
uint32_t ultimoCaractereEm = 0;

void imprimirEstado() {
  Serial.print(F("ESTADO removidos=")); Serial.print(removidos);
  Serial.print(F(" vivos=")); Serial.print(contarVivos());
  Serial.print(F(" vitoria=")); Serial.print(vitoria ? 1 : 0);
  Serial.print(F(" palitos="));
  // um caractere por LED, na ordem da corrente: r removível, b bloqueado, q quebrado, x removido
  for (uint8_t p = 0; p < NUM_PALITOS; p++) Serial.print("rbqx"[estado[p]]);
  Serial.print(F(" cursor="));
  if (cursor == SEM_CURSOR) Serial.print(F("nenhum"));
  else escreverId(cursor);
  Serial.println();
}

void interpretar(char *cmd) {
  char *arg = strchr(cmd, ' ');
  if (arg) *arg++ = '\0';
  if ((!strcmp(cmd, "H") || !strcmp(cmd, "V")) && arg && arg[1] == '\0') {
    int8_t dx = 0, dy = 0;
    if (arg[0] == 'D') dx = 1;
    else if (arg[0] == 'E') dx = -1;
    else if (arg[0] == 'C') dy = -1;
    else if (arg[0] == 'B') dy = 1;
    else { Serial.println(F("ERRO direcao_invalida")); return; }
    if (jogadaPermitida()) moverCursor(cmd[0] == 'H' ? 0 : 1, dx, dy);
  }
  else if (!strcmp(cmd, "REMOVER")) {
    if (arg) {
      uint8_t p = lerId(arg);
      if (p == SEM_CURSOR) { Serial.println(F("ERRO id_invalido")); return; }
      if (!removivel(p)) { Serial.println(F("RECUSADO motivo=nao_removivel")); return; }
      if (jogadaPermitida()) cursor = p;
    }
    if (jogadaPermitida()) remover();
  }
  else if (!strcmp(cmd, "VOLTAR")) { if (jogadaPermitida()) desfazer(); }
  else if (!strcmp(cmd, "SOLUCAO")) alternarSolucao();
  else if (!strcmp(cmd, "NOVA")) carregarGrade((gradeAtual + 1) % NUM_GRADES);
  else if (!strcmp(cmd, "GRADE")) {
    int g = arg ? atoi(arg) : 0;
    if (g < 1 || g > NUM_GRADES) { Serial.println(F("ERRO grade_invalida")); return; }
    carregarGrade(g - 1);
  }
  else if (!strcmp(cmd, "ESTADO")) imprimirEstado();
  else { Serial.println(F("ERRO comando_desconhecido")); return; }
  precisaDesenhar = true;
}

void fecharLinha() {
  linha[tamLinha] = '\0';
  tamLinha = 0;
  interpretar(linha);
}

// O Monitor Serial do Tinkercad envia o texto sem quebra de linha, então um comando
// também termina quando a serial fica 400 ms em silêncio
// (com a aba em segundo plano o Tinkercad entrega os caracteres bem espaçados).
void lerSerial(uint32_t agora) {
  while (Serial.available()) {
    char c = Serial.read();
    ultimoCaractereEm = agora;
    if (c == '\n' || c == '\r') {
      if (tamLinha) fecharLinha();
    } else if (tamLinha < sizeof linha - 1) {
      linha[tamLinha++] = c;
    }
  }
  if (tamLinha && agora - ultimoCaractereEm >= FIM_DE_COMANDO_MS) fecharLinha();
}

// ------------------------------------------------------------------ setup / loop

void setup() {
  Serial.begin(9600);
  for (uint8_t i = 0; i < 3; i++) pinMode(pinosBotao[i], INPUT_PULLUP);
  calibrarJoysticks();
  leds.begin();
  prepararCores();
  leds.show();
  montarQuadrados();
  Serial.println(F("BROKEN_GRID tinkercad v2 n=4"));
  carregarGrade(0);
}

void loop() {
  uint32_t agora = millis();
  lerJoysticks(agora);
  lerBotoes(agora);
  lerSerial(agora);
  desenhar(agora);
}
