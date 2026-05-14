# Code Review — `methaniseur-tycoon-v25_11.jsx`

**Date** : 2026-05-14 · **Reviewer** : Claude (skill `engineering:code-review`)
**Fichier** : 8 850 lignes / 508 KB · **Composant `Game`** : ~2 400 lignes à lui seul
**Stack** : JSX inline + Babel CLI · Supabase REST + Realtime WS · GitHub Pages · PWA

---

## Summary

Le jeu fonctionne et la logique métier (yield engine, offline catch-up, fiabilité) est soignée. **Mais le modèle de sécurité est cassé** : tu utilises l'anon key Supabase pour faire tout, sans Supabase Auth officielle, avec un hash mot de passe SHA-256 sans sel. **N'importe quel joueur peut, depuis sa console, tricher tous les scores du classement national** s'il a pris 10 min pour comprendre le schéma. La maintenabilité du composant `Game` monolithique est l'autre dette critique : 92 `useState` + 64 `useRef` + 63 `useEffect` dans une seule fonction.

**Verdict : Request Changes** — déployable en beta interne GRDF si tu fais confiance au public, **pas déployable** si le leaderboard a la moindre valeur.

---

## 🔴 Critical Issues — à fixer AVANT de continuer la beta

| # | Ligne | Issue | Sévérité |
|---|---|---|---|
| 1 | 53-54 | Anon key Supabase visible dans le code source → exposée au CDN public GitHub Pages | 🔴 Architecture |
| 2 | 58-63 | `hashPassword` = SHA-256 brut **sans sel** sur un mdp 6 caractères min → rainbow tables triviales | 🔴 Sécurité |
| 3 | 66-74 | `supabaseCheckMaia` retourne `password_hash` au client → un attaquant peut le récupérer en bulk et bruteforcer offline | 🔴 Sécurité |
| 4 | 77-132 | `supabaseRegisterAgent` envoie `score_network`, `euros`, etc. avec defaults → si RLS permet INSERT, on peut créer un compte avec score=1M | 🔴 Sécurité |
| 5 | 155-169 | `supabaseUpsertScore` & `supabaseUpsert` font confiance au client pour `score_network`, `score_gnv`, `euros`. **Aucune validation serveur**. Triche triviale via DevTools. | 🔴 Sécurité |
| 6 | 802-814 | Auth = lecture du hash en clair côté client puis `if (agent.password_hash !== hash)`. C'est de l'auth à la 1995. | 🔴 Sécurité |
| 7 | 1219 | `Math.min((Date.now() - sv.lastSaved) / 1000, 86400)` → `Date.now()` est manipulable. Régler l'horloge système → quitter → revenir = gains offline arbitraires (clampés à 24h, mais 24h ÷ 1 minute réelle = exploit massif) | 🔴 Triche |
| 8 | 1205-3653 | Composant `Game` = 2 400 lignes, **92 `useState` + 64 `useRef` + 63 `useEffect`** → maintenance impossible, dette technique majeure | 🔴 Maintenabilité |

---

## 🟡 Suggestions importantes

| # | Ligne | Suggestion | Catégorie |
|---|---|---|---|
| 9 | partout | 28 `setTimeout` pour 4 `clearTimeout`. Sur les sous-composants (BadgeOverlay, etc.) → warnings "setState on unmounted component" potentiels | Correctness |
| 10 | 791, 1767 | `// eslint-disable-line react-hooks/exhaustive-deps` plusieurs fois → dépendances cachées, risque de stale closures | Correctness |
| 11 | 297-318 | Polling à 8 s **+** WebSocket actif en même temps possible si `wsFailedRef` n'est pas reset au reconnect après fallback. Double charge réseau silencieuse | Performance |
| 12 | 754, 813, 841 | `localStorage.setItem('mt_login_v2', JSON.stringify({maia}))` → maia stocké en clair. OK pour un identifiant, mais combiné avec absence d'expiration → session éternelle | Sécurité |
| 13 | 200-208 | `try/catch` muet sur `supabaseLoadGame` → si la save cloud est corrompue, on retourne `null` sans alerte, fallback localStorage seulement. Risque de perte de progression silencieuse | Correctness |
| 14 | 1770-1773 | `stateRef.current = {...30 champs}` réassigné à chaque render → garbage pressure, OK fonctionnellement mais inutilement coûteux. Préférer mettre à jour clé par clé | Performance |
| 15 | 3559 | `parseInt(e.target.value, 10)` sans validation → `NaN` propageable | Correctness |
| 16 | 1847 | Save toutes les 15 s **avec 2 upserts simultanés** (`supabaseUpsertScore` + `supabaseUpsert`). En multi-onglets ou network lent → écritures concurrentes possibles | Race condition |
| 17 | 1854 | `window.confirm()` natif pour logout → bloquant, anti-UX, inconsistant avec ton design system | UX |
| 18 | 1397-1398 | `displayedGains = offlineGains \|\| cloudOfflineGains` → priorité localStorage. Si l'utilisateur joue cross-device, **localStorage est plus ancien que le cloud** mais gagne la priorité. Risque d'afficher des gains périmés | Correctness |
| 19 | 80-87 | `Prefer: resolution=merge-duplicates` sur POST → un attaquant peut faire un `POST` avec un `maia` existant et **écraser le `password_hash` d'un autre joueur** (sauf si RLS) | 🔴→ recheck RLS |
| 20 | tout fetch | Aucun `AbortController` sur les `fetch` → requêtes pendantes après unmount/navigation | Performance |
| 21 | 8850 lignes | Pas de modules ESM (contrainte Babel inline). Mais **rien n'empêche** de splitter en plusieurs `.jsx` concaténés par `build.sh` → tu serais beaucoup plus à l'aise | Maintenabilité |

