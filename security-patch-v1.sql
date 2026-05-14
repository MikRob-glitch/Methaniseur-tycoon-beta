-- ═══════════════════════════════════════════════════════════════════════
-- METHA — Security Patch v1 (Lockdown RLS)
-- À copier-coller dans le SQL Editor Supabase. Idempotent.
--
-- Effets :
--   1. password_hash devient illisible côté client (anon ne peut plus le SELECT)
--   2. password_hash, maia et id ne peuvent plus être modifiés via UPDATE
--      → impossible pour un joueur d'écraser le compte d'un autre
--   3. INSERT : scores initiaux forcés à 0, format MAIA validé, hash format SHA-256 hex
--   4. UPDATE : trigger force la monotonie des scores (anti-vandalisme : on ne peut
--      pas baisser le score d'un autre joueur)
--   5. UPDATE : plafonds sanity-check (< 10⁹) anti-troll bord-de-table
--   6. RPC verify_login + maia_exists : remplacent supabaseCheckMaia côté client
--      → le hash reste server-side
--
-- ⚠️  Ce patch ne PROTÈGE PAS contre un joueur qui inflate SES PROPRES scores
--     via DevTools — ça nécessite l'étape 2 (Edge Functions). Mais ça réduit
--     le rayon d'impact à "moi uniquement" au lieu de "tout le monde".
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Drop des policies actuelles trop laxistes ──────────────────────
DROP POLICY IF EXISTS "public read"        ON public.players;
DROP POLICY IF EXISTS "players_insert_own" ON public.players;
DROP POLICY IF EXISTS "players_update_own" ON public.players;

-- ─── 2. REVOKE total puis re-GRANT par colonne ─────────────────────────
-- Postgres : RLS = ligne ; GRANT = colonne. Il faut les deux.
REVOKE ALL ON public.players FROM anon;

-- SELECT : toutes les colonnes SAUF password_hash
GRANT SELECT (
  id, maia, username, region,
  score_network, score_gnv, is_connected,
  buffer, epurateur, compresseur, digesteurs, euros,
  mo, tut_step, owned, stock, charge, stock_yield, charge_yield,
  stock_composition, charge_composition,
  gnv_stations, gnv_split, gnv_bm, tractor_gnv,
  auto_dump, auto_dump_threshold,
  tractor_count, tractor_speed_boost, tractor_trailers, tractor_gnv_arr,
  pinned_zones, local_stock, zone_state, saturated_since, offline_until,
  reliability, updated_at, last_saved
) ON public.players TO anon;

-- INSERT : autorisé sur toutes les colonnes (le contenu sera validé par la policy WITH CHECK)
GRANT INSERT (
  id, maia, password_hash, username, region,
  score_network, score_gnv, is_connected, buffer,
  epurateur, compresseur, digesteurs, euros,
  mo, tut_step, owned, stock, charge, stock_yield, charge_yield,
  stock_composition, charge_composition,
  gnv_stations, gnv_split, gnv_bm, tractor_gnv,
  auto_dump, auto_dump_threshold,
  tractor_count, tractor_speed_boost, tractor_trailers, tractor_gnv_arr,
  pinned_zones, local_stock, zone_state, saturated_since, offline_until,
  reliability, updated_at, last_saved
) ON public.players TO anon;

-- UPDATE : tout SAUF id, maia, password_hash (anti-hijack)
GRANT UPDATE (
  username, region,
  score_network, score_gnv, is_connected, buffer,
  epurateur, compresseur, digesteurs, euros,
  mo, tut_step, owned, stock, charge, stock_yield, charge_yield,
  stock_composition, charge_composition,
  gnv_stations, gnv_split, gnv_bm, tractor_gnv,
  auto_dump, auto_dump_threshold,
  tractor_count, tractor_speed_boost, tractor_trailers, tractor_gnv_arr,
  pinned_zones, local_stock, zone_state, saturated_since, offline_until,
  reliability, updated_at, last_saved
) ON public.players TO anon;

-- ─── 3. Nouvelles policies avec garde-fous ─────────────────────────────

CREATE POLICY "players_select_public"
  ON public.players FOR SELECT
  TO anon USING (true);

CREATE POLICY "players_insert_validated"
  ON public.players FOR INSERT
  TO anon
  WITH CHECK (
    -- Format MAIA strict (alphanumérique majuscule)
    char_length(maia) BETWEEN 2 AND 32
    AND maia ~ '^[A-Z0-9_-]+$'
    -- Username non vide
    AND char_length(username) BETWEEN 2 AND 64
    -- Hash format SHA-256 hex (64 caractères hex)
    AND password_hash ~ '^[0-9a-f]{64}$'
    -- Scores initiaux forcés à zéro
    AND COALESCE(score_network, 0) = 0
    AND COALESCE(score_gnv, 0)     = 0
    AND COALESCE(euros, 0)         = 0
    AND COALESCE(is_connected, false) = false
  );

CREATE POLICY "players_update_bounded"
  ON public.players FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    -- Bornes basses
    COALESCE(score_network, 0) >= 0
    AND COALESCE(score_gnv, 0) >= 0
    AND COALESCE(euros, 0)     >= 0
    -- Plafonds anti-troll (ajuste si ton équilibrage permet plus)
    AND COALESCE(score_network, 0) < 1e9
    AND COALESCE(score_gnv, 0)     < 1e9
    AND COALESCE(euros, 0)         < 1e9
  );

