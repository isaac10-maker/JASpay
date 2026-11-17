/**
 * Starfield — Fond étoilé spatial immersif pour JASpay
 *
 * Réalisation CSS pure sans image ni vidéo lourde.
 * Respect de prefers-reduced-motion pour l'accessibilité.
 * Performant sur mobile et desktop.
 */
import { useEffect, useState } from 'react';

const STAR_COUNT_1 = 150;
const STAR_COUNT_2 = 80;
const STAR_COUNT_3 = 40;

function randomPosition(max) {
  return Math.floor(Math.random() * max);
}

function generateStarShadows(count, size) {
  const shadows = [];
  for (let i = 0; i < count; i++) {
    const x = randomPosition(2000);
    const y = randomPosition(2000);
    const opacity = (0.3 + Math.random() * 0.7).toFixed(2);
    const color = Math.random() > 0.8 ? '#a5f3fc' : '#ffffff'; // quelques étoiles bleu clair
    shadows.push(`${x}px ${y}px ${color}`);
  }
  return shadows.join(',\n    ');
}

export default function Starfield() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const animationStyle = reducedMotion ? 'none' : 'animStar linear infinite';

  return (
    <>
      {/* Couche d'étoiles petites et nombreuses */}
      <div
        id="stars1"
        className="fixed inset-0 z-[-1] pointer-events-none"
        style={{
          width: '1px',
          height: '1px',
          background: 'transparent',
          boxShadow: generateStarShadows(STAR_COUNT_1, 1),
          animation: animationStyle,
          animationDuration: '50s',
        }}
      />

      {/* Couche d'étoiles moyennes */}
      <div
        id="stars2"
        className="fixed inset-0 z-[-1] pointer-events-none"
        style={{
          width: '2px',
          height: '2px',
          background: 'transparent',
          boxShadow: generateStarShadows(STAR_COUNT_2, 2),
          animation: animationStyle,
          animationDuration: '100s',
        }}
      />

      {/* Couche d'étoiles grosses et rares */}
      <div
        id="stars3"
        className="fixed inset-0 z-[-1] pointer-events-none"
        style={{
          width: '3px',
          height: '3px',
          background: 'transparent',
          boxShadow: generateStarShadows(STAR_COUNT_3, 3),
          animation: animationStyle,
          animationDuration: '150s',
        }}
      />

      <style>
        {`
          @keyframes animStar {
            from { transform: translateY(0); }
            to { transform: translateY(-2000px); }
          }
        `}
      </style>
    </>
  );
}
