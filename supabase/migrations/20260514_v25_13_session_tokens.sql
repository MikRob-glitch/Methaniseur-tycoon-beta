-- v25.13 — Session tokens pour l'Edge Function players-api
-- Le client envoie ce token à chaque save (au lieu du password_hash).
-- Token regénéré à chaque login. Expire après 24h d'inactivité (refresh à chaque save).
--
-- Appliquée en prod le 2026-05-14 via Supabase MCP apply_migration.
-- Ce fichier est ici pour traçabilité — ne pas réexécuter si la table est déjà à jour.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS session_token       TEXT,
  ADD COLUMN IF NOT EXISTS session_expires_at  TIMESTAMPTZ;

-- Index pour le lookup rapide par session_token (utilisé à chaque save)
CREATE INDEX IF NOT EXISTS players_session_token_idx
  ON public.players(session_token)
  WHERE session_token IS NOT NULL;

-- Le rôle anon ne doit PAS lire ces colonnes (sinon il peut hijacker une session).
-- Les Edge Functions utilisent service_role qui bypass tout.
-- Pas de GRANT explicite sur ces colonnes pour anon = pas d'accès (le précédent
-- REVOKE ALL ; GRANT SELECT (col1, col2, ...) ne les inclut pas).

COMMENT ON COLUMN public.players.session_token IS 'UUID v4 régénéré à chaque login. Lu uniquement par les Edge Functions (service_role).';
COMMENT ON COLUMN public.players.session_expires_at IS 'Date d''expiration de la session. Refreshée à chaque save réussi.';
