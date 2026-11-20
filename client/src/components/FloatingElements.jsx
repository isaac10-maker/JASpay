/**
 * FloatingElements — Éléments décoratifs flottants en arrière-plan.
 *
 * Affiche les scènes sportives et les objets (ballons, trophées, jetons)
 * avec des animations de flottement et de rotation douce.
 * Utilise les ressources PNG créées à l'étape 3.
 *
 * Respect de prefers-reduced-motion : les animations se désactivent
 * si l'utilisateur a demandé la réduction des mouvements.
 */
import { useEffect, useState } from 'react';
import ballFootball from '../assets/images/objects/ball-football/ball-football.png';
import ballBasketball from '../assets/images/objects/ball-basketball/ball-basketball.png';
import ballTennis from '../assets/images/objects/ball-tennis/ball-tennis.png';
import ballGolf from '../assets/images/objects/ball-golf/ball-golf.png';

const ELEMENTS = [
  {
    id: 'ball-football',
    src: ballFootball,
    alt: 'Ballon de football décoratif',
    width: 120,
    height: 66,
    top: '10%',
    left: '5%',
    animation: 'float-slow',
    delay: '0s',
  },
  {
    id: 'ball-basketball',
    src: ballBasketball,
    alt: 'Ballon de basketball décoratif',
    width: 100,
    height: 55,
    top: '20%',
    left: '85%',
    animation: 'float-slow-delayed',
    delay: '2s',
  },
  {
    id: 'ball-tennis',
    src: ballTennis,
    alt: 'Balle de tennis décorative',
    width: 60,
    height: 33,
    top: '45%',
    left: '3%',
    animation: 'float-slow',
    delay: '4s',
  },
  {
    id: 'ball-golf',
    src: ballGolf,
    alt: 'Balle de golf décorative',
    width: 45,
    height: 25,
    top: '55%',
    left: '90%',
    animation: 'float-slow-delayed',
    delay: '6s',
  },
];

export default function FloatingElements() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {ELEMENTS.map((el) => (
        <img
          key={el.id}
          src={el.src}
          alt={el.alt}
          className={`absolute ${reducedMotion ? 'opacity-20' : el.animation} opacity-60`}
          style={{
            top: el.top,
            left: el.left,
            width: `${el.width}px`,
            height: `${el.height}px`,
            animationDelay: reducedMotion ? '0s' : el.delay,
          }}
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
}
