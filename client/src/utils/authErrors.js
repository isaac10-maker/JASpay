/**
 * JASpay — Traduction des erreurs Supabase Auth en messages lisibles.
 *
 * Probleme resolu : `AuthRetryableFetchError` (reponse 5xx sans corps JSON
 * exploitable) expose `message = "{}"`. Comme cette chaine est "truthy",
 * un `err.message || "defaut"` n'affiche jamais le message de repli et
 * l'utilisateur voit litteralement `{}` a l'ecran.
 *
 * Regles :
 *   - ne JAMAIS retourner "{}", "[]" ou une chaine vide ;
 *   - 5xx et AuthRetryableFetchError -> message technique generique ;
 *   - erreurs utilisateur identifiables -> message adapte et precis.
 *
 * Ce module ne modifie aucun comportement d'authentification :
 * il ne fait que transformer un objet d'erreur en texte affichable.
 */

/** Message de repli pour les pannes de service (5xx, reseau). */
export const MESSAGE_SERVICE_INDISPONIBLE =
  "Le service d'authentification est momentanément indisponible. Réessayez dans quelques instants.";

/** Erreurs portant un `code` Supabase stable. */
const MESSAGES_PAR_CODE = {
  invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
  email_not_confirmed:
    "Votre adresse e-mail n'a pas encore été confirmée. Vérifiez votre boîte de réception.",
  email_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  weak_password: "Le mot de passe choisi n'est pas assez robuste.",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  over_email_send_rate_limit:
    "Trop d'e-mails ont été envoyés récemment. Réessayez dans quelques minutes.",
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  over_sms_send_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  signup_disabled: 'La création de compte est temporairement désactivée.',
  email_provider_disabled: "L'inscription par e-mail est temporairement désactivée.",
  otp_expired: 'Ce lien a expiré. Demandez-en un nouveau.',
  session_not_found: 'Votre session a expiré. Reconnectez-vous.',
  validation_failed: "Les informations saisies ne sont pas valides.",
};

/** Erreurs sans `code` mais avec un statut HTTP exploitable. */
const MESSAGES_PAR_STATUT = {
  400: "Les informations saisies ne sont pas valides.",
  401: 'Adresse e-mail ou mot de passe incorrect.',
  403: "Cette action n'est pas autorisée.",
  422: "Cette adresse e-mail ou ce mot de passe n'est pas accepté.",
  429: 'Trop de tentatives. Réessayez dans quelques minutes.',
};

/** Vrai si la chaine n'est pas affichable telle quelle a l'utilisateur. */
function estInaffichable(texte) {
  if (typeof texte !== 'string') return true;
  const t = texte.trim();
  return (
    t === '' ||
    t === '{}' ||
    t === '[]' ||
    t === 'null' ||
    t === 'undefined' ||
    t === '[object Object]' ||
    t === 'Failed to fetch'
  );
}

/** Vrai si l'erreur signale un probleme de service (5xx ou reseau). */
function estErreurDeService(err) {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  if (typeof err.status === 'number' && err.status >= 500) return true;
  return false;
}

/**
 * Transforme une erreur Supabase Auth en message affichable.
 *
 * @param {unknown} err   Erreur retournee par supabase.auth.* (ou levee).
 * @param {string}  [contexte] 'inscription' | 'connexion' | 'reinitialisation'.
 *                            Sert uniquement a choisir un repli plus pertinent.
 * @returns {string} Toujours une chaine non vide, jamais "{}" ni "[]".
 */
export function messageErreurAuth(err, contexte = 'connexion') {
  const repliParContexte = {
    inscription:
      "L'inscription n'a pas pu aboutir. Réessayez dans quelques instants.",
    connexion: 'La connexion a échoué. Réessayez dans quelques instants.',
    reinitialisation:
      "La demande de réinitialisation n'a pas pu aboutir. Réessayez dans quelques instants.",
  };
  const repli = repliParContexte[contexte] || repliParContexte.connexion;

  if (!err) return repli;

  // 1. Panne de service : priorite absolue, le detail n'est pas actionnable.
  if (estErreurDeService(err)) return MESSAGE_SERVICE_INDISPONIBLE;

  // 2. Erreur identifiable par son code Supabase.
  if (typeof err.code === 'string' && MESSAGES_PAR_CODE[err.code]) {
    return MESSAGES_PAR_CODE[err.code];
  }

  // 3. Erreur identifiable par son statut HTTP (hors 5xx, deja traites).
  if (typeof err.status === 'number' && MESSAGES_PAR_STATUT[err.status]) {
    return MESSAGES_PAR_STATUT[err.status];
  }

  // 4. Message texte exploitable fourni par Supabase.
  const brut = typeof err.message === 'string' ? err.message.trim() : '';
  if (!estInaffichable(brut)) {
    // Certains messages Supabase sont en anglais : on les traduit au passage.
    const bas = brut.toLowerCase();
    if (bas.includes('invalid login credentials')) {
      return MESSAGES_PAR_CODE.invalid_credentials;
    }
    if (bas.includes('email not confirmed')) {
      return MESSAGES_PAR_CODE.email_not_confirmed;
    }
    if (bas.includes('user already registered')) {
      return MESSAGES_PAR_CODE.user_already_exists;
    }
    if (bas.includes('too many requests') || bas.includes('rate limit')) {
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    }
    return brut;
  }

  // 5. Rien d'exploitable (cas "{}") : repli contextuel.
  return repli;
}

export default messageErreurAuth;
