import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { messageErreurAuth } from '../utils/authErrors';

/**
 * Renvoi de l'e-mail de confirmation, avec délai d'attente de 60 s entre deux envois
 * (Supabase limite aussi les envois par adresse).
 */
export default function ResendConfirmation({ email, initialCooldown = 0 }) {
  const { resendConfirmation } = useAuth();
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'ok' | 'error', text }

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email || sending || cooldown > 0) return;
    setSending(true);
    setFeedback(null);
    const { error } = await resendConfirmation(email);
    setSending(false);
    if (error) {
      setFeedback({ type: 'error', text: messageErreurAuth(error, 'inscription') });
      // Évite les clics en rafale quand Supabase limite déjà les envois
      if (error.status === 429 || (error.code || '').startsWith('over_')) setCooldown(60);
    } else {
      setFeedback({
        type: 'ok',
        text: `E-mail renvoyé à ${email}. Pensez à vérifier vos courriers indésirables.`,
      });
      setCooldown(60);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleResend}
        disabled={!email || sending || cooldown > 0}
        className="btn-secondary w-full text-sm"
      >
        {sending
          ? 'Envoi en cours...'
          : cooldown > 0
          ? `Renvoyer l'e-mail (${cooldown} s)`
          : "Renvoyer l'e-mail de confirmation"}
      </button>
      {feedback && (
        <p
          role="status"
          className={`text-sm rounded-lg p-3 ${
            feedback.type === 'ok'
              ? 'bg-success-600/20 border border-success-600/40 text-success-400'
              : 'bg-danger/20 border border-danger/40 text-danger'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
