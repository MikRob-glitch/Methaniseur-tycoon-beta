# Methaniseur Tycoon Beta

Jeu de gestion / tycoon sur le thème de la méthanisation. Phase beta.

## Stack réelle (v25.19)

- **Frontend** : React JSX monolithique — fichier unique `methaniseur-tycoon-v25_16.jsx` (~10 370 lignes)
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
- **Le mount OneDrive bloque les suppressions de fichiers** (`rm` → "Operation not permitted") → git clone dans le sandbox (`/tmp/mtb_git/`), jamais dans le mount
- **L'outil Edit tronque les gros fichiers** → toujours éditer via Python (`str.replace`) sur `/tmp/final.jsx`, puis `cp` vers le mount et le clone git
- `/var/tmp/` peut être verrouillé → utiliser `/tmp/` à la place (testé ok en session)
- Vérifier l'intégrité après chaque copie : `md5sum` des deux fichiers doit correspondre
- Commits convention : `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- **Push GitHub** : utiliser un PAT via `git push https://MikRob-glitch:<PAT>@github.com/...` dans le sandbox (Mika fournit le PAT en session)

## Supabase

- **Projet** : `psgbbvskbmdgmeafpezn` (ne pas confondre avec "Expedition catching" / `rwagwbzztcehvdztkscj`)
- RLS activée sur toutes les tables, politiques par `auth.uid()`
- Clés côté client : `SUPABASE_URL` + `SUPABASE_ANON_KEY` uniquement — jamais la `service_role`
- Edge Functions déployées via MCP Supabase (`deploy_edge_function`), pas par GitHub Actions

## Système de tutoriel (v25.19)

Moteur spotlight avec `TUTORIAL_STEPS` (tableau ordonné) + `TutorialOverlay` :

- `seenTutos` : `Set<string>` persisté en `localStorage` (`mt_seen_tutos_v1`)
- Moteur : `useEffect` qui scanne `TUTORIAL_STEPS.find(s => s.trigger(gs))` — un seul step actif à la fois
- `forceTab` : bascule l'onglet actif au déclenchement du step
- `forceView` : bascule la vue city (0=injection, 1=digesteur, 2=gisements)
- Pré-marquage au 1er chargement pour ne pas re-montrer les étapes déjà dépassées
- Migration one-time `mt_tutos_migrated_rewards` pour corriger des pré-marquages erronés

Séquence actuelle des steps (18 steps, ordre logique post-v25.19) :
`welcome` → `tab-achats` → `buy-lisier` → `bac-intrants` → `gisements-intro` → `zone-fill-pin` → `zone-panne` → `pour-button` → `cn-ratio` → `currency-intro` → `chain-goal` → `epurateur-intro` → `compresseur-intro` → `raccordement` → `gnv-intro` → `tractor-fleet` → **`rewards-hint`** → **`rewards-milestones`**

### TutorialOverlay — comportements clés (v25.19)
- Clic hors tooltip = **neutre** (pas de skip accidentel)
- "Passer le tuto" → modale de confirmation (réversible, mentionne le replay)
- Support clavier : `Entrée`/`Espace` → suivant, `Échap` → ouvre la modale confirm
- Barre de progression "Étape X / N — Y%" calculée via `TUTORIAL_STEPS.findIndex`
- Bouton "Suivant →" / "Terminer ✓" selon position (`stepIndex === totalSteps - 1`)
- Positionnement dynamique via `ResizeObserver` sur le `tooltipRef` — plus de hauteur hardcodée
- Animation `tutFadeIn` (fade + translateY) définie dans le `<style>` du render principal

## Thème visuel — Duel GRDF (implémenté v25.16+)

Palette : fond blanc `#FFFFFF`, bleu `#005EB8`, vert `#00A850`. Tokens CSS dans `shell_header.html`.

