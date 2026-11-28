# JASpay — Plan de création et d'intégration des ressources graphiques

**Version :** 1.0  
**Statut :** En attente de validation utilisateur avant toute création de fichier visuel  
**Dépôt :** `isaac10-maker/JASpay`, branche `main`  
**Contrainte absolue :** aucune modification de logique métier, Supabase, Edge Functions, tables SQL, RLS, ou flux de dépôt/retrait.

---

## 1. Contexte et contraintes

Le dépôt ne contient actuellement **aucun fichier image** (zéro PNG, JPG, SVG, WebP, GIF, ICO). La refonte visuelle immersive (univers spatial + scènes sportives + logos bookmakers + éléments financiers + animations/glitch) nécessite donc la création de toutes les ressources graphiques depuis zéro.

### Règles à respecter (non négociables)

1. **Aucune imitation de logo officiel** : les logos 1xBet, MelBet et 1Win doivent être récupérés dans leurs versions officielles depuis des sources fiables, ou laissés comme emplacements temporaires clairement identifiés (`[PLACEHOLDER]`). Jamais de dessin approximatif présenté comme un logo officiel.
2. **Scènes sportives de qualité** : football, basketball, tennis, golf doivent être de véritables visuels originaux, pas de simples rectangles ou cercles SVG.
3. **Objets indépendants** : ballons, trophées, jetons, billets décoratifs doivent être des ressources graphiques indépendantes, idéalement PNG transparents.
4. **Animations séparées des images** : CSS, SVG animé ou séquences adaptées. Un PNG statique ne doit jamais être présenté comme une animation réelle.
5. **Conserver Starfield.jsx et BackgroundRotation.jsx** lorsqu'ils sont réutilisables ; faire évoluer leur architecture sans casser leur fonctionnement.
6. **Aucune modification métier** : pas de touche à Supabase, Edge Functions, tables SQL, politiques RLS, flux de dépôt/retrait, règles de validation des transactions.
7. **Aucune dépendance payante** : uniquement des outils libres ou déjà présents dans le projet (React, Vite, Tailwind).

---

## 2. Arborescence des ressources (cible)

```
client/src/assets/
├── images/                     # Images raster (PNG transparents)
│   ├── logos/
│   │   ├── jaspay-logo.png              # Logo JASpay (création originale)
│   │   ├── jaspay-logo-icon.png         # Icône seule (Navbar, favicon)
│   │   ├── bookmakers/
│   │   │   ├── 1xbet.png                  # [OFFICIEL] ou [PLACEHOLDER]
│   │   │   ├── melbet.png                 # [OFFICIEL] ou [PLACEHOLDER]
│   │   │   ├── 1win.png                   # [OFFICIEL] ou [PLACEHOLDER]
│   │   └── providers/
│   │       ├── mixx-by-yas.png            # Logo opérateur Mobile Money
│   │       └── flooz.png                  # Logo opérateur Mobile Money
│   ├── scenes/
│   │   ├── scene-football.png             # Scène stade/football (originale)
│   │   ├── scene-basketball.png           # Scène terrain/basket (originale)
│   │   ├── scene-tennis.png               # Scène court/tennis (originale)
│   │   └── scene-golf.png                 # Scène green/golf (originale)
│   ├── objects/
│   │   ├── ball-football.png              # Ballon de football (PNG transparent)
│   │   ├── ball-basketball.png            # Ballon de basketball (PNG transparent)
│   │   ├── ball-tennis.png                # Ballon de tennis (PNG transparent)
│   │   ├── ball-golf.png                  # Ballon de golf (PNG transparent)
│   │   ├── trophy-gold.png                # Trophée or (PNG transparent)
│   │   ├── trophy-silver.png              # Trophée argent (PNG transparent)
│   │   ├── chip-gold.png                  # Jeton de pari (PNG transparent)
│   │   ├── chip-silver.png                # Jeton de pari (PNG transparent)
│   │   └── ticket-decoratif.png           # Billet décoratif de pari (PNG transparent)
│   └── financial/
│       ├── xof-symbol.png                 # Symbole XOF stylisé
│       ├── coin-stack.png                 # Pile de pièces
│       └── banknote-decor.png             # Billet décoratif générique (pas de faux billet officiel)
├── svgs/                          # Illustrations vectorielles (CSS/SVG animé)
│   ├── background-rotation/         # Remplace les SVG intégrés actuels de BackgroundRotation.jsx
│   │   ├── football-stade.svg
│   │   ├── basketball-terrain.svg
│   │   ├── tennis-court.svg
│   │   └── golf-green.svg
│   └── glitch/
│       ├── glitch-text.svg            # Overlay glitch occasionnel (SVG animé)
│       └── scanlines.svg              # Effet scanlines (CSS/SVG)
└── animations/                    # Keyframes CSS et séquences d'animation
    ├── fade-in-up.css
    ├── float.css
    ├── pulse.css
    ├── glitch.css
    └── rotate-slow.css
```

