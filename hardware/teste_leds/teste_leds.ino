// Broken Grid — teste da corrente de LEDs (usar durante a soldagem, a cada 10 LEDs)
//
// Acende UM LED de cada vez, na ordem da corrente (0, 1, 2, ...), e imprime no Monitor
// Serial (9600 baud) qual palito ele deveria ser. Confira no tabuleiro se o LED aceso
// está mesmo no palito impresso. Horizontais acendem em BRANCO, verticais em AZUL.
//
// Comandos no Monitor Serial (uma linha, Enter):
//   N <qtd>   quantos LEDs já estão soldados (padrão 40). Ex.: N 10
//   P         pausa / continua a varredura
//   T         acende todos os soldados de uma vez em branco fraco (teste de alimentação)
//   <número>  acende só esse LED e pausa. Ex.: 17
//
// Ligação: D6 -> resistor 330 ohm -> DIN do LED 0. LEDs na fonte 5 V separada, GND comum.

#include <Adafruit_NeoPixel.h>

const uint8_t PINO_LEDS = 6;
const uint8_t TOTAL = 40;
const uint8_t BRILHO = 40;          // baixo de propósito: é só para ver a posição
const uint16_t PASSO_MS = 700;

Adafruit_NeoPixel leds(TOTAL, PINO_LEDS, NEO_GRB + NEO_KHZ800);

uint8_t soldados = TOTAL;
uint8_t atual = 0;
bool pausado = false;
bool todos = false;
uint32_t ultimoPasso = 0;

char linha[16];
uint8_t tam = 0;

// mesma fórmula do jogo:  h:r:c -> 9r + c     v:r:c -> 9r + 4 + (4 - c)
bool ehHorizontal(uint8_t p) { return p / 9 == 4 || p % 9 < 4; }

void imprimirId(uint8_t p) {
  uint8_t r = p / 9;
  if (ehHorizontal(p)) { Serial.print(F("h:")); Serial.print(r); Serial.print(':'); Serial.print(p % 9); }
  else                 { Serial.print(F("v:")); Serial.print(r); Serial.print(':'); Serial.print(8 - p % 9); }
}

void mostrar(uint8_t p) {
  leds.clear();
  leds.setPixelColor(p, ehHorizontal(p) ? leds.Color(255, 255, 255) : leds.Color(0, 0, 255));
  leds.show();
  Serial.print(F("LED ")); Serial.print(p); Serial.print(F(" = ")); imprimirId(p); Serial.println();
}

void acenderTodos() {
  leds.clear();
  for (uint8_t p = 0; p < soldados; p++) leds.setPixelColor(p, leds.Color(255, 255, 255));
  leds.show();
  Serial.print(F("TODOS acesos: ")); Serial.println(soldados);
}

void interpretar() {
  linha[tam] = '\0';
  tam = 0;
  if (linha[0] == 'N' || linha[0] == 'n') {
    int q = atoi(linha + 1);
    if (q >= 1 && q <= TOTAL) { soldados = q; atual = 0; Serial.print(F("soldados = ")); Serial.println(soldados); }
  } else if (linha[0] == 'P' || linha[0] == 'p') {
    pausado = !pausado; todos = false;
    Serial.println(pausado ? F("pausado") : F("continuando"));
  } else if (linha[0] == 'T' || linha[0] == 't') {
    todos = true; pausado = true; acenderTodos();
  } else if (linha[0] >= '0' && linha[0] <= '9') {
    int p = atoi(linha);
    if (p < soldados) { atual = p; pausado = true; todos = false; mostrar(atual); }
    else Serial.println(F("fora do numero de LEDs soldados"));
  }
}

void setup() {
  Serial.begin(9600);
  leds.begin();
  leds.setBrightness(BRILHO);
  leds.clear();
  leds.show();
  Serial.println(F("TESTE_LEDS pronto. Comandos: N <qtd> | P | T | <numero>"));
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (tam) interpretar(); }
    else if (tam < sizeof linha - 1) linha[tam++] = c;
  }

  if (!pausado && millis() - ultimoPasso >= PASSO_MS) {
    ultimoPasso = millis();
    mostrar(atual);
    atual = (atual + 1) % soldados;
  }
}
