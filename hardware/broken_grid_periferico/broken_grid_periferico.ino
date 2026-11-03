// Broken Grid - firmware do tabuleiro (Uno ligado no PC)
//
// O jogo roda no navegador (Chrome/Edge). O Uno só faz duas coisas:
//   1. lê os 4 potenciômetros e os 4 botões e manda para o PC pela USB
//   2. recebe do PC a cor de cada um dos 40 LEDs e acende a fita WS2812B
// Regras, solver, cursor e cronômetro ficam no JavaScript (src/tabuleiro/ e
// src/core/cursor.js).
//
// ---- protocolo ----
// 115200 baud, uma mensagem por linha (termina em \n).
//
// Uno -> PC
//   PRONTO broken-grid-periferico v1 n=4 modo=posicao   ao ligar e quando recebe "?"
//   POS H <linha> <coluna>     modo posição: o controle H aponta para h:linha:coluna
//   POS V <linha> <coluna>     mesmo para o controle V (v:linha:coluna)
//   MOVER H D|E|C|B            modo joystick: direita, esquerda, cima, baixo
//   MOVER V D|E|C|B
//   BOTAO REMOVER | BOTAO VOLTAR | BOTAO SOLUCAO | BOTAO NOVO
//   OK                         recebeu o quadro e já acendeu
//   ERRO <motivo>              quadro_invalido | comando_desconhecido | linha_longa
//
// PC -> Uno
//   ?                          "está aí?"
//   L <40 caracteres>          um caractere por LED, na ordem da fita:
//                                .  apagado (quebrado / removido)
//                                w  branco  (removível)
//                                r  vermelho (bloqueado)
//                                c  ciano   (solução)
//                                g  verde   (vitória)
//                                *  cursor  (branco piscando; o pisca é feito aqui)
//
// O PC espera o OK antes de mandar outro quadro (ou reenvia se vier ERRO ou nada). Motivo:
// leds.show() desliga as interrupções por ~1,2 ms e o que chega na serial nesse tempo se perde.
//
// ---- ligação ----
//   D6 -> resistor 330 ohm -> DIN do LED 0
//   A0 / A1 = potenciômetros do controle H (X / Y)
//   A2 / A3 = potenciômetros do controle V (X / Y)
//     potenciômetro: pontas no 5V e no GND, perna do meio no pino analógico
//   D2 = REMOVER, D3 = VOLTAR, D4 = SOLUÇÃO, D5 = NOVO GRID (outro terminal no GND)
//   LEDs na fonte de 5 V separada, com GND comum. Nunca ligar essa fonte no 5V do Uno.
//
// Fita em zigue-zague:  h:r:c -> r*9 + c      v:r:c -> r*9 + 4 + (4 - c)

#include <Adafruit_NeoPixel.h>

// ---- configuração ----

// Deixar false enquanto os potenciômetros não estiverem ligados: com A0..A3 soltos a
// leitura é só ruído e o cursor anda sozinho.
const bool POTENCIOMETROS_LIGADOS = true;

// true:  a posição do potenciômetro escolhe o palito. É o modo certo para potenciômetro,
//        que não volta sozinho para o meio.
// false: funciona como joystick (girou para um lado anda, voltou ao meio para).
const bool MODO_POSICAO = true;

// inverte cada eixo, na ordem H-X, H-Y, V-X, V-Y
// (sem inversão: X alto = direita, Y alto = baixo)
const bool INVERTER[4] = {true, false, true, false};

const uint8_t N = 4;
const uint8_t NUM_LEDS = 2 * N * (N + 1);  // 40

const uint8_t PINO_LEDS = 6;
const uint8_t PINOS_EIXO[4] = {A0, A1, A2, A3};
const uint8_t NUM_BOTOES = 4;
const uint8_t PINOS_BOTAO[NUM_BOTOES] = {2, 3, 4, 5};

const long BAUD = 115200;
const uint8_t BRILHO = 80;           // o mesmo da especificação
const uint16_t PISCA_MS = 300;
const uint16_t DEBOUNCE_MS = 25;
const uint16_t AVISO_LED_MS = 40;    // o LED "L" da placa pisca a cada quadro recebido

// modo posição: quanto o valor tem que entrar na faixa nova para trocar (evita o cursor
// ficar tremendo na divisa entre duas faixas)
const int HISTERESE = 25;
// modo joystick
const int ZONA_MORTA = 200;
const uint16_t REPETE_APOS_MS = 500;
const uint16_t REPETE_CADA_MS = 250;

Adafruit_NeoPixel leds(NUM_LEDS, PINO_LEDS, NEO_GRB + NEO_KHZ800);

// ---- LEDs ----

// linha que está chegando pela serial (mostrar() também olha tamLinha)
char linha[64];
uint8_t tamLinha = 0;
bool linhaEstourou = false;

char quadro[NUM_LEDS];       // último quadro válido que veio do PC
bool recebeuQuadro = false;
bool precisaMostrar = true;
uint8_t ultimaFase = 255;
uint32_t avisoAte = 0;

