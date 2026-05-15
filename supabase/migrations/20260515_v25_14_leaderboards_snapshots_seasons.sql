-- v25.14 — Vague 1 : leaderboards multi-axes
-- Schéma pour : Performance (moyenne 7j) + Maîtrise (yield) + Cumul saison
--
-- Appliquée en prod le 2026-05-15 via Supabase MCP apply_migration.

-- 1. Snapshots quotidiens (un par joueur, max 1 par 24h)
CREATE TABLE IF NOT EXISTS public.players_snapshots (
  maia          TEXT NOT NULL,
  snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_network DOUBLE PRECISION,
  score_gnv     DOUBLE PRECISION,
  current_yield NUMERIC,
  PRIMARY KEY (maia, snapshot_at)
);

CREATE INDEX IF NOT EXISTS players_snapshots_maia_recent_idx
  ON public.players_snapshots(maia, snapshot_at DESC);

ALTER TABLE public.players_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT (maia, snapshot_at, score_network, score_gnv, current_yield)
  ON public.players_snapshots TO anon;
DROP POLICY IF EXISTS "snapshots_public_read" ON public.players_snapshots;
CREATE POLICY "snapshots_public_read"
  ON public.players_snapshots FOR SELECT TO anon USING (true);

-- 2. Colonnes saison dans players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS season_started_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS season_start_score_network DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_start_score_gnv     DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_yield              NUMERIC DEFAULT 0;

GRANT SELECT (
  season_started_at, season_start_score_network, season_start_score_gnv, current_yield
) ON public.players TO anon;

-- 3. Initialisation : tous les comptes existants démarrent leur saison MAINTENANT
--    avec leur score actuel comme baseline → ils repartent à 0 sur "Cumul saison"
UPDATE public.players
SET
  season_started_at          = NOW(),
  season_start_score_network = COALESCE(score_network, 0),
  season_start_score_gnv     = COALESCE(score_gnv, 0)
WHERE season_started_at IS NULL;

-- 4. RPC utilitaire pour Edge Function leaderboard mode "performance"
CREATE OR REPLACE FUNCTION public.get_snapshot_at_or_before(p_maia TEXT, p_target TIMESTAMPTZ)
RETURNS TABLE(snapshot_at TIMESTAMPTZ, score_network DOUBLE PRECISION, score_gnv DOUBLE PRECISION)
LANGUAGE sql STABLE
AS $$
  SELECT s.snapshot_at, s.score_network, s.score_gnv
  FROM public.players_snapshots s
  WHERE s.maia = p_maia AND s.snapshot_at <= p_target
  ORDER BY s.snapshot_at DESC
  LIMIT 1;
$$;

COMMENT ON TABLE  public.players_snapshots IS 'Snapshots quotidiens des scores pour calcul de performance glissante (moyenne 7j).';
COMMENT ON COLUMN public.players.season_started_at IS 'Début de la saison actuelle du joueur (saison ouverte sans fin pour l''instant).';
COMMENT ON COLUMN public.players.current_yield     IS 'Yield CH₄/t actuel du stock_composition, mis à jour par l''Edge Function à chaque save.';
