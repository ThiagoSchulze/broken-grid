// Broken Grid — firmware do tabuleiro final (Arduino Uno como periférico do PC)
//
// O jogo roda no navegador (Chrome/Edge). Este firmware só:
//   1. lê os 4 potenciômetros e os 3 botões e avisa o PC pela USB;
//   2. recebe do PC o estado de cada um dos 40 LEDs e acende a corrente WS2812B.
// Regras, solver, cursor, cronômetro e estatísticas ficam todos no JavaScript
// (src/tabuleiro/ e src/core/cursor.js).
//
// ------------------------------------------------------------------ protocolo
// Serial a 115200 baud, uma mensagem por linha (terminada em \n).
//
// Uno -> PC
//   PRONTO broken-grid-periferico v1 n=4 modo=posicao   ao ligar e em resposta a "?"
//   POS H <linha> <coluna>     modo posicao: potenciômetros do controle H apontam para h:l:c
//   POS V <linha> <coluna>     idem, controle V (v:l:c)
//   MOVER H D|E|C|B            modo joystick: direita, esquerda, cima, baixo
//   MOVER V D|E|C|B
//   BOTAO REMOVER | BOTAO VOLTAR | BOTAO SOLUCAO
//   OK                         quadro de LEDs recebido e aplicado
//   ERRO <motivo>              quadro_invalido | comando_desconhecido | linha_longa
//
// PC -> Uno
//   ?                          pergunta se está pronto
//   L <40 caracteres>          um caractere por LED, na ordem da corrente:
//                                .  apagado (quebrado / removido)
//                                w  branco  (removível)
//                                r  vermelho (bloqueado)
//                                c  ciano   (solução)
//                                g  verde   (vitória)
//                                *  cursor  (pisca em branco; o pisca é feito aqui)
//
// O PC só manda o próximo quadro depois do OK (ou reenvia após ERRO ou silêncio). Isso é
// necessário porque leds.show() desliga as interrupções por ~1,2 ms e bytes que chegam pela
// serial nesse intervalo podem se perder.
//
// ------------------------------------------------------------------ ligação (Arduino Uno)
//   D6  -> resistor 330 ohm -> DIN do LED 0
//   A0 / A1 = potenciômetros do controle H (eixo X / eixo Y)
//   A2 / A3 = potenciômetros do controle V (eixo X / eixo Y)
//     cada potenciômetro: pontas no 5V e no GND, perna do meio no pino analógico
//   D2 = REMOVER, D3 = VOLTAR, D4 = SOLUÇÃO (outro terminal no GND; INPUT_PULLUP)
//   LEDs na fonte separada de 5 V, com GND comum. Nunca ligar a fonte no 5V do Uno.
//
// Corrente de LEDs em zigue-zague:  h:r:c -> r*9 + c      v:r:c -> r*9 + 4 + (4 - c)

#include <Adafruit_NeoPixel.h>

// ------------------------------------------------------------------ configuração

// >>> MUDE PARA true QUANDO OS POTENCIÔMETROS ESTIVEREM LIGADOS.
// Com os pinos A0..A3 soltos a leitura é ruído e o cursor andaria sozinho.
const bool POTENCIOMETROS_LIGADOS = false;

// true:  a posição do potenciômetro escolhe o palito (recomendado para potenciômetro,
//        que não volta sozinho para o meio)
// false: comporta-se como joystick (girar para um lado anda, voltar ao meio para)
const bool MODO_POSICAO = true;

// inverte o sentido de cada eixo, na ordem H-X, H-Y, V-X, V-Y
// (sem inversão: valor alto no X = direita, valor alto no Y = para baixo)
const bool INVERTER[4] = {false, false, false, false};

const uint8_t N = 4;
const uint8_t NUM_LEDS = 2 * N * (N + 1);  // 40

const uint8_t PINO_LEDS = 6;
const uint8_t PINOS_EIXO[4] = {A0, A1, A2, A3};
const uint8_t PINOS_BOTAO[3] = {2, 3, 4};

const long BAUD = 115200;
const uint8_t BRILHO = 80;           // mesmo brilho da especificação
const uint16_t PISCA_MS = 300;
const uint16_t DEBOUNCE_MS = 25;
const uint16_t AVISO_LED_MS = 40;    // LED "L" da placa acende a cada quadro recebido

// modo posição: margem para trocar de faixa (evita o cursor tremer na divisa)
const int HISTERESE = 25;
// modo joystick
const int ZONA_MORTA = 200;
const uint16_t REPETE_APOS_MS = 500;
const uint16_t REPETE_CADA_MS = 250;

Adafruit_NeoPixel leds(NUM_LEDS, PINO_LEDS, NEO_GRB + NEO_KHZ800);

// ------------------------------------------------------------------ LEDs

// buffer do comando que está chegando pela serial (usado também por mostrar())
char linha[64];
uint8_t tamLinha = 0;
bool linhaEstourou = false;


char quadro[NUM_LEDS];       // último quadro válido recebido do PC
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

