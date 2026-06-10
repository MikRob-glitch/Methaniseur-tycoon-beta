-- v25.21 — Classement Maîtrise : pic hebdo (best_yield) + reset lazy chaque lundi 00h UTC
--
-- Appliquée en prod le 2026-06-10 via Supabase MCP apply_migration.
--
-- Contexte : current_yield est une valeur live écrasée à chaque save, donc le
-- classement Maîtrise ne gardait pas le meilleur score atteint. best_yield
-- capture le pic de la semaine en cours (jamais redescendu par l'Edge Function,
-- voir handleSave). mastery_state pilote un reset hebdomadaire lazy (sans cron) :
-- au premier appel après le lundi 00h UTC suivant week_started_at, l'Edge
-- Function capture le top3 par best_yield, avance week_started_at, et remet
-- best_yield=0 pour tous les joueurs.

-- 1. Pic hebdomadaire de rendement
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS best_yield NUMERIC DEFAULT 0;

-- Initialisation : les joueurs existants démarrent avec leur yield actuel comme pic
UPDATE public.players
SET best_yield = COALESCE(current_yield, 0)
WHERE best_yield IS NULL OR best_yield = 0;

GRANT SELECT (best_yield) ON public.players TO anon;

-- 2. État singleton du cycle hebdomadaire Maîtrise
CREATE TABLE IF NOT EXISTS public.mastery_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  week_started_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
  last_week_started_at TIMESTAMPTZ,
  last_top3 JSONB,
  CONSTRAINT mastery_state_singleton CHECK (id = 1)
);

INSERT INTO public.mastery_state (id, week_started_at)
VALUES (1, date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mastery_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mastery_state TO anon;
DROP POLICY IF EXISTS "mastery_state_public_read" ON public.mastery_state;
CREATE POLICY "mastery_state_public_read"
  ON public.mastery_state FOR SELECT TO anon USING (true);

COMMENT ON COLUMN public.players.best_yield IS 'Pic de rendement m³ CH₄/t atteint pendant la semaine en cours (classement Maîtrise). Reset à 0 chaque lundi 00h UTC via mastery_state.';
COMMENT ON TABLE  public.mastery_state IS 'État singleton (id=1) du cycle hebdomadaire du classement Maîtrise : date de début de semaine + top3 capturé à la dernière transition.';