---

## 3. Détail des ressources par catégorie

### 3.1 Logos bookmakers (4 logos)

| Fichier | Statut | Format | Dimensions recommandées | Source | Pages affectées |
|---------|--------|--------|------------------------|--------|-----------------|
| `images/logos/bookmakers/1xbet.png` | [OFFICIEL] ou [PLACEHOLDER] | PNG transparent | 300 × 120 px (logo), 120 × 120 px (icône) | Site officiel 1xBet ou Wikimedia Commons (version officielle) | Deposit.jsx (sélecteur bookmaker), Dashboard.jsx (étape 1 du dépôt) |
| `images/logos/bookmakers/melbet.png` | [OFFICIEL] ou [PLACEHOLDER] | PNG transparent | 300 × 120 px | Site officiel MelBet | Deposit.jsx |
| `images/logos/bookmakers/1win.png` | [OFFICIEL] ou [PLACEHOLDER] | PNG transparent | 300 × 120 px | Site officiel 1Win | Deposit.jsx |

**Règle :** si un logo officiel ne peut pas être récupéré légalement, le fichier est remplacé par un SVG texte clairement marqué `[PLACEHOLDER - LOGO OFFICIEL MANQUANT - NOM DU BOOKMAKER]`. Aucun dessin imitant le logo n'est accepté.

### 3.2 Logo JASpay (2 fichiers)

| Fichier | Format | Dimensions | Utilisation |
|---------|--------|------------|-------------|
| `images/logos/jaspay-logo.png` | PNG transparent | 400 × 140 px | Login.jsx, Register.jsx, Dashboard.jsx (header) |
| `images/logos/jaspay-logo-icon.png` | PNG transparent | 64 × 64 px | Navbar.jsx, favicon |

Le logo JASpay est une création originale, aucun problème de droits.

### 3.3 Scènes sportives (4 scènes originales)

| Fichier | Format | Dimensions | Description visuelle | Pages affectées |
|---------|--------|------------|---------------------|-----------------|
| `images/scenes/scene-football.png` | PNG transparent | 1200 × 600 px | Stade de football, éclairage nocturne, herbe verte, tribunes floues | Dashboard.jsx (hero), BackgroundRotation.jsx (remplace SVG) |
| `images/scenes/scene-basketball.png` | PNG transparent | 1200 × 600 px | Terrain de basketball intérieur, panneau, parquet, éclairage | Dashboard.jsx, BackgroundRotation.jsx |
| `images/scenes/scene-tennis.png` | PNG transparent | 1200 × 600 px | Court de tennis, filet, surface terre battue ou dur, éclairage | Dashboard.jsx, BackgroundRotation.jsx |
| `images/scenes/scene-golf.png` | PNG transparent | 1200 × 600 px | Green de golf, drapeau, herbe rasée, horizon dégagé | Dashboard.jsx, BackgroundRotation.jsx |

**Règle :** ces scènes sont des créations originales de qualité. Pas de simples formes géométriques.

### 3.4 Objets sportifs (6 PNG transparents)

| Fichier | Format | Dimensions | Utilisation |
|---------|--------|------------|-------------|
| `images/objects/ball-football.png` | PNG transparent | 300 × 300 px | Décoration page dépôt, dashboard |
| `images/objects/ball-basketball.png` | PNG transparent | 300 × 300 px | Décoration page dépôt, dashboard |
| `images/objects/ball-tennis.png` | PNG transparent | 200 × 200 px | Décoration page dépôt, dashboard |
| `images/objects/ball-golf.png` | PNG transparent | 150 × 150 px | Décoration page dépôt, dashboard |
| `images/objects/trophy-gold.png` | PNG transparent | 400 × 400 px | Section confirmation de transaction, succès |
| `images/objects/chip-gold.png` | PNG transparent | 120 × 120 px | Jetons de pari, éléments décoratifs |
| `images/objects/ticket-decoratif.png` | PNG transparent | 250 × 400 px | Billet de pari décoratif, sections admin |

