# Methaniseur Tycoon Beta

Jeu de gestion / tycoon sur le thème de la méthanisation. Phase beta.

## Stack

- **Frontend** : HTML5 / CSS3 / JavaScript vanilla (ES2022+, modules ESM, pas de framework)
- **Backend** : Supabase (Postgres + Auth + Realtime)
- **Hébergement** : GitHub Pages / Netlify (à confirmer)
- **Pas de bundler** pour l'instant. Si nécessaire plus tard : Vite.

## Conventions de code

- **JS** : modules ESM (`import` / `export`), `const` par défaut, `let` uniquement si réassignation, jamais `var`.
- **Async** : `async/await` partout, pas de `.then()` chaînés sauf cas justifié.
- **Erreurs** : toujours `try/catch` sur les appels Supabase, log via une fonction utilitaire centralisée (`logError`).
- **Nommage** : `camelCase` pour variables/fonctions, `PascalCase` pour classes, `SCREAMING_SNAKE_CASE` pour constantes.
- **Fichiers** : `kebab-case.js` (ex : `digester-controller.js`).
- **Pas de jQuery, pas de Bootstrap.** CSS custom + variables CSS (`:root { --color-primary: ... }`).
- **Pas de `innerHTML`** avec du contenu utilisateur (XSS). Utiliser `textContent` ou `createElement`.

## Architecture cible

```
/src
  /core         # boucle de jeu, state manager
  /entities     # méthaniseurs, intrants, sorties (classes)
  /ui           # composants UI (modules)
  /supabase     # client + queries
  /utils        # helpers
/assets         # images, sons
/styles         # CSS modulaire
index.html
```

- **State global** : un seul `gameState` central, mutations via fonctions dédiées (pas de mutation directe ailleurs).
- **Game loop** : `requestAnimationFrame` pour le rendu, `setInterval` ou ticks fixes pour la logique métier.
- **Sauvegardes** : auto-save toutes les X secondes vers Supabase (table `saves`), avec fallback `localStorage` si offline.

## Supabase

- Client unique exporté depuis `/src/supabase/client.js`.
- **RLS (Row Level Security) activée** sur toutes les tables. Politiques par `auth.uid()`.
- Clés : `SUPABASE_URL` et `SUPABASE_ANON_KEY` uniquement côté client. Jamais la `service_role` key.
- Pour les opérations sensibles → Edge Functions.
- Schéma versionné via migrations dans `/supabase/migrations`.

## Performance

- Lazy load des assets lourds (images, sons).
- Debounce/throttle sur les events fréquents (resize, scroll, sauvegarde).
- Éviter les reflows : batch les modifs DOM, utiliser `DocumentFragment`.
- Cibler 60 fps. Profiler avec Chrome DevTools si chutes.

## Workflow Git

- Branche principale : `main`.
- Branches features : `feat/nom-feature`, fixes : `fix/nom-bug`.
- Commits en convention : `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- Pas de push direct sur `main` une fois en prod.

## Ce que Claude doit faire

- Proposer du code **moderne et idiomatique** (ES2022+, Web APIs natives quand dispo).
- **Pointer mes erreurs** sans hésiter. Si je propose une approche bancale, le dire.
- **Pas de sur-ingénierie** : tant qu'on est en beta solo, garder simple. Pas d'abstraction prématurée.
- Toujours expliquer **pourquoi** un choix avant **comment**, mais brièvement.
- Si une lib externe est vraiment justifiée, la proposer — sinon, vanilla.

## Ce que Claude doit éviter

- Suggérer React/Vue/Svelte sans raison forte (on reste vanilla).
- Réécrire entièrement un fichier pour un petit changement.
- Politesses inutiles et récap de la question.
- Code TypeScript (on est en JS pour l'instant).

## État actuel (à mettre à jour)

- [ ] Boucle de jeu fonctionnelle
- [ ] Auth Supabase
- [ ] Sauvegarde cloud
- [ ] UI méthaniseurs
- [ ] Économie / progression
- [ ] Sons & feedback visuel
