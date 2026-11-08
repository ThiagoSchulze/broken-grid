// Broken Grid - firmware do tabuleiro (Uno ligado no PC)
//
// O jogo roda no navegador (Chrome/Edge). O Uno só faz duas coisas:
//   1. lê os 6 botões e manda para o PC pela USB
//   2. recebe do PC a cor de cada um dos 40 LEDs e acende a fita WS2812B
// Regras, solver, cursor e cronômetro ficam no JavaScript (src/tabuleiro/ e
// src/core/cursor.js).
//
// ---- protocolo ----
// 115200 baud, uma mensagem por linha (termina em \n).
//
// Uno -> PC
//   PRONTO broken-grid-periferico v2 n=4 modo=botoes   ao ligar e quando recebe "?"
//   BOTAO DIREITA              cursor para o próximo palito da fileira (dá a volta)
//   BOTAO BAIXO                cursor para a próxima fileira, alternando horizontais e
//                              verticais (dá a volta)
//                              segurando DIREITA ou BAIXO, repete depois de 500 ms, a cada 250 ms
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
//   D2 = REMOVER, D3 = VOLTAR, D4 = SOLUÇÃO, D5 = NOVO GRID, D7 = DIREITA, D8 = BAIXO
//     cada botão: um terminal no pino, o outro no GND (INPUT_PULLUP, sem resistor)
//   LEDs na fonte de 5 V separada, com GND comum. Nunca ligar essa fonte no 5V do Uno.
//
// O Uno só acende o LED i com o i-ésimo código do quadro; quem decide qual palito fica em
// cada LED é o PC (ordemDaFita em src/tabuleiro/protocolo.js). A fita montada é um
// zigue-zague por colunas:  v:r:c -> 9c + r      h:r:c -> 9c + 4 + (4 - r)

#include <Adafruit_NeoPixel.h>

// ---- configuração ----

const uint8_t N = 4;
const uint8_t NUM_LEDS = 2 * N * (N + 1);  // 40

const uint8_t PINO_LEDS = 6;
const uint8_t NUM_BOTOES = 6;
const uint8_t PINOS_BOTAO[NUM_BOTOES] = {2, 3, 4, 5, 7, 8};
// os dois últimos (DIREITA e BAIXO) repetem enquanto ficam apertados
const bool BOTAO_REPETE[NUM_BOTOES] = {false, false, false, false, true, true};

const long BAUD = 115200;
const uint8_t BRILHO = 80;           // o mesmo da especificação
const uint16_t PISCA_MS = 300;
const uint16_t DEBOUNCE_MS = 25;
const uint16_t AVISO_LED_MS = 40;    // o LED "L" da placa pisca a cada quadro recebido
const uint16_t REPETE_APOS_MS = 500; // segurando DIREITA/BAIXO, começa a repetir depois disso
const uint16_t REPETE_CADA_MS = 250; // e repete nesse intervalo

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
  Serial.print(F("PRONTO broken-grid-periferico v2 n="));
  Serial.print(N);
  Serial.println(F(" modo=botoes"));
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

const char *const NOMES_BOTAO[NUM_BOTOES] = {"REMOVER", "VOLTAR", "SOLUCAO", "NOVO", "DIREITA", "BAIXO"};
bool botaoApertado[NUM_BOTOES] = {false, false, false, false, false, false};
bool botaoLeitura[NUM_BOTOES] = {false, false, false, false, false, false};
uint32_t botaoMudouEm[NUM_BOTOES] = {0, 0, 0, 0, 0, 0};
uint32_t proximaRepeticao[NUM_BOTOES] = {0, 0, 0, 0, 0, 0};

void avisarBotao(uint8_t i) {
  Serial.print(F("BOTAO "));
  Serial.println(NOMES_BOTAO[i]);
}

void lerBotoes(uint32_t agora) {
  for (uint8_t i = 0; i < NUM_BOTOES; i++) {
    bool leitura = digitalRead(PINOS_BOTAO[i]) == LOW;
    if (leitura != botaoLeitura[i]) { botaoLeitura[i] = leitura; botaoMudouEm[i] = agora; }
    if (agora - botaoMudouEm[i] >= DEBOUNCE_MS && leitura != botaoApertado[i]) {
      botaoApertado[i] = leitura;
      if (leitura) { avisarBotao(i); proximaRepeticao[i] = agora + REPETE_APOS_MS; }
    } else if (botaoApertado[i] && BOTAO_REPETE[i] && (int32_t)(agora - proximaRepeticao[i]) >= 0) {
      // segurando: repete. A subtração com sinal continua certa quando o millis() dá a
      // volta (~49 dias).
      avisarBotao(i);
      proximaRepeticao[i] = agora + REPETE_CADA_MS;
    }
  }
}

// ---- setup / loop ----

void setup() {
  Serial.begin(BAUD);
  pinMode(LED_BUILTIN, OUTPUT);
  for (uint8_t i = 0; i < NUM_BOTOES; i++) pinMode(PINOS_BOTAO[i], INPUT_PULLUP);
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
  // apaga o LED "L" depois de AVISO_LED_MS
  if (avisoAte && (int32_t)(agora - avisoAte) >= 0) { digitalWrite(LED_BUILTIN, LOW); avisoAte = 0; }
  mostrar(agora);
}