### 3.5 Éléments financiers (3 fichiers)

| Fichier | Format | Dimensions | Utilisation |
|---------|--------|------------|-------------|
| `images/financial/xof-symbol.png` | PNG transparent | 200 × 100 px | Affichage montants XOF |
| `images/financial/coin-stack.png` | PNG transparent | 300 × 200 px | Décoration dashboard, cartes de stats |
| `images/financial/banknote-decor.png` | PNG transparent | 400 × 200 px | Décoration générique (pas de faux billet officiel XOF) |

**Règle :** aucun faux billet officiel (FCFA/XOF avec vraie effigie, vrai numéro de série) n'est créé. Seuls des éléments décoratifs génériques.

### 3.6 Logos opérateurs Mobile Money (2 fichiers)

| Fichier | Format | Dimensions | Utilisation |
|---------|--------|------------|-------------|
| `images/logos/providers/mixx-by-yas.png` | PNG transparent | 200 × 80 px | Deposit.jsx (sélecteur opérateur) |
| `images/logos/providers/flooz.png` | PNG transparent | 200 × 80 px | Deposit.jsx (sélecteur opérateur) |

**Règle :** idem que bookmakers — versions officielles ou placeholders identifiés.

---

## 4. Pages et composants concernés par l'intégration

| Composant / Page | Ressources intégrées | Type d'intégration |
|------------------|---------------------|--------------------|
| `Navbar.jsx` | `jaspay-logo-icon.png`, `jaspay-logo.png` | Remplacement du "J" textuel par le logo image |
| `Login.jsx` | `jaspay-logo.png`, `scene-football.png` (fond décoratif optionnel) | Header logo, fond subtil |
| `Register.jsx` | `jaspay-logo.png`, `scene-football.png` | Header logo |
| `Dashboard.jsx` | 4 scènes sportives, `trophy-gold.png`, `coin-stack.png`, `xof-symbol.png` | Hero section, cartes de stats, quick actions |
| `Deposit.jsx` | 4 logos bookmakers, 2 logos opérateurs, `ball-*.png` | Sélecteur bookmaker (logos à côté des noms), sélecteur opérateur |
| `Withdraw.jsx` | 4 logos bookmakers, `xof-symbol.png` | Sélecteur bookmaker, affichage montant |
| `BackgroundRotation.jsx` | 4 scènes PNG + 4 SVG de rotation | Remplacement des SVG intégrés par les vraies scènes ; rotation 5 min conservée |
| `Starfield.jsx` | Aucune (conservé tel quel) | Fond étoilé CSS pur conservé |
| `AdminDashboard.jsx`, `AdminConfig.jsx`, etc. | `ticket-decoratif.png`, `trophy-gold.png` | Décoration des cartes admin |

---

## 5. Plan d'animation (séparé des images)

Toutes les animations sont réalisées en CSS et/ou SVG animé. Aucun PNG n'est présenté comme une animation.

| Animation | Technologie | Fichier | Effet | Utilisation |
|-----------|-------------|---------|-------|-------------|
| Rotation des scènes | CSS + JS (BackgroundRotation.jsx) | `BackgroundRotation.jsx` | Transition opacity 0.8s, rotation toutes les 5 min | Fond de page principal |
| Flottaison des objets | CSS | `animations/float.css` | translateY -10px alterné | Objets décoratifs (ballons, trophées) |
| Apparition progressive | CSS | `animations/fade-in-up.css` | opacity + translateY | Cartes, éléments de page |
| Glitch occasionnel | CSS + SVG | `animations/glitch.css`, `svgs/glitch/` | Décalage de couleur, distorsion brève | Titres, sections spéciales (occasionnel, respect prefers-reduced-motion) |
| Pulse sur boutons | CSS | `animations/pulse.css` | Ombre qui se dilate | Boutons primaires (hover) |
| Scanlines | CSS + SVG | `svgs/glitch/scanlines.svg` | Lignes horizontales subtiles | Overlay fond spatial |

