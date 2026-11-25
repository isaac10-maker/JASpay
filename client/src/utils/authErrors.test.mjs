// Tests locaux : messageErreurAuth
// Usage : node client/src/utils/authErrors.test.mjs
//
// authErrors.js est un module ES sans dependance a React : il est importable
// directement par Node (package.json contient "type": "module").

import { messageErreurAuth, MESSAGE_SERVICE_INDISPONIBLE } from './authErrors.js';

let pass = 0, fail = 0;

function check(label, actual, attendu) {
  const ok = actual === attendu;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}`);
  if (!ok) console.log(`         attendu=${JSON.stringify(attendu)}\n         obtenu =${JSON.stringify(actual)}`);
}

/** Reproduit exactement l'erreur observee en production. */
const erreurProd = Object.assign(new Error('{}'), {
  name: 'AuthRetryableFetchError',
  status: 500,
});

check(
  'E1  erreur prod {message:"{}", status:500, name:AuthRetryableFetchError}',
  messageErreurAuth(erreurProd, 'inscription'),
  MESSAGE_SERVICE_INDISPONIBLE
);

check(
  'E2  message "{}" sans name ni status -> repli inscription',
  messageErreurAuth({ message: '{}' }, 'inscription'),
  "L'inscription n'a pas pu aboutir. Réessayez dans quelques instants."
);

check(
  'E3  message "[]" -> repli connexion',
  messageErreurAuth({ message: '[]' }, 'connexion'),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

check(
  'E4  message "   " (espaces seuls) -> repli',
  messageErreurAuth({ message: '   ' }, 'connexion'),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

check(
  'E5  message vide -> repli',
  messageErreurAuth({ message: '' }, 'inscription'),
  "L'inscription n'a pas pu aboutir. Réessayez dans quelques instants."
);

check(
  'E6  err null -> repli',
  messageErreurAuth(null, 'connexion'),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

check(
  'E7  err undefined -> repli',
  messageErreurAuth(undefined, 'inscription'),
  "L'inscription n'a pas pu aboutir. Réessayez dans quelques instants."
);

check(
  'E8  status 503 -> message service',
  messageErreurAuth({ status: 503, message: 'unavailable' }, 'connexion'),
  MESSAGE_SERVICE_INDISPONIBLE
);

check(
  'E9  invalid_credentials (code)',
  messageErreurAuth({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }, 'connexion'),
  'Adresse e-mail ou mot de passe incorrect.'
);

check(
  'E10 message anglais "Invalid login credentials" sans code',
  messageErreurAuth({ message: 'Invalid login credentials' }, 'connexion'),
  'Adresse e-mail ou mot de passe incorrect.'
);

check(
  'E11 email_not_confirmed (code)',
  messageErreurAuth({ code: 'email_not_confirmed', status: 400 }, 'connexion'),
  "Votre adresse e-mail n'a pas encore été confirmée. Vérifiez votre boîte de réception."
);

check(
  'E12 user_already_exists (code)',
  messageErreurAuth({ code: 'user_already_exists', status: 422 }, 'inscription'),
  'Un compte existe déjà avec cette adresse e-mail.'
);

check(
  'E13 weak_password (code)',
  messageErreurAuth({ code: 'weak_password', status: 422 }, 'inscription'),
  "Le mot de passe choisi n'est pas assez robuste."
);

check(
  'E14 over_email_send_rate_limit (code)',
  messageErreurAuth({ code: 'over_email_send_rate_limit', status: 429 }, 'inscription'),
  "Trop d'e-mails ont été envoyés récemment. Réessayez dans quelques minutes."
);

check(
  'E15 statut 429 sans code',
  messageErreurAuth({ status: 429, message: 'x' }, 'connexion'),
  'Trop de tentatives. Réessayez dans quelques minutes.'
);

check(
  'E16 statut 400 sans code',
  messageErreurAuth({ status: 400, message: 'x' }, 'connexion'),
  'Les informations saisies ne sont pas valides.'
);

check(
  'E17 message francais custom conserve tel quel',
  messageErreurAuth({ message: 'Mot de passe trop court.' }, 'inscription'),
  'Mot de passe trop court.'
);

check(
  'E18 "[object Object]" -> repli (jamais affiche)',
  messageErreurAuth({ message: '[object Object]' }, 'connexion'),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

check(
  'E19 "Failed to fetch" -> repli',
  messageErreurAuth({ message: 'Failed to fetch' }, 'connexion'),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

check(
  'E20 "null" (chaine) -> repli',
  messageErreurAuth({ message: 'null' }, 'connexion'),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

check(
  'E21 contexte par defaut = connexion',
  messageErreurAuth({ message: '{}' }),
  'La connexion a échoué. Réessayez dans quelques instants.'
);

// --- Invariant global : aucune sortie inaffichable ---
const entrees = [
  erreurProd, {}, { message: '{}' }, { message: '[]' }, { message: '' },
  { message: null }, { message: 42 }, { status: 500 }, { status: 418 },
  null, undefined, 'chaine', 0, { code: 'inconnu', message: '{}' },
];
let invariantOk = true;
for (const e of entrees) {
  for (const ctx of ['inscription', 'connexion', 'reinitialisation', undefined]) {
    const out = messageErreurAuth(e, ctx);
    if (typeof out !== 'string' || out.trim() === '' || out === '{}' || out === '[]' || out === '[object Object]' || out === 'null' || out === 'undefined') {
      invariantOk = false;
      console.log(`  INVARIANT VIOLE : entree=${JSON.stringify(e)} ctx=${ctx} sortie=${JSON.stringify(out)}`);
    }
  }
}
check('E22 invariant : jamais {} / [] / vide sur 15 entrees x 4 contextes', invariantOk, true);

console.log('='.repeat(74));
console.log(`RESULTAT : ${pass} PASS / ${fail} FAIL  (total ${pass + fail})`);
console.log('='.repeat(74));
process.exit(fail === 0 ? 0 : 1);