uint32_t corDoCodigo(char c, bool faseAcesa) {
  switch (c) {
    case 'w': return leds.Color(255, 255, 255);
    case 'r': return leds.Color(255, 0, 0);
    case 'c': return leds.Color(0, 255, 255);
    case 'g': return leds.Color(0, 255, 0);
    case '*': return faseAcesa ? leds.Color(255, 255, 255) : 0;
    default:  return 0;
  }
}

bool codigoValido(char c) {
  return c == '.' || c == 'w' || c == 'r' || c == 'c' || c == 'g' || c == '*';
}

bool temCursor() {
  for (uint8_t i = 0; i < NUM_LEDS; i++) if (quadro[i] == '*') return true;
  return false;
}

void aplicarQuadro(uint8_t fase) {
  precisaMostrar = false;
  ultimaFase = fase;
  for (uint8_t i = 0; i < NUM_LEDS; i++)
    leds.setPixelColor(i, recebeuQuadro ? corDoCodigo(quadro[i], fase == 0) : 0);
  leds.show();
}

// roda a cada volta do loop, mas só redesenha quando o pisca do cursor troca de fase
void mostrar(uint32_t agora) {
  uint8_t fase = (agora / PISCA_MS) & 1;
  bool mudouFase = fase != ultimaFase && recebeuQuadro && temCursor();
  if (!precisaMostrar && !mudouFase) return;
  // show() desliga as interrupções, então espera se tiver comando chegando
  if (Serial.available() > 0 || tamLinha > 0) return;
  aplicarQuadro(fase);
}

// ---- serial ----

void anunciarPronto() {
  Serial.print(F("PRONTO broken-grid-periferico v1 n="));
  Serial.print(N);
  Serial.println(MODO_POSICAO ? F(" modo=posicao") : F(" modo=joystick"));
}

void interpretar() {
  if (linha[0] == '?' && linha[1] == '\0') { anunciarPronto(); return; }

  if (linha[0] == 'L' && linha[1] == ' ') {
    if (strlen(linha + 2) != NUM_LEDS) { Serial.println(F("ERRO quadro_invalido")); return; }
    for (uint8_t i = 0; i < NUM_LEDS; i++)
      if (!codigoValido(linha[2 + i])) { Serial.println(F("ERRO quadro_invalido")); return; }
    memcpy(quadro, linha + 2, NUM_LEDS);
    recebeuQuadro = true;
    // acende primeiro e só depois manda o OK. Como o PC espera o OK, nada chega pela
    // serial enquanto show() está com as interrupções desligadas.
    aplicarQuadro((millis() / PISCA_MS) & 1);
    digitalWrite(LED_BUILTIN, HIGH);
    avisoAte = millis() + AVISO_LED_MS;
    Serial.println(F("OK"));
    return;
  }

  Serial.println(F("ERRO comando_desconhecido"));
}

// junta os caracteres até o \n; se a linha passar do buffer, descarta e responde ERRO
void lerSerial() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (linhaEstourou) Serial.println(F("ERRO linha_longa"));
      else if (tamLinha > 0) { linha[tamLinha] = '\0'; interpretar(); }
      tamLinha = 0;
      linhaEstourou = false;
    } else if (tamLinha < sizeof linha - 1) {
      linha[tamLinha++] = c;
    } else {
      linhaEstourou = true;
    }
  }
}

// ---- botões ----
// INPUT_PULLUP: solto = HIGH, apertado = LOW (o botão fecha o pino com o GND).
// Debounce: a leitura só vale depois de ficar DEBOUNCE_MS sem mudar.

const char *const NOMES_BOTAO[NUM_BOTOES] = {"REMOVER", "VOLTAR", "SOLUCAO", "NOVO"};
bool botaoApertado[NUM_BOTOES] = {false, false, false, false};
bool botaoLeitura[NUM_BOTOES] = {false, false, false, false};
uint32_t botaoMudouEm[NUM_BOTOES] = {0, 0, 0, 0};

void lerBotoes(uint32_t agora) {
  for (uint8_t i = 0; i < NUM_BOTOES; i++) {
    bool leitura = digitalRead(PINOS_BOTAO[i]) == LOW;
    if (leitura != botaoLeitura[i]) { botaoLeitura[i] = leitura; botaoMudouEm[i] = agora; }
    if (agora - botaoMudouEm[i] >= DEBOUNCE_MS && leitura != botaoApertado[i]) {
      botaoApertado[i] = leitura;
      if (leitura) { Serial.print(F("BOTAO ")); Serial.println(NOMES_BOTAO[i]); }
    }
  }
}

// ---- potenciômetros ----

int lerEixo(uint8_t e) {
  int v = analogRead(PINOS_EIXO[e]);
  return INVERTER[e] ? 1023 - v : v;
}

