# JASpay — Ressources graphiques

Ce répertoire contient toutes les ressources visuelles de la refonte immersive JASpay (univers spatial, scènes sportives, logos bookmakers, éléments financiers, animations).

## Structure

```
client/src/assets/
├── images/                    # PNG transparents
│   ├── logos/                 # Logos (JASpay, bookmakers, opérateurs)
│   ├── scenes/                # Scènes sportives (football, basketball, tennis, golf)
│   ├── objects/               # Objets détourés (ballons, trophées, jetons, billets)
│   └── financial/             # Éléments financiers (symbole XOF, pièces, billets décoratifs)
├── svgs/                      # Illustrations vectorielles
│   ├── background-rotation/   # Remplace les SVG intégrés de BackgroundRotation.jsx
│   └── glitch/                # Effets glitch et scanlines
└── animations/                # Keyframes CSS (float, fade-in-up, pulse, glitch, rotate-slow)
```

## Règles absolues

1. **Aucune imitation de logo officiel** : les logos 1xBet, MelBet, 1Win, Wallisbet, Mixx by Yas et Flooz doivent être officiels ou des emplacements temporaires clairement identifiés.
2. **Aucun faux billet officiel** : pas de reproduction de billets FCFA/XOF avec effigie ou numéro de série.
3. **Aucun PNG présenté comme une animation** : les animations sont en CSS/SVG uniquement.
4. **Aucune modification de logique métier** : ce répertoire ne touche pas à Supabase, Edge Functions, SQL, RLS, ni aux règles de transaction.

## Statut actuel (étape 2 terminée)

- Arborescence créée
- Fichiers README dans chaque répertoire de logo manquant (identifient clairement l'emplacement temporaire)
- Fichiers CSS d'animation créés (float, fade-in-up, pulse, glitch, rotate-slow)
- Fichiers SVG de background-rotation créés (remplacent les SVG intégrés actuels)
- Manifeste des ressources : `client/src/assets/resources-manifest.json`

## Prochaines ressources à produire

1. Vérifier les sources officielles pour les 6 logos manquants (1xBet, MelBet, 1Win, Wallisbet, Mixx by Yas, Flooz)
2. Créer les visuels originaux : 4 scènes sportives, 8 objets, 3 éléments financiers
3. Créer le logo JASpay (après vérification qu'aucun logo existant n'est réutilisable)
4. Intégrer dans les composants React (étape 5 du plan, pas encore commencée)

## Fichiers à ne pas modifier

Aucun fichier de logique métier, Supabase, Edge Functions, migration SQL ou politique RLS ne doit être touché dans le cadre de cette refonte visuelle.