---

## 6. Planning d'intégration progressive (étapes)

### Étape 1 — Plan et validation (cette intervention)
- [ ] Présenter ce plan au utilisateur
- [ ] Obtenir l'autorisation explicite avant toute création de fichier visuel
- [ ] Confirmer les sources acceptables pour les logos officiels (ou validation de l'approche placeholder)

### Étape 2 — Création des fichiers de structure
- [ ] Créer l'arborescence `client/src/assets/images/`, `client/src/assets/svgs/`, `client/src/assets/animations/`
- [ ] Créer les fichiers placeholder clairement identifiés pour les logos bookmakers non disponibles
- [ ] Créer les fichiers CSS d'animation

### Étape 3 — Création des visuels originaux
- [ ] Logo JASpay (création originale)
- [ ] 4 scènes sportives originales (PNG)
- [ ] Objets sportifs (ballons, trophées, jetons, billets)
- [ ] Éléments financiers génériques

### Étape 4 — Récupération des logos officiels (ou placeholders)
- [x] Logos 1xBet, MelBet, 1Win (fournis et intégrés)
- [ ] Aucun logo Wallisbet : hors périmètre (confirmé par l'utilisateur)
- [ ] Logos opérateurs Mobile Money (Mixx by Yas, Flooz)

### Étape 5 — Intégration dans les composants (sans toucher à la logique métier)
- [ ] Navbar.jsx : logo image
- [ ] Login.jsx / Register.jsx : logo + fond
- [ ] Dashboard.jsx : scènes, trophée, pièces
- [ ] Deposit.jsx : logos bookmakers + opérateurs
- [ ] Withdraw.jsx : logos bookmakers
- [ ] BackgroundRotation.jsx : remplacer SVG intégrés par scènes PNG
- [ ] Styles : ajouter classes d'animation et fond

### Étape 6 — Build et validation
- [ ] `npm run build` côté client (Vite)
- [ ] Vérification visuelle des pages (aucune régression fonctionnelle)
- [ ] Vérification accessibilité (prefers-reduced-motion respecté)
- [ ] Présentation du résultat à l'utilisateur

### Étape 7 — Déploiement (uniquement après validation explicite)
- [ ] Push sur GitHub
- [ ] Déploiement Vercel (automatique depuis main)
- [ ] Aucun déploiement Supabase ni Edge Functions (pas de modification)

---

## 7. Contraintes techniques et de sécurité

- **Aucune modification de `supabase/functions/`** : les Edge Functions restent inchangées.
- **Aucune modification des fichiers SQL** : migrations 001-005 préservées.
- **Aucune modification de RLS** : politiques existantes intactes.
- **Aucune modification de `server/src/`** : backend Express conservé.
- **`VITE_API_URL` non modifié** : pas de changement d'URL API.
- **Aucun `service_role` exposé au frontend** : respecté (déjà le cas).
- **Aucun nouveau compte utilisateur créé** : pas de création de comptes Supabase Auth.
- **Aucun secret modifié** : variables d'environnement intactes.
- **Aucun déploiement lancé sans autorisation** : l'utilisateur valide chaque étape.

---

## 8. Critères de validation (définition de "fini")

1. Tous les fichiers PNG/SVG listés existent dans `client/src/assets/` avec les dimensions et formats prévus.
2. Les logos bookmakers sont soit officiels (source traçable), soit des placeholders clairement identifiés `[PLACEHOLDER]`.
3. Aucun logo n'est une imitation approximative d'un logo officiel.
4. Les animations sont en CSS/SVG uniquement ; aucun PNG statique n'est présenté comme animé.
5. `Starfield.jsx` et `BackgroundRotation.jsx` fonctionnent toujours après évolution.
6. Le build Vite réussit sans erreur.
7. Aucune régression sur les pages existantes (connexion, inscription, dépôt, retrait, transactions, admin).
8. L'accessibilité `prefers-reduced-motion` est respectée sur toutes les nouvelles animations.

---

## 9. Prochaine action demandée

Valider ce plan (ou demander des ajustements) avant que je crée le moindre fichier visuel. Une fois validé, je procèderai par étapes, en commençant par la création de l'arborescence et des fichiers de structure/placeholder.
