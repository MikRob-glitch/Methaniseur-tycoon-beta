# 🚜 Méthaniseur Tycoon — Beta v23

Challenge interne GRDF — gamification de la production de biométhane et de l'injection réseau.

## 📦 Contenu du dépôt

| Fichier | Rôle | Nécessaire en prod ? |
|---|---|---|
| `index.html` | Point d'entrée du jeu (JSX inliné) | ✅ Oui |
| `sw.js` | Service Worker (offline + cache) | ✅ Oui |
| `manifest.json` | Manifest PWA (install "Add to Home Screen") | ✅ Oui |
| `icon.svg` | Icône PWA 512×512 | ✅ Oui |
| `methaniseur-tycoon-v23.jsx` | Source de vérité (versioning) | ❌ Non (confort projet) |
| `README.md` | Ce fichier | ❌ Non |

**5 fichiers suffisent pour faire tourner le jeu.**

---

## 🚀 Déploiement GitHub Pages — en 3 étapes

### 1. Upload des fichiers
Uploader les 4 fichiers de prod dans le repo :
- `index.html`
- `sw.js`
- `manifest.json`
- `icon.svg`

### 2. Activer GitHub Pages
- **Settings** → **Pages** → **Source : Deploy from a branch**
- Sélectionner `main` (ou `master`) + `/` (root) → **Save**
- Attendre 1-2 min le temps que le build se lance
- URL finale : `https://<ton-user>.github.io/<nom-du-repo>/`

### 3. Vérifier la migration Supabase (CRITIQUE)
Avant de laisser les beta-testeurs jouer, exécuter dans le SQL Editor Supabase :

```sql
ALTER TABLE players ADD COLUMN IF NOT EXISTS tractor_count       INT     DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS tractor_speed_boost BOOLEAN DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS pinned_zones        JSONB   DEFAULT '[]'::jsonb;
```

> ⚠️ Sans cette migration, les achats de tracteurs ne se sauvegarderont pas côté cloud (mais le jeu reste fonctionnel en local).

Vérification :
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'players'
  AND column_name IN ('tractor_count','tractor_speed_boost','pinned_zones');
```
→ doit retourner 3 lignes.

---

## 🔑 Configuration Supabase

Le jeu pointe vers **le même projet Supabase** que la v22 (config inline dans `index.html`) :
```
SUPABASE_URL = https://psgbbvskbmdgmeafpezn.supabase.co
```

**Si tu veux un Supabase séparé pour le beta test** (recommandé pour ne pas polluer le leaderboard de prod) :
1. Créer un nouveau projet Supabase
2. Créer la table `players` avec le même schéma que la prod
3. Appliquer la migration SQL ci-dessus
4. Dans `index.html`, remplacer `SUPABASE_URL` et `SUPABASE_KEY` (~ligne 45) par les nouvelles valeurs

---

## 🧪 Checklist beta test

### Non-régression (features v22 qui doivent marcher)
- [ ] Login / création de compte
- [ ] Achat d'intrants en m³ puis en € après raccordement
- [ ] Bac se remplit + déversement déclenche digestion
- [ ] Digesteur produit du biométhane (compteur qui monte)
- [ ] Raccordement GRDF passe (buffer → euros)
- [ ] Module GNV : stations + tracteur GNV (+15%)
- [ ] Leaderboard national + régional
- [ ] Badges qui se déclenchent
- [ ] Save Supabase cross-device (fermer l'onglet → rouvrir sur autre appareil)
- [ ] Offline catch-up après 1 min d'inactivité

### Nouveautés v23
- [ ] **Swipe horizontal** sur la scène digesteur (vue 1 ↔ vue 2 ville)
- [ ] Le **scroll vertical** de la page n'est PAS bloqué pendant le swipe
- [ ] **Dots indicator** en bas : tap pour changer de vue sans swipe
- [ ] **Flèche pulse** ‹ / › change selon la vue active
- [ ] **4 zones débloquées visibles** au démarrage (🐄🌿🍽️🏭), zones 🔒 grisées en bas avec prix
- [ ] **Tracteur traverse les 2 vues** via la route jaune en pointillés
- [ ] **Animations zones** : arbres qui oscillent, fenêtres restaurant qui clignotent, fumée usine, bulles biogaz+
- [ ] **Pin priorité 📌** : tap sur un pin → passe orange, le tracteur cible cette zone
- [ ] **Unpin** : retap → revient en pool commun

### Flotte (après raccordement GRDF)
- [ ] Section "Flotte de tracteurs" apparaît
- [ ] 2ᵉ tracteur (8 000 €) → 2 tracteurs visibles simultanément
- [ ] 3ᵉ tracteur (45 000 €) → 3 tracteurs visibles
- [ ] Route goudronnée (15 000 €) → vitesse visiblement augmentée

---

## 🐛 Bugs connus à surveiller

1. **Particules load/dump** : les emojis qui tombent dans la remorque (zone de charge) et volent vers le bac (zone de décharge) peuvent paraître petits — c'est dû au viewBox SVG qui s'étire. Si trop peu visible, remonter pour discussion.
2. **Orientation tracteur** : sur les segments verticaux (remontée vers une zone), le tracteur pivote à 90°. Si visuellement chelou, on peut le figer en horizontal.
3. **Collisions visuelles** avec 3 tracteurs : ils peuvent se superposer — comportement volontaire validé en sprint (vs complexité d'un slot system).

---

## 🔄 Procédure de mise à jour

Pour un hotfix ou une v24 :
1. Modifier `index.html` (via éditeur GitHub ou commit local)
2. **Bumper `CACHE_NAME`** dans `sw.js` (ex: `'methaniseur-v23'` → `'methaniseur-v24'`)
3. Commit + push
4. Les utilisateurs PWA verront le nouveau contenu au prochain chargement (ou après fermeture/réouverture de l'app installée)

> **Sans le bump de CACHE_NAME**, les utilisateurs en mode PWA installée resteront bloqués sur l'ancienne version via le cache. C'est le bug le plus courant en déploiement PWA.

---

## 📞 Support

- **Source de vérité** : `methaniseur-tycoon-v23.jsx` (à garder dans le repo pour versioning)
- **Ne jamais éditer directement** le JSX inliné dans `index.html` : toujours passer par le fichier source puis regénérer
- Pour les réglages visuels (positions zones, couleurs, etc.) : modifier `CITY_ZONES`, `TRACTOR_UPGRADES`, `WORLD` dans le JSX
