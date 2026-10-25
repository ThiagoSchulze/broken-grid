// Broken Grid — teste dos joysticks e botões (antes de fechar a caixa)
//
// Imprime no Monitor Serial (9600 baud), 5 vezes por segundo, a leitura de cada eixo
// (0 a 1023) e a direção interpretada, além do estado dos 3 botões.
// Use para descobrir se o joystick foi montado girado: empurre para a DIREITA e veja se
// aparece "D". Se aparecer "E", ponha INVERTER_X = true no sketch do jogo (idem Y com C/B).
//
// Ligação: joystick H  VRx->A0  VRy->A1   joystick V  VRx->A2  VRy->A3  (+5V e GND do Nano)
//          REMOVER D2, VOLTAR D3, SOLUCAO D4 — o outro terminal de cada botão no GND.

const uint8_t EIXOS[4] = {A0, A1, A2, A3};
const char *NOMES[4] = {"H-X", "H-Y", "V-X", "V-Y"};
const uint8_t BOTOES[3] = {2, 3, 4};
const char *NOMES_BOTAO[3] = {"REMOVER", "VOLTAR", "SOLUCAO"};
const int ZONA_MORTA = 200;   // mesma do sketch do jogo

int centro[4];

void setup() {
  Serial.begin(9600);
  for (uint8_t i = 0; i < 3; i++) pinMode(BOTOES[i], INPUT_PULLUP);
  // calibra com os joysticks SOLTOS
  for (uint8_t e = 0; e < 4; e++) {
    long soma = 0;
    for (uint8_t k = 0; k < 8; k++) soma += analogRead(EIXOS[e]);
    centro[e] = soma / 8;
  }
  Serial.print(F("centros: "));
  for (uint8_t e = 0; e < 4; e++) { Serial.print(NOMES[e]); Serial.print('='); Serial.print(centro[e]); Serial.print(' '); }
  Serial.println();
}

void loop() {
  for (uint8_t e = 0; e < 4; e++) {
    int v = analogRead(EIXOS[e]);
    char d = '.';
    bool eixoX = (e % 2 == 0);
    if (v > centro[e] + ZONA_MORTA) d = eixoX ? 'D' : 'B';
    else if (v < centro[e] - ZONA_MORTA) d = eixoX ? 'E' : 'C';
    Serial.print(NOMES[e]); Serial.print('='); Serial.print(v); Serial.print('('); Serial.print(d); Serial.print(F(")  "));
  }
  for (uint8_t i = 0; i < 3; i++) {
    if (digitalRead(BOTOES[i]) == LOW) { Serial.print(NOMES_BOTAO[i]); Serial.print(' '); }
  }
  Serial.println();
  delay(200);
}
