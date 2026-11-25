// JASpay — Banc de tests locaux : validateReference + isValidDecimal
// Les fonctions sont EXTRAITES du fichier source reel, pas recopiees :
// toute divergence entre le fichier et le test est donc impossible.
//
// Usage : node supabase/functions/_proposed/test-transactions-fixes.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '..', 'jaspay-transactions', 'index.js');
const src = readFileSync(SOURCE, 'utf8');

// --- Extraction du code reel ---
function extractBlock(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Fonction ${name} introuvable`);
  let depth = 0, started = false, i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const regexLine = src.match(/const REFERENCE_REGEX = .*/)[0];
const prefixLine = src.match(/const REFERENCE_PREFIX_BY_TYPE = .*/)[0];

const factory = new Function(
  regexLine + '\n' +
  prefixLine + '\n' +
  extractBlock('validateReference') + '\n' +
  extractBlock('isValidDecimal') + '\n' +
  'return { validateReference, isValidDecimal, REFERENCE_REGEX };'
);
const { validateReference, isValidDecimal } = factory();

// --- Mini framework ---
let pass = 0, fail = 0;
const results = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}`);
  if (!ok) console.log(`         attendu=${JSON.stringify(expected)} obtenu=${JSON.stringify(actual)}`);
}

console.log('='.repeat(74));
console.log('REFERENCE_REGEX extraite du fichier source :');
console.log('  ' + regexLine);
console.log('='.repeat(74));

// --- A / B : validation des references ---
// Convention : validateReference renvoie null si valide, un message sinon.
const ACCEPTE = null;

check(
  'C1  DEP-251121-A1B2C3D4 (reference valide)',
  validateReference('DEP-251121-A1B2C3D4', 'deposit'),
  ACCEPTE
);

check(
  'C2  espace AVANT -> rejetee',
  validateReference(' DEP-251121-A1B2C3D4', 'deposit'),
  'Format de référence invalide'
);

check(
  'C3  espace APRES -> rejetee',
  validateReference('DEP-251121-A1B2C3D4 ', 'deposit'),
  'Format de référence invalide'
);

check(
  'C4  minuscules -> rejetee',
  validateReference('dep-251121-a1b2c3d4', 'deposit'),
  'Format de référence invalide'
);

// --- Controles de non-regression sur les autres regles metier ---
check(
  'C5  WDR valide avec type withdrawal -> acceptee',
  validateReference('WDR-251121-A1B2C3D4', 'withdrawal'),
  ACCEPTE
);

check(
  'C6  prefixe incompatible (DEP avec type withdrawal) -> rejetee',
  validateReference('DEP-251121-A1B2C3D4', 'withdrawal'),
  'Référence incompatible avec le type de transaction'
);

check(
  'C7  WDR avec type deposit -> rejetee',
  validateReference('WDR-251121-A1B2C3D4', 'deposit'),
  'Référence incompatible avec le type de transaction'
);

check(
  'C8  5 chiffres au lieu de 6 -> rejetee',
  validateReference('DEP-25112-A1B2C3D4', 'deposit'),
  'Format de référence invalide'
);

check(
  'C9  7 chiffres au lieu de 6 -> rejetee',
  validateReference('DEP-2511210-A1B2C3D4', 'deposit'),
  'Format de référence invalide'
);

check(
  'C10 hexa minuscule en fin -> rejetee',
  validateReference('DEP-251121-a1b2c3d4', 'deposit'),
  'Format de référence invalide'
);

check(
  'C11 7 caracteres hexa au lieu de 8 -> rejetee',
  validateReference('DEP-251121-A1B2C3D', 'deposit'),
  'Format de référence invalide'
);

check(
  'C12 non-chaine (number) -> rejetee',
  validateReference(12345, 'deposit'),
  'Référence de transaction invalide'
);

check(
  'C13 non-chaine (null) -> rejetee',
  validateReference(null, 'deposit'),
  'Référence de transaction invalide'
);

check(
  'C14 tabulation avant -> rejetee',
  validateReference('\tDEP-251121-A1B2C3D4', 'deposit'),
  'Format de référence invalide'
);

check(
  'C15 saut de ligne apres -> rejetee',
  validateReference('DEP-251121-A1B2C3D4\n', 'deposit'),
  'Format de référence invalide'
);

check(
  'C16 type inconnu -> pas de controle de prefixe, format seul',
  validateReference('DEP-251121-A1B2C3D4', 'autre'),
  ACCEPTE
);

// --- C : validation des montants ---
check('M1  5000.00 -> accepte', isValidDecimal('5000.00'), true);
check('M2  12.345 -> rejete', isValidDecimal('12.345'), false);
check('M3  abc -> rejete', isValidDecimal('abc'), false);

// --- Non-regression supplementaire ---
check('M4  5000 -> accepte', isValidDecimal('5000'), true);
check('M5  5000.5 -> accepte', isValidDecimal('5000.5'), true);
check('M6  0 -> rejete (doit etre > 0)', isValidDecimal('0'), false);
check('M7  -100 -> rejete', isValidDecimal('-100'), false);
check('M8  chaine vide -> rejete', isValidDecimal(''), false);
check('M9  12. -> rejete', isValidDecimal('12.'), false);
check('M10 .50 -> rejete', isValidDecimal('.50'), false);
check('M11 5000.00 (number) -> accepte', isValidDecimal(5000.0), true);
check('M12 null -> rejete', isValidDecimal(null), false);
check('M13 Infinity -> rejete', isValidDecimal(Infinity), false);

console.log('='.repeat(74));
console.log(`RESULTAT : ${pass} PASS / ${fail} FAIL  (total ${pass + fail})`);
console.log('='.repeat(74));
process.exit(fail === 0 ? 0 : 1);
