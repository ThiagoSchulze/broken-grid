// Uso: node tools/gerar-grades-arduino.mjs
//
// Converte data/grids/4x4.json no bloco GRADES de hardware/broken_grid/broken_grid.ino.
// Cada grade vira duas máscaras de 64 bits (quebrados e bloqueados), indexadas na mesma
// ordem dos LEDs da cadeia — ver o cabeçalho do sketch.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarDataset } from '../src/dataset/loader.js';
import { analisarId, HORIZONTAL } from '../src/core/geometry.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATASET = resolve(RAIZ, 'data/grids/4x4.json');
const SKETCH = resolve(RAIZ, 'hardware/broken_grid/broken_grid.ino');
const N = 4;

const INICIO = '// >>> GRADES';
const FIM = '// <<< GRADES';

function indiceDoLed(id) {
  const { orientacao, linha, coluna } = analisarId(id);
  // corrente em zigue-zague: h:r:c -> r*9 + c, v:r:c -> r*9 + 4 + (4 - c)
  return orientacao === HORIZONTAL ? linha * (2 * N + 1) + coluna : linha * (2 * N + 1) + N + (N - coluna);
}

function mascara(ids) {
  let m = 0n;
  for (const id of ids) m |= 1n << BigInt(indiceDoLed(id));
  return `0x${m.toString(16).toUpperCase().padStart(16, '0')}ULL`;
}

function numeroDaGrade(id) {
  const m = /^g4-(\d{3})$/.exec(id);
  if (!m) throw new Error(`id de grade fora do padrão g4-NNN: ${id}`);
  return Number(m[1]);
}

const dataset = JSON.parse(await readFile(DATASET, 'utf8'));
validarDataset(dataset);
if (dataset.n !== N) throw new Error(`esperava grades ${N}x${N}, veio n=${dataset.n}`);

const linhas = dataset.grids.map((g) =>
  `  {${numeroDaGrade(g.id)}, ${mascara(g.quebrados)}, ${mascara(g.bloqueados)}},  // ${g.id} ${g.dificuldade}`);

const bloco = [
  `${INICIO} (gerado por tools/gerar-grades-arduino.mjs a partir de data/grids/4x4.json)`,
  'struct Grade { uint8_t numero; uint64_t quebrados; uint64_t bloqueados; };',
  `const uint8_t NUM_GRADES = ${dataset.grids.length};`,
  'const Grade GRADES[NUM_GRADES] PROGMEM = {',
  ...linhas,
  '};',
  FIM,
].join('\n');

const sketch = await readFile(SKETCH, 'utf8');
const a = sketch.indexOf(INICIO);
const b = sketch.indexOf(FIM);
if (a < 0 || b < a) throw new Error(`marcadores ${INICIO} / ${FIM} não encontrados em ${SKETCH}`);
await writeFile(SKETCH, sketch.slice(0, a) + bloco + sketch.slice(b + FIM.length));
console.log(`${dataset.grids.length} grades gravadas em ${SKETCH}`);