### Commits thème Duel (ordre chronologique)
- `cada2d8` — palette Duel dans `shell_header.html` + DARK/LIGHT objects JSX, digesteur 3D clair
- `38f5271` — patch 430 remplacements : `rgba(255,255,255,<.5)` → bleu/sombre, hex sombres digesteur/route
- `aec10a0` — bac intrants noir → `#D8EAF8/#C0D8F0`, 51 textes blancs → `rgba(26,46,74,...)`, popup composition blanc, GNV labels, ZoneBuilding, carter agitateur
- `0f3871c` — fonds zones basses `rgba(7,14,25,...)` → `rgba(240,246,252,.7)` (terrain clair Vue 1/Vue 0)
- `95eddc0` — routes asphalte `#2E3338` + bords blancs `rgba(255,255,255,.88)` + tirets blancs `rgba(255,255,255,.75)` standard FR

### Règles de couleur (invariants à respecter)
- `rgba(255,255,255,...)` dans `color:` → remplacer par `rgba(26,46,74,...)` (texte sombre)
- `rgba(255,255,255,...)` dans `fill={act(3)?...:...}` SVG → **garder** (fond sombre actif)
- `rgba(0,0,0,...)` dans `background:` fixed/modal → **garder** (backdrop overlay intentionnel)
- Fonds route : `#2E3338` (asphalte), bords `rgba(255,255,255,.88)`, tirets `rgba(255,255,255,.75)`
- Tokens : `--c-blue:#005EB8`, `--c-green:#00A850`, `--c-text:#1A2E4A`, `--c-bg:#FFFFFF`, `--c-surface:#F4F7FB`

## Système urgence financière (v25.17)

Mécanisme déclenché quand les pannes de gisements s'accumulent sans être réparées.

### Constantes clés
- `EUROS_FLOOR = -500` — seuil déclencheur de la modale urgence
- `PANNE_DAILY_MS = 5 * 60 * 1000` — 1 "jour de panne" = 5 min réel
- `PANNE_DAILY_RATE = 0.20` — 20% du coût de relance facturé par jour
- `LOAN_AMOUNT = 1000` — montant du prêt bancaire d'urgence
- `LOAN_REPAY_RATE = 0.10` — 10% des gains euros → remboursement auto
- `LOAN_COOLDOWN_MS = 30 * 60 * 1000` — 1 prêt max toutes les 30 min
- `SCORE_LOAN_MALUS = 0.10` — -10% score visible dans le classement si prêt actif
- `SELL_REFUND_RATE = 0.50` — 50% de la valeur d'achat récupérée à la revente

### Fonctionnement
1. **Facturation journalière** : à chaque "jour", chaque zone `offline` déduit `relaunchCost × 0.20` des euros (uniquement en mode `injected`). Remplace l'ancien coût one-shot au trigger.
2. **Malus production** : si `euros < 0` → production réduite de `min(50%, abs(euros)/5000)`. Gradué, jamais bloquant total.
3. **Modale urgence** (`EmergencyModal`) : s'ouvre automatiquement à `euros < EUROS_FLOOR`. Bloquante. Propose :
   - Vendre un tracteur (si `tractorCount > 1`)
   - Vendre une station GNV (si `gnvStations > 0`)
   - Vendre un digesteur (si `digesteurs > 1`)
   - Prêt bancaire 1000€ (cooldown 30 min)
   - La chaîne d'injection est **intouchable** (pas de vente possible)
4. **Remboursement auto** : 10% de chaque gain euros rembourse le prêt en cours.
5. **Classement** : score affiché `-10%` tant que `loanAmount > 0`.

### State ajouté
- `loanAmount` (float) — dette bancaire en cours, persistée en localStorage
- `loanLastTaken` (timestamp) — cooldown du prêt
- `lastPanneCharge` (array[7]) — timestamps de dernière facturation par zone
- `emergencyModal` (bool) — contrôle la modale

### Reset facturation
`lastPanneCharge[i]` est remis à `null` quand : relance manuelle (`handleRelaunchZone`), expiration auto de la panne, ou zone sans gisement acheté.

