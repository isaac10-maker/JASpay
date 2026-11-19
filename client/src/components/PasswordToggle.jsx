import { useState } from 'react';

/**
 * PasswordToggle — Champ de saisie de mot de passe avec icône œil pour afficher/masquer.
 * Respect de l'accessibilité et du thème spatial JASpay.
 */
export default function PasswordToggle({ value, onChange, placeholder, autoComplete, required, minLength, disabled }) {
  const [showPassword, setShowPassword] = useState(false);

  const togglePassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        className="input-field input-field-dark pr-12"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={togglePassword}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-electric-400 transition-colors focus:outline-none focus:text-electric-400 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {showPassword ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7 -1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 -1.274 4.057 5.064 7 9.542 7m11.568-7c-1.274-4.057-5.064-7-9.542-7-4.478 0-8.268 2.943-9.542 7m11.568 7c-1.274-4.057-5.064-7-9.542-7-4.478 0-8.268 2.943-9.542 7m0 0 .204.204A1 1 0 0015.34 20.466c1.03-.61 1.74-1.73 1.977-3 .237-1.282.237-2.582 0-3.864-.237-1.27-.947-2.39-1.977-3 -.237-.127-.51-.192-.782-.192-.272 0-.545.065-.782.192m0 0 .204.204A1 1 0 0015.34 20.466c1.03-.61 1.74-1.73 1.977-3 .237-1.282.237-2.582 0-3.864-.237-1.27-.947-2.39-1.977-3 -.237-.127-.51-.192-.782-.192-.272 0-.545.065-.782.192m0 0 .204.204" />
          </svg>
        )}
      </button>
    </div>
  );
}