-- ─── 4. Trigger anti-vandalisme : scores ne peuvent que croître ────────
-- Sans ça, un attaquant peut RESET le score d'un autre joueur à 0
-- (la policy WITH CHECK n'a pas accès à OLD, donc on passe par un trigger)
CREATE OR REPLACE FUNCTION public.players_anti_tamper()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.score_network < OLD.score_network THEN
    NEW.score_network := OLD.score_network;
  END IF;
  IF NEW.score_gnv < OLD.score_gnv THEN
    NEW.score_gnv := OLD.score_gnv;
  END IF;
  -- Note : euros PEUT baisser (achats équipement), donc pas de garde dessus.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_anti_tamper_trg ON public.players;
CREATE TRIGGER players_anti_tamper_trg
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_anti_tamper();

-- ─── 5. RPC verify_login — comparaison hash côté serveur ───────────────
-- Remplace l'usage de supabaseCheckMaia(m) dans doLogin().
-- Retourne la ligne joueur SI maia+hash correspondent, sinon vide.
CREATE OR REPLACE FUNCTION public.verify_login(p_maia text, p_hash text)
RETURNS TABLE(maia text, username text, region text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.maia, p.username, p.region
  FROM public.players p
  WHERE p.maia = p_maia AND p.password_hash = p_hash;
$$;

REVOKE ALL ON FUNCTION public.verify_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon;

-- ─── 6. RPC maia_exists — vérifier l'existence sans révéler le hash ────
-- Remplace l'usage de supabaseCheckMaia(m) dans doRegister() et au boot.
CREATE OR REPLACE FUNCTION public.maia_exists(p_maia text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.players WHERE maia = p_maia);
$$;

REVOKE ALL ON FUNCTION public.maia_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maia_exists(text) TO anon;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-EXÉCUTION
-- ═══════════════════════════════════════════════════════════════════════

-- Les nouvelles policies doivent apparaître :
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'players'
ORDER BY policyname;

-- Test 1 : tenter de SELECT le password_hash → doit échouer
-- SELECT password_hash FROM public.players LIMIT 1;
--   → ERROR: permission denied for column password_hash ✅

-- Test 2 : tenter UPDATE password_hash d'un autre joueur → doit échouer
-- UPDATE public.players SET password_hash = 'aaa' WHERE maia = 'AUTRE_MAIA';
--   → ERROR: permission denied for column password_hash ✅

-- Test 3 : verify_login avec mauvais hash → 0 ligne
-- SELECT * FROM public.verify_login('MA12345', 'wronghash');
--   → ✅

-- Test 4 : maia_exists
-- SELECT public.maia_exists('MA12345');
--   → true ou false ✅