// chamado a cada volta do loop: só redesenha quando o pisca do cursor muda de fase
void mostrar(uint32_t agora) {
  uint8_t fase = (agora / PISCA_MS) & 1;
  bool mudouFase = fase != ultimaFase && recebeuQuadro && temCursor();
  if (!precisaMostrar && !mudouFase) return;
  // show() desliga as interrupções: não atualiza no meio de um comando chegando
  if (Serial.available() > 0 || tamLinha > 0) return;
  aplicarQuadro(fase);
}

// ------------------------------------------------------------------ serial

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
    // acende já e só depois responde OK: o PC espera o OK para mandar o próximo quadro,
    // então nenhum byte chega enquanto show() está com as interrupções desligadas
    aplicarQuadro((millis() / PISCA_MS) & 1);
    digitalWrite(LED_BUILTIN, HIGH);
    avisoAte = millis() + AVISO_LED_MS;
    Serial.println(F("OK"));
    return;
  }

  Serial.println(F("ERRO comando_desconhecido"));
}

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

// ------------------------------------------------------------------ botões
// INPUT_PULLUP: solto = HIGH, apertado = LOW (o botão liga o pino ao GND).

const char *const NOMES_BOTAO[3] = {"REMOVER", "VOLTAR", "SOLUCAO"};
bool botaoApertado[3] = {false, false, false};
bool botaoLeitura[3] = {false, false, false};
uint32_t botaoMudouEm[3] = {0, 0, 0};

void lerBotoes(uint32_t agora) {
  for (uint8_t i = 0; i < 3; i++) {
    bool leitura = digitalRead(PINOS_BOTAO[i]) == LOW;
    if (leitura != botaoLeitura[i]) { botaoLeitura[i] = leitura; botaoMudouEm[i] = agora; }
    if (agora - botaoMudouEm[i] >= DEBOUNCE_MS && leitura != botaoApertado[i]) {
      botaoApertado[i] = leitura;
      if (leitura) { Serial.print(F("BOTAO ")); Serial.println(NOMES_BOTAO[i]); }
    }
  }
}

// ------------------------------------------------------------------ potenciômetros

int lerEixo(uint8_t e) {
  int v = analogRead(PINOS_EIXO[e]);
  return INVERTER[e] ? 1023 - v : v;
}

// --- modo posição: cada eixo é dividido em faixas iguais (colunas ou linhas) ---
// controle H: X escolhe a coluna (0..3), Y escolhe a linha (0..4)
// controle V: X escolhe a coluna (0..4), Y escolhe a linha (0..3)
const uint8_t FAIXAS[4] = {N, N + 1, N + 1, N};
int8_t faixaAtual[4] = {-1, -1, -1, -1};

int8_t faixaDe(int valor, uint8_t faixas) {
  int8_t f = (int32_t)valor * faixas / 1024;
  return f >= (int8_t)faixas ? faixas - 1 : f;
}

// só troca de faixa quando o valor entra HISTERESE unidades na faixa nova
bool atualizarFaixa(uint8_t e, int valor) {
  int8_t nova = faixaDe(valor, FAIXAS[e]);
  if (faixaAtual[e] < 0) { faixaAtual[e] = nova; return false; }  // 1ª leitura: só registra
  if (nova == faixaAtual[e]) return false;
  int32_t inicio = (int32_t)nova * 1024 / FAIXAS[e];
  int32_t fim = (int32_t)(nova + 1) * 1024 / FAIXAS[e];
  if (nova > faixaAtual[e] && valor < inicio + HISTERESE) return false;
  if (nova < faixaAtual[e] && valor > fim - HISTERESE) return false;
  faixaAtual[e] = nova;
  return true;
}

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

// --- modo joystick: igual ao sketch do Tinkercad ---
int centro[4];
int8_t ultimoDx[2] = {0, 0}, ultimoDy[2] = {0, 0};
uint32_t proximaRepeticao[2] = {0, 0};

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
    if (mudou) proximaRepeticao[j] = agora + REPETE_APOS_MS;
    else if ((int32_t)(agora - proximaRepeticao[j]) >= 0) proximaRepeticao[j] = agora + REPETE_CADA_MS;
    else continue;
    Serial.print(j == 0 ? F("MOVER H ") : F("MOVER V "));
    Serial.println(dx > 0 ? 'D' : dx < 0 ? 'E' : dy < 0 ? 'C' : 'B');
  }
}

// ------------------------------------------------------------------ setup / loop

void setup() {
  Serial.begin(BAUD);
  pinMode(LED_BUILTIN, OUTPUT);
  for (uint8_t i = 0; i < 3; i++) pinMode(PINOS_BOTAO[i], INPUT_PULLUP);
  if (POTENCIOMETROS_LIGADOS && !MODO_POSICAO) calibrar();
  leds.begin();
  leds.setBrightness(BRILHO);
  leds.clear();
  leds.show();  // antes do primeiro quadro do PC o tabuleiro fica apagado
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
  if (avisoAte && (int32_t)(agora - avisoAte) >= 0) { digitalWrite(LED_BUILTIN, LOW); avisoAte = 0; }
  mostrar(agora);
}
