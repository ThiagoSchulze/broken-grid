// Broken Grid — teste dos potenciômetros e botões (antes de fechar a caixa)
//
// Imprime no Monitor Serial (9600 baud), 5 vezes por segundo, a leitura de cada eixo
// (0 a 1023), a faixa em que ela cai e o palito para onde cada controle aponta — a mesma
// divisão em faixas do modo posição de hardware/broken_grid_periferico — além dos botões
// apertados.
//
// Use para conferir o sentido de cada potenciômetro: girar no sentido de "direita" deve
// aumentar a coluna, e no sentido de "baixo" deve aumentar a linha. Se algum eixo andar ao
// contrário, ponha true na posição dele em INVERTER (aqui e no firmware periférico, na
// mesma ordem H-X, H-Y, V-X, V-Y).
//
// Ligação (Arduino Uno): controle H  X->A0  Y->A1   controle V  X->A2  Y->A3
//   cada potenciômetro: pontas no 5V e no GND, perna do meio no pino analógico
//   REMOVER D2, VOLTAR D3, SOLUCAO D4 — o outro terminal de cada botão no GND.

const uint8_t N = 4;
const uint8_t EIXOS[4] = {A0, A1, A2, A3};
const char *NOMES[4] = {"H-X", "H-Y", "V-X", "V-Y"};
const bool INVERTER[4] = {false, false, false, false};   // copie do firmware periférico
// controle H: X escolhe a coluna (0..3), Y a linha (0..4); controle V: X a coluna (0..4), Y a linha (0..3)
const uint8_t FAIXAS[4] = {N, N + 1, N + 1, N};
const uint8_t BOTOES[3] = {2, 3, 4};
const char *NOMES_BOTAO[3] = {"REMOVER", "VOLTAR", "SOLUCAO"};

int lerEixo(uint8_t e) {
  int v = analogRead(EIXOS[e]);
  return INVERTER[e] ? 1023 - v : v;
}

// mesma conta do firmware periférico, sem a histerese
uint8_t faixaDe(int valor, uint8_t faixas) {
  uint8_t f = (int32_t)valor * faixas / 1024;
  return f >= faixas ? faixas - 1 : f;
}

void setup() {
  Serial.begin(9600);
  for (uint8_t i = 0; i < 3; i++) pinMode(BOTOES[i], INPUT_PULLUP);
  Serial.println(F("TESTE_CONTROLES pronto: gire os potenciometros e aperte os botoes"));
}

void loop() {
  uint8_t faixa[4];
  for (uint8_t e = 0; e < 4; e++) {
    int v = lerEixo(e);
    faixa[e] = faixaDe(v, FAIXAS[e]);
    Serial.print(NOMES[e]); Serial.print('='); Serial.print(v);
    Serial.print('('); Serial.print(faixa[e]); Serial.print(F(")  "));
  }
  // palito apontado: h:linha:coluna e v:linha:coluna
  Serial.print(F("-> h:")); Serial.print(faixa[1]); Serial.print(':'); Serial.print(faixa[0]);
  Serial.print(F("  v:")); Serial.print(faixa[3]); Serial.print(':'); Serial.print(faixa[2]);
  Serial.print(F("  "));
  for (uint8_t i = 0; i < 3; i++) {
    if (digitalRead(BOTOES[i]) == LOW) { Serial.print(NOMES_BOTAO[i]); Serial.print(' '); }
  }
  Serial.println();
  delay(200);
}