// Modo posição: cada eixo é cortado em faixas iguais, uma por coluna ou linha.
// controle H: X escolhe a coluna (0..3), Y a linha (0..4)
// controle V: X escolhe a coluna (0..4), Y a linha (0..3)
const uint8_t FAIXAS[4] = {N, N + 1, N + 1, N};
int8_t faixaAtual[4] = {-1, -1, -1, -1};

int8_t faixaDe(int valor, uint8_t faixas) {
  int8_t f = (int32_t)valor * faixas / 1024;
  return f >= (int8_t)faixas ? faixas - 1 : f;
}

// só troca de faixa quando o valor já entrou HISTERESE unidades na nova.
// Devolve true se trocou.
bool atualizarFaixa(uint8_t e, int valor) {
  int8_t nova = faixaDe(valor, FAIXAS[e]);
  if (faixaAtual[e] < 0) { faixaAtual[e] = nova; return false; }  // primeira leitura: só guarda
  if (nova == faixaAtual[e]) return false;
  int32_t inicio = (int32_t)nova * 1024 / FAIXAS[e];
  int32_t fim = (int32_t)(nova + 1) * 1024 / FAIXAS[e];
  if (nova > faixaAtual[e] && valor < inicio + HISTERESE) return false;
  if (nova < faixaAtual[e] && valor > fim - HISTERESE) return false;
  faixaAtual[e] = nova;
  return true;
}

// manda POS só quando algum eixo do controle mudou de faixa
void lerModoPosicao() {
  for (uint8_t j = 0; j < 2; j++) {
    bool mudouX = atualizarFaixa(2 * j, lerEixo(2 * j));
    bool mudouY = atualizarFaixa(2 * j + 1, lerEixo(2 * j + 1));
    if (!mudouX && !mudouY) continue;
    Serial.print(j == 0 ? F("POS H ") : F("POS V "));
    Serial.print(faixaAtual[2 * j + 1]);   // linha
    Serial.print(' ');
    Serial.println(faixaAtual[2 * j]);     // coluna
  }
}

// Modo joystick: mesma lógica do sketch do Tinkercad.
int centro[4];
int8_t ultimoDx[2] = {0, 0}, ultimoDy[2] = {0, 0};
uint32_t proximaRepeticao[2] = {0, 0};

// centro = média de 8 leituras de cada eixo, com os controles soltos
void calibrar() {
  for (uint8_t e = 0; e < 4; e++) {
    long soma = 0;
    for (uint8_t k = 0; k < 8; k++) soma += lerEixo(e);
    centro[e] = soma / 8;
  }
}

int8_t direcao(int valor, int c) {
  return valor < c - ZONA_MORTA ? -1 : valor > c + ZONA_MORTA ? 1 : 0;
}

void lerModoJoystick(uint32_t agora) {
  for (uint8_t j = 0; j < 2; j++) {
    int vx = lerEixo(2 * j), vy = lerEixo(2 * j + 1);
    int8_t dx = direcao(vx, centro[2 * j]);
    int8_t dy = direcao(vy, centro[2 * j + 1]);
    if (dx && dy) {  // diagonal: vale o eixo mais empurrado
      if (abs(vx - centro[2 * j]) >= abs(vy - centro[2 * j + 1])) dy = 0; else dx = 0;
    }
    bool mudou = dx != ultimoDx[j] || dy != ultimoDy[j];
    ultimoDx[j] = dx;
    ultimoDy[j] = dy;
    if (!dx && !dy) continue;
    // move na hora em que empurra; segurando, repete. A subtração com sinal continua
    // certa quando o millis() dá a volta (~49 dias).
    if (mudou) proximaRepeticao[j] = agora + REPETE_APOS_MS;
    else if ((int32_t)(agora - proximaRepeticao[j]) >= 0) proximaRepeticao[j] = agora + REPETE_CADA_MS;
    else continue;
    Serial.print(j == 0 ? F("MOVER H ") : F("MOVER V "));
    Serial.println(dx > 0 ? 'D' : dx < 0 ? 'E' : dy < 0 ? 'C' : 'B');
  }
}

// ---- setup / loop ----

void setup() {
  Serial.begin(BAUD);
  pinMode(LED_BUILTIN, OUTPUT);
  for (uint8_t i = 0; i < NUM_BOTOES; i++) pinMode(PINOS_BOTAO[i], INPUT_PULLUP);
  if (POTENCIOMETROS_LIGADOS && !MODO_POSICAO) calibrar();
  leds.begin();
  leds.setBrightness(BRILHO);
  leds.clear();
  leds.show();  // fica apagado até o PC mandar o primeiro quadro
  anunciarPronto();
}

void loop() {
  uint32_t agora = millis();
  lerSerial();
  lerBotoes(agora);
  if (POTENCIOMETROS_LIGADOS) {
    if (MODO_POSICAO) lerModoPosicao();
    else lerModoJoystick(agora);
  }
  // apaga o LED "L" depois de AVISO_LED_MS
  if (avisoAte && (int32_t)(agora - avisoAte) >= 0) { digitalWrite(LED_BUILTIN, LOW); avisoAte = 0; }
  mostrar(agora);
}
