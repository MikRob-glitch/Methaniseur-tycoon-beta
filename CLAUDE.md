# Methaniseur Tycoon Beta

Jeu de gestion / tycoon sur le thème de la méthanisation. Phase beta.

## Stack réelle (v25.16)

- **Frontend** : React JSX monolithique — fichier unique `methaniseur-tycoon-v25_16.jsx` (~9 800 lignes)
- **Build** : Babel CLI compile le JSX → `compiled.js`, assemblé dans `index.html` via `shell_header.html` + `shell_tail.html`
- **CI/CD** : GitHub Actions sur push `main` → compile + déploie sur **GitHub Pages** (confirmé)
- **Backend** : Supabase — projet `psgbbvskbmdgmeafpezn`, région `eu-west-3`, ACTIVE_HEALTHY
- **Pas de bundler** (Vite envisagé plus tard si besoin)

## Architecture réelle

Le jeu est un **composant React unique** (`App`) dans un seul fichier JSX. Pas de split en modules pour l'instant.

Sections principales du fichier (dans l'ordre) :
- Constantes & données (`UPGRADES`, `TUTORIAL_STEPS`, `REWARD_DEFS`…)
- Composants UI (`TutorialOverlay`, `RewardsTab`, `RankingTab`…)
- Composant `App` : state, game loop, sauvegarde, moteur tuto, rendu

State piloté exclusivement par `useState` / `useReducer` React — pas de state global externe.

## Conventions de code

- **JSX** : React fonctionnel, hooks uniquement (`useState`, `useEffect`, `useCallback`, `useRef`…)
- **JS** : `const` par défaut, `let` si réassignation, jamais `var`
- **Async** : `async/await`, pas de `.then()` chaînés
- **Erreurs** : `try/catch` sur tous les appels Supabase
- **Nommage** : `camelCase` variables/fonctions, `PascalCase` composants, `SCREAMING_SNAKE_CASE` constantes
- **Pas de jQuery, pas de Bootstrap** — inline styles React + variables CSS

## Workflow Git (contraintes Cowork)

- Repo : `https://github.com/MikRob-glitch/Methaniseur-tycoon-beta.git`, branche `main`
- **Le mount OneDrive bloque les suppressions de fichiers** (`rm` → "Operation not permitted") → git clone dans le sandbox (`/sessions/.../mtb/`), jamais dans le mount
- **L'outil Edit tronque les gros fichiers** → toujours éditer via Python (`str.replace`) sur `/tmp/final.jsx`, puis `rsync` vers le mount et le clone git
- Vérifier l'intégrité après chaque copie : `md5sum` des deux fichiers doit correspondre
- Commits convention : `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

## Supabase

- **Projet** : `psgbbvskbmdgmeafpezn` (ne pas confondre avec "Expedition catching" / `rwagwbzztcehvdztkscj`)
- RLS activée sur toutes les tables, politiques par `auth.uid()`
- Clés côté client : `SUPABASE_URL` + `SUPABASE_ANON_KEY` uniquement — jamais la `service_role`
- Edge Functions déployées via MCP Supabase (`deploy_edge_function`), pas par GitHub Actions

## Système de tutoriel

Moteur spotlight avec `TUTORIAL_STEPS` (tableau ordonné) + `TutorialOverlay` :

- `seenTutos` : `Set<string>` persisté en `localStorage` (`mt_seen_tutos_v1`)
- Moteur : `useEffect` qui scanne `TUTORIAL_STEPS.find(s => s.trigger(gs))` — un seul step actif à la fois
- `forceTab` : bascule l'onglet actif au déclenchement du step
- `forceView` : bascule la vue city (0=injection, 1=digesteur, 2=gisements)
- Pré-marquage au 1er chargement pour ne pas re-montrer les étapes déjà dépassées
- Migration one-time `mt_tutos_migrated_rewards` pour corriger des pré-marquages erronés

Séquence actuelle des steps :
`welcome` → `tab-achats` → `buy-lisier` → `bac-intrants` → `gisements-intro` → `zone-fill-pin` → `zone-panne` → **`rewards-hint`** → **`rewards-milestones`** → `pour-button` → `cn-ratio` → `currency-intro` → `chain-goal` → `epurateur-intro` → `compresseur-intro` → `raccordement` → `gnv-intro` → `tractor-fleet`

## État ac