---

## 🟢 What Looks Good

- **Zéro `innerHTML`, zéro `dangerouslySetInnerHTML`, zéro `eval`** → surface XSS minimale ✅
- **`encodeURIComponent` sur les `maia` dans les URL** → pas d'injection PostgREST côté URL ✅
- **`useSupabaseRealtime`** : architecture WS + heartbeat 29s + reconnect 3s + fallback polling = solide. Cleanup propre (lignes 396-403) ✅
- **`stateRef` pattern** pour `saveGame` → évite les stale closures dans le setInterval, malin ✅
- **`calcOffline`** : logique métier fouillée (yield mix pondéré, compositions résiduelles, fiabilité offline) — c'est de la qualité ✅
- **Versionnement des saves cloud avec migration auto** (v25.0 yield engine, v25.7 tractorGnvArr) → attention au backward compat clairement documentée ✅
- **`addEventListener` / `removeEventListener` parfaitement équilibrés** (6 / 6) ✅

---

## 📋 Plan d'action priorisé

### 🚨 Avant le prochain push prod

1. **Vérifier les policies RLS sur la table `players`** dans le SQL Editor Supabase :
   ```sql
   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'players';
   ```
   Si tu ne vois pas de policy `UPDATE` qui restreint `WHERE maia = (auth.jwt() ->> 'maia')` ou équivalent → **tout joueur peut update tout joueur**. C'est probablement le cas vu ton architecture.

2. **Au minimum, masquer `password_hash` au SELECT public** :
   ```sql
   REVOKE SELECT ON players FROM anon;
   GRANT SELECT (id, maia, username, region, score_network, score_gnv, is_connected, buffer, epurateur, compresseur, digesteurs, euros) ON players TO anon;
   ```
   → Le `password_hash` n'est plus lisible. Mais ça casse `supabaseCheckMaia` qui le compare côté client. Donc :

3. **Migrer l'auth vers une Edge Function** (`/functions/v1/login`, `/functions/v1/register`) qui :
   - reçoit `{maia, password}`
   - hash avec **bcrypt** (pas SHA-256) côté serveur
   - retourne un JWT signé
   - le client stocke le JWT et l'utilise pour les writes (au lieu de l'anon key)

### 🟠 Sprint suivant

4. **Edge Function `submit-score`** qui valide les scores serveur-side (au moins : monotone croissant, plafonds plausibles vu le temps écoulé)
5. **Refactor `Game`** : extraire 4-5 sous-composants (`UseGameLoop`, `useSupabaseSync`, `<DigesteurScene>`, `<RankingPanel>`) — pas besoin d'ESM, juste de splitter le `.jsx` source en plusieurs blocs concaténés
6. **Anti-triche horloge** : stocker `lastSaved` côté serveur + utiliser `NOW()` Postgres dans une Edge Function pour le delta offline
7. **Audit des `setTimeout` non cleanup** dans les sous-composants Badge/Notif

### 🟢 Quand tu auras le temps

8. Externaliser les magic numbers (`SAVE_INTERVAL_MS = 15_000`, `POLL_INTERVAL_MS = 8_000`, etc.)
9. Stratégie de tests (`/engineering:testing-strategy`) — typiquement Vitest unitaires sur les fonctions pures (`calcOffline`, `yieldFromComposition`, `computeBadges`)
10. AbortController sur les `fetch` longs

---

## Verdict

**Request Changes** pour les items #1-#7 si le leaderboard a la moindre valeur (challenge interne GRDF = oui).
**Approve** la suite : c'est bien écrit, bien commenté, le métier est solide. Le problème n'est pas le code — c'est l'architecture sécurité que ton choix "PWA single-file sans backend" rend structurellement impossible **sauf à passer par des Edge Functions Supabase**.
