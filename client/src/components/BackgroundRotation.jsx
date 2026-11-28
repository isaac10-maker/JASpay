/**
 * BackgroundRotation — Arrière-plan dynamique avec visuels sportifs interchangeables.
 *
 * Respect du prompt directeur JASpay :
 * - 4 illustrations sportives (football/stade, ballon, univers paris, transactions numériques)
 * - Rotation automatique toutes les 5 minutes
 * - Transition douce entre les illustrations
 * - Arrière-plan légèrement transparent
 * - Panneaux avec effet Glassmorphism modéré
 * - Scènes sportives réelles (WebP, ~90 Ko chacune) au lieu de SVG abstraits
 * - Zoom lent continu (Ken Burns) sur la scène active, coupé sous
 *   prefers-reduced-motion
 */

import { useState, useEffect } from 'react';

import LeagueStrip from './LeagueStrip';
import sceneFootball from '../assets/images/scenes/football/scene-football.webp';
import sceneBasketball from '../assets/images/scenes/basketball/scene-basketball.webp';
import sceneTennis from '../assets/images/scenes/tennis/scene-tennis.webp';
import sceneGolf from '../assets/images/scenes/golf/scene-golf.webp';

/**
 * Scènes sportives — versions WebP (1280 px de large, ~90 Ko chacune) générées
 * à partir des PNG d'origine (1075 × 600, 716 Ko à 1,05 Mo). Les quatre scènes
 * en PNG pesaient 3,71 Mo : inutilisable en fond de page. En WebP : 321 Ko au
 * total, la qualité reste bonne pour un visuel flouté en arrière-plan.
 */
const ILLUSTRATIONS = [
  { id: 'football', src: sceneFootball, alt: 'Stade de football illuminé la nuit', colors: ['#0f172a', '#0c4a6e'] },
  { id: 'basketball', src: sceneBasketball, alt: 'Terrain de basketball', colors: ['#0f172a', '#1e3a8a'] },
  { id: 'tennis', src: sceneTennis, alt: 'Court de tennis', colors: ['#0f172a', '#064e3b'] },
  { id: 'golf', src: sceneGolf, alt: 'Green de golf', colors: ['#0f172a', '#14532d'] },
];

export default function BackgroundRotation() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Respect de prefers-reduced-motion : ni rotation, ni zoom si l'utilisateur
  // a demande la reduction des mouvements.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;

    // Rotation automatique toutes les 5 minutes (300 000 ms)
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ILLUSTRATIONS.length);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [reducedMotion]);

  const illustration = ILLUSTRATIONS[currentIndex];

  return (
    <div className="fixed inset-0 z-[-1] bg-space-900 overflow-hidden" aria-hidden="true">
      {/* Scène courante — toutes préchargées et empilées en fondu, pour que la
          rotation (5 min) ne déclenche aucun chargement visible. */}
      {ILLUSTRATIONS.map((scene, i) => (
        <img
          key={scene.id}
          src={scene.src}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1200ms] ease-in-out ${
            !reducedMotion && i === currentIndex ? 'scene-kenburns' : ''
          }`}
          style={{
            opacity: i === currentIndex ? 0.32 : 0,
            animationPlayState: i === currentIndex ? 'running' : 'paused',
          }}
        />
      ))}

      {/* Voile dégradé : garantit la lisibilité du texte au-dessus */}
      <div className="absolute inset-0 bg-gradient-to-b from-space-900/80 via-space-900/70 to-space-900" />

      {/* Championnats en pied de visuel, comme sur la référence 1xBet.
          Très effacés et dégradés vers le haut : ils font partie de
          l'arrière-plan, ils ne doivent pas gêner la lecture des cartes qui
          passent au-dessus. */}
      <div
        className="absolute inset-x-0 bottom-4 sm:bottom-8 flex justify-center"
        style={{ WebkitMaskImage: 'linear-gradient(to top, black 55%, transparent)', maskImage: 'linear-gradient(to top, black 55%, transparent)' }}
      >
        <LeagueStrip />
      </div>

      {/* Motif géométrique discret */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNCkiLz48L3N2Zz4=')] opacity-40 pointer-events-none" />
    </div>
  );
}