## Gestion des mots de passe (v25.18)

### Côté joueur
- Bouton **"👤 Mon profil"** dans le menu dropdown (à côté de "Se déconnecter")
- Modale `ProfileModal` : formulaire 3 champs (ancien MDP, nouveau, confirmation)
- Appelle `action: "change_password"` sur l'Edge Function (session_token + old/new hash)
- Après succès : session invalidée → redirection login automatique

### Côté admin
- Edge Function : `action: "admin_reset_password"` protégée par `ADMIN_SECRET_KEY` (variable d'env Supabase)
- Interface HTML locale : `admin-panel.html` (ouvrir dans le navigateur, aucun serveur requis)
  - Liste tous les joueurs avec reset MDP inline par ligne
  - Clé admin stockée en `sessionStorage` (pas de re-saisie)
- Reset SQL direct aussi possible :
  ```sql
  UPDATE players SET password_hash = encode(digest('nouveauMDP','sha256'),'hex'), session_token=NULL, session_expires_at=NULL WHERE maia='MAIA';
  ```

### Sécurité
- `change_password` vérifie l'ancien hash avant de modifier
- Les deux actions invalident le `session_token` → force re-login
- `admin_reset_password` nécessite `ADMIN_SECRET_KEY` (jamais exposée côté client)

## État actuel

- [x] Boucle de jeu fonctionnelle
- [x] Auth Supabase
- [x] Sauvegarde cloud (auto-save + fallback localStorage)
- [x] UI méthaniseurs (digesteur, gisements, injection, GNV)
- [x] Économie / progression (phase 1 m³ → phase 2 €, raccordement GRDF)
- [x] Système tutoriel complet (18 steps, spotlight, mobile-friendly)
- [x] Onglet Récompenses (certificats GO/CPB/Qualimétha, milestones, badges)
- [x] Classement national (Supabase Realtime)
- [x] Thème Duel GRDF (fond blanc, bleu #005EB8, vert #00A850) — **terminé**
- [x] Système urgence financière (pannes daily cost, malus prod, vente équipements, prêt) — **v25.17**
- [x] Lisibilité badges RewardsTab — contraste corrigé (`31b8512`) — **v25.17+**
- [x] Gestion MDP : changement profil joueur + reset admin (`35a87ee`) — **v25.18**
- [x] Tutoriel refacto complet : UX, design, progression, contenu (`c3ffa05`) — **v25.19**
- [ ] Sons & feedback visuel
- [ ] PWA / offline complet

## Règles contraste RewardsTab (invariants post-fix `31b8512`)

Pour maintenir la lisibilité sur fond clair (thème Duel), dans `RewardsTab` / `renderBadge` :
- Noms de badges/milestones → toujours `color:"var(--c-text)"`, jamais `b.color` ou `c` (jaune/argent illisibles sur blanc)
- Pilules "DÉBLOQUÉ" / "✅" → `background:b.color` (solide) + `color:"#fff"` — jamais `background:b.color+"18"` (9% opacité)
- Étoiles maîtrise → `#B8860B` (or sombre, ~4.5:1) à la place de `var(--c-yellow)` (#F5BE50, ~2.5:1)
- Textes secondaires non-débloqués → opacité ≥ `.65` sur blanc

## Ce que Claude doit faire

- Proposer du code **moderne et idiomatique** (ES2022+, React hooks)
- **Pointer les erreurs** sans hésiter
- **Pas de sur-ingénierie** : beta solo, garder simple, pas d'abstraction prématurée
- Toujours expliquer **pourquoi** avant **comment**, brièvement

## Ce que Claude doit éviter

- Utiliser l'outil Edit sur `methaniseur-tycoon-v25_16.jsx` — trop grand, il tronque. Toujours Python + rsync.
- Réécrire entièrement un fichier pour un petit changement
- Code TypeScript (on est en JS/JSX)
- Touches à `shell_header.html` / `shell_tail.html` sans raison explicite
