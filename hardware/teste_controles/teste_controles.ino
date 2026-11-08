// Broken Grid - teste dos botões (rodar antes de fechar a caixa)
//
// No Monitor Serial (9600 baud), escreve o nome de cada botão quando ele é apertado e
// quando é solto. 5 vezes por segundo mostra também quais estão apertados agora. Serve
// para conferir se cada botão está no pino certo e se nenhum ficou em curto (aparecendo
// apertado sem ninguém mexer).
//
// Ligação (Uno), um terminal do botão no pino e o outro no GND:
//   REMOVER D2, VOLTAR D3, SOLUCAO D4, NOVO D5, DIREITA D7, BAIXO D8
// (D6 fica para os LEDs)

const uint8_t NUM_BOTOES = 6;
const uint8_t BOTOES[NUM_BOTOES] = {2, 3, 4, 5, 7, 8};
const char *NOMES_BOTAO[NUM_BOTOES] = {"REMOVER", "VOLTAR", "SOLUCAO", "NOVO", "DIREITA", "BAIXO"};
const uint16_t DEBOUNCE_MS = 25;
const uint16_t RESUMO_MS = 200;

bool apertado[NUM_BOTOES];
bool leituraAnterior[NUM_BOTOES];
uint32_t mudouEm[NUM_BOTOES];
uint32_t proximoResumo = 0;

void setup() {
  Serial.begin(9600);
  for (uint8_t i = 0; i < NUM_BOTOES; i++) {
    pinMode(BOTOES[i], INPUT_PULLUP);
    apertado[i] = leituraAnterior[i] = false;
    mudouEm[i] = 0;
  }
  Serial.println(F("TESTE_CONTROLES pronto: aperte os botoes"));
}

void loop() {
  uint32_t agora = millis();
  for (uint8_t i = 0; i < NUM_BOTOES; i++) {
    bool leitura = digitalRead(BOTOES[i]) == LOW;  // INPUT_PULLUP: apertado = LOW
    if (leitura != leituraAnterior[i]) { leituraAnterior[i] = leitura; mudouEm[i] = agora; }
    if (agora - mudouEm[i] >= DEBOUNCE_MS && leitura != apertado[i]) {
      apertado[i] = leitura;
      Serial.print(NOMES_BOTAO[i]);
      Serial.print(F(" (D"));
      Serial.print(BOTOES[i]);
      Serial.println(leitura ? F(") apertado") : F(") solto"));
    }
  }
  if ((int32_t)(agora - proximoResumo) >= 0) {
    proximoResumo = agora + RESUMO_MS;
    bool algum = false;
    for (uint8_t i = 0; i < NUM_BOTOES; i++) {
      if (!apertado[i]) continue;
      if (!algum) Serial.print(F("  segurando: "));
      Serial.print(NOMES_BOTAO[i]);
      Serial.print(' ');
      algum = true;
    }
    if (algum) Serial.println();
  }
}
