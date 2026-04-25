#!/usr/bin/env bash
# ============================================================================
# Méthaniseur Tycoon — Build script
# ============================================================================
# Assemble index.html à partir du JSX source et du shell HTML.
#
# Architecture : pas de bundler. Le JSX est transpilé côté navigateur par
# Babel standalone (<script type="text/babel">). Donc le "build" se résume à
# une concaténation : shell_header + .jsx + shell_tail.
#
# Pré-requis :
#   - Un fichier .jsx source contenant le code complet (commentaires de
#     version + const { useState, ... } + tout le JSX jusqu'à la fonction App)
#   - shell_header.html (HTML jusqu'à <script type="text/babel">)
#   - shell_tail.html   (ReactDOM.createRoot + fermeture </script></body></html>)
#
# Usage : ./build.sh [chemin_vers_jsx_source]
#         (par défaut : methaniseur-tycoon.jsx)
# ============================================================================

set -euo pipefail

JSX_SRC="${1:-methaniseur-tycoon.jsx}"
HEADER="shell_header.html"
TAIL="shell_tail.html"
OUTPUT="index.html"

# Vérifications
[[ -f "$JSX_SRC" ]] || { echo "❌ JSX source introuvable : $JSX_SRC"; exit 1; }
[[ -f "$HEADER"  ]] || { echo "❌ Shell header introuvable : $HEADER"; exit 1; }
[[ -f "$TAIL"    ]] || { echo "❌ Shell tail introuvable : $TAIL"; exit 1; }

# Garde-fou : pas d'imports/exports ES6 (Babel standalone ne les supporte pas)
if grep -qE "^(import |export default)" "$JSX_SRC"; then
  echo "❌ ERREUR : $JSX_SRC contient 'import' ou 'export default' (incompatibles avec Babel inline)"
  grep -nE "^(import |export default)" "$JSX_SRC"
  exit 1
fi

# Concaténation simple
cat "$HEADER" "$JSX_SRC" "$TAIL" > "$OUTPUT"

# Résumé
LINES=$(wc -l < "$OUTPUT")
SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "✅ $OUTPUT généré ($LINES lignes, $SIZE)"
echo ""
echo "Prochaines étapes :"
echo "  1. Bumper CACHE_NAME dans sw.js"
echo "  2. git add index.html sw.js \"$JSX_SRC\""
echo "  3. git commit -m \"vXX.Y — description\""
echo "  4. git push"
