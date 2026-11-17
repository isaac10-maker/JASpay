/**
 * BackgroundRotation — Arrière-plan dynamique avec visuels sportifs interchangeables.
 *
 * Respect du prompt directeur JASpay :
 * - 4 illustrations sportives (football/stade, ballon, univers paris, transactions numériques)
 * - Rotation automatique toutes les 5 minutes
 * - Transition douce entre les illustrations
 * - Arrière-plan légèrement transparent
 * - Panneaux avec effet Glassmorphism modéré
 * - Pas d'images trop lourdes (SVG intégrés, pas de fichiers externes lourds)
 */

import { useState, useEffect } from 'react';

const ILLUSTRATIONS = [
  {
    id: 'football-stade',
    label: 'Football et stade',
    colors: ['#0f172a', '#1e293b'],
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none">
        <!-- Stade stylisé -->
        <rect x="20" y="80" width="160" height="60" rx="8" fill="#38bdf8" opacity="0.15"/>
        <path d="M20 80 L20 140 L180 140 L180 80" stroke="#38bdf8" stroke-width="2" opacity="0.3"/>
        <!-- Ballon de football -->
        <circle cx="100" cy="100" r="24" fill="#38bdf8" opacity="0.9"/>
        <path d="M82 100 L118 100 M100 82 L100 118" stroke="white" stroke-width="2" opacity="0.8"/>
        <circle cx="100" cy="100" r="4" fill="white"/>
      </svg>
    `,
  },
  {
    id: 'ballon-sportif',
    label: 'Ballon de football dans un environnement sportif',
    colors: ['#0f172a', '#1e293b'],
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none">
        <!-- Terrain -->
        <rect x="10" y="10" width="180" height="180" rx="12" fill="#16a34a" opacity="0.1"/>
        <!-- Ballon -->
        <circle cx="100" cy="100" r="34" fill="#38bdf8" opacity="0.85"/>
        <path d="M72 100 L128 100 M100 72 L100 128" stroke="white" stroke-width="3" opacity="0.9"/>
        <circle cx="100" cy="100" r="6" fill="white"/>
        <path d="M85 85 Q100 70 115 85" stroke="white" stroke-width="2" fill="none" opacity="0.7"/>
        <path d="M85 115 Q100 130 115 115" stroke="white" stroke-width="2" fill="none" opacity="0.7"/>
      </svg>
    `,
  },
  {
    id: 'univers-paris',
    label: 'Univers des paris sportifs',
    colors: ['#0f172a', '#1e293b'],
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none">
        <!-- Tickets de pari stylisés -->
        <rect x="40" y="60" width="50" height="80" rx="6" fill="#38bdf8" opacity="0.2"/>
        <rect x="110" y="40" width="50" height="100" rx="6" fill="#38bdf8" opacity="0.3"/>
        <rect x="75" y="80" width="50" height="60" rx="6" fill="#38bdf8" opacity="0.4"/>
        <!-- Cote -->
        <text x="65" y="105" font-family="monospace" font-size="14" fill="#38bdf8" opacity="0.9">2.50</text>
        <text x="135" y="90" font-family="monospace" font-size="14" fill="#38bdf8" opacity="0.9">1.85</text>
        <text x="100" y="110" font-family="monospace" font-size="14" fill="#38bdf8" opacity="0.9">3.20</text>
      </svg>
    `,
  },
  {
    id: 'transactions-paiements',
    label: 'Transactions et paiements numériques',
    colors: ['#0f172a', '#1e293b'],
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none">
        <!-- Téléphone mobile -->
        <rect x="70" y="40" width="60" height="110" rx="12" fill="#38bdf8" opacity="0.2"/>
        <rect x="76" y="46" width="48" height="16" rx="4" fill="#38bdf8" opacity="0.4"/>
        <!-- Flèches de transaction -->
        <path d="M90 80 L110 80 L100 90 Z" fill="#38bdf8" opacity="0.8"/>
        <path d="M110 80 L110 100 L120 100 Z" fill="#38bdf8" opacity="0.8"/>
        <!-- Symboles XOF -->
        <text x="85" y="140" font-family="monospace" font-size="16" fill="#38bdf8" opacity="0.9">XOF</text>
        <path d="M80 120 L120 120 M100 120 L100 140" stroke="#38bdf8" stroke-width="2" opacity="0.5"/>
      </svg>
    `,
  },
];

export default function BackgroundRotation() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Rotation automatique toutes les 5 minutes (300 000 ms)
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ILLUSTRATIONS.length);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const illustration = ILLUSTRATIONS[currentIndex];

  return (
    <div className="fixed inset-0 z-[-1] bg-marine-900">
      {/* Couche de fond animée */}
      <div className="absolute inset-0 opacity-30">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={illustration.colors[0]} />
              <stop offset="100%" stopColor={illustration.colors[1]} />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#bgGradient)" />
        </svg>
      </div>

      {/* Illustration sportive centrée (légèrement transparente) */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 opacity-40 animate-fade-in"
        style={{ transition: 'opacity 0.8s ease, transform 0.8s ease' }}
      >
        <div className="w-full h-full">
          {illustration.svg}
        </div>
      </div>

      {/* Motif géométrique discret */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNCkiLz48L3N2Zz4=')] opacity-40 pointer-events-none" />
    </div>
  );
}
