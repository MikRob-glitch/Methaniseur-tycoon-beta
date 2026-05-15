// v25.14 — Edge Function players-api
// Actions : login / register / save / logout / leaderboard
// Auth via session_token (UUID stocké en DB, regénéré à chaque login).
//
// v25.14 : VAGUE 1 LEADERBOARDS MULTI-AXES
//   - save : calcule current_yield + snapshot quotidien automatique
//   - leaderboard : 4 modes (performance / mastery / cumulative_season / cumulative_lifetime)
//
// v25.13.2 : clamp monotone sur tous champs durables
// v25.13.1 : clamp au max(old, new) au lieu de rejeter
// v25.13.0 : Edge Function initiale

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SESSION_TTL_MS    = 24 * 60 * 60 * 1000;
const SNAPSHOT_MIN_GAP  = 24 * 60 * 60 * 1000;  // au plus 1 snapshot par 24h
const MAX_RATE_PER_SEC  = 1000;
const CAP               = 1e9;
const PERF_WINDOW_DAYS  = 7;
const GNV_BONUS         = 1.2;                  // pondération GNV côté leaderboard

const MAIA_RX = /^[A-Z0-9_-]{2,32}$/;
const HASH_RX = /^[0-9a-f]{64}$/;
const UUID_RX = /^[0-9a-f-]{36}$/i;
const REGIONS = new Set(["Nord-Ouest","Île-de-France","Est","Centre-Ouest","Sud-Ouest","Sud-Est"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

function j(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: CORS }); }
function num(v: unknown, def = 0): number { const n = Number(v); return Number.isFinite(n) ? n : def; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return j({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return j({ error: "invalid_json" }, 400); }

  try {
    switch (body.action) {
      case "login":       return await handleLogin(body);
      case "register":    return await handleRegister(body);
      case "save":        return await handleSave(body);
      case "logout":      return await handleLogout(body);
      case "leaderboard": return await handleLeaderboard(body);
      default:            return j({ error: "unknown_action" }, 400);
    }
  } catch (err) {
    console.error("[players-api]", err);
    return j({ error: "internal", detail: String(err) }, 500);
  }
});

async function handleLogin({ maia, password_hash }: any) {
  if (typeof maia !== "string" || !MAIA_RX.test(maia)) return j({ error: "invalid_credentials" }, 401);
  if (typeof password_hash !== "string" || !HASH_RX.test(password_hash)) return j({ error: "invalid_credentials" }, 401);
  const { data: player } = await sb.from("players").select("maia, username, region, password_hash").eq("maia", maia).maybeSingle();
  if (!player || player.password_hash !== password_hash) return j({ error: "invalid_credentials" }, 401);
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sb.from("players").update({ session_token: token, session_expires_at: expires }).eq("maia", maia);
  return j({ ok: true, session_token: token, maia: player.maia, username: player.username, region: player.region });
}

async function handleRegister({ maia, password_hash, username, region }: any) {
  if (typeof maia !== "string" || !MAIA_RX.test(maia)) return j({ error: "invalid_maia" }, 400);
  if (typeof password_hash !== "string" || !HASH_RX.test(password_hash)) return j({ error: "invalid_hash" }, 400);
  if (typeof username !== "string" || username.length < 2 || username.length > 64) return j({ error: "invalid_username" }, 400);
  if (typeof region !== "string" || !REGIONS.has(region)) return j({ error: "invalid_region" }, 400);
  const { data: existing } = await sb.from("players").select("maia").eq("maia", maia).maybeSingle();
  if (existing) return j({ error: "maia_taken" }, 409);
  const id = maia.toLowerCase().replace(/\s+/g, "_");
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const nowIso = new Date().toISOString();
  const { error } = await sb.from("players").insert({
    id, maia, password_hash, username, region,
    score_network: 0, score_gnv: 0, is_connected: false, buffer: 10,
    mo: 0, tut_step: 0, stock: 0, charge: 0,
    stock_yield: 0, charge_yield: 0,
    stock_composition: [0,0,0,0,0,0,0], charge_composition: [0,0,0,0,0,0,0],
    owned: [0,0,0,0,0,0,0],
    epurateur: false, compresseur: false, digesteurs: 1,
    gnv_stations: 0, gnv_split: 20, gnv_bm: 0, tractor_gnv: false,
    euros: 0, auto_dump: false, auto_dump_threshold: 0,
    tractor_count: 1, tractor_speed_boost: false, tractor_trailers: 1,
    tractor_gnv_arr: [false, false, false],
    pinned_zones: [],
    local_stock: [0,0,0,0,0,0,0],
    zone_state: ["ok","ok","ok","ok","ok","ok","ok"],
    saturated_since: [null,null,null,null,null,null,null],
    offline_until: [null,null,null,null,null,null,null],
    reliability: 100,
    session_token: token, session_expires_at: expires,
    season_started_at: nowIso, season_start_score_network: 0, season_start_score_gnv: 0,
    current_yield: 0,
    updated_at: nowIso,
    last_saved: nowIso,
  });
  if (error) return j({ error: "insert_failed", detail: error.message }, 500);
  return j({ ok: true, session_token: token, maia, username, region });
}

async function handleSave({ session_token, state }: any) {
  if (typeof session_token !== "string" || !UUID_RX.test(session_token)) return j({ error: "invalid_token" }, 401);
  if (!state || typeof state !== "object") return j({ error: "missing_state" }, 400);

  const { data: old } = await sb.from("players")
    .select("maia, score_network, score_gnv, euros, digesteurs, gnv_stations, tractor_count, tractor_trailers, owned, tractor_gnv_arr, epurateur, compresseur, is_connected, tractor_speed_boost, tut_step, current_yield, session_expires_at, last_saved")
    .eq("session_token", session_token)
    .maybeSingle();
  if (!old) return j({ error: "invalid_token" }, 401);
  if (!old.session_expires_at || new Date(old.session_expires_at).getTime() < Date.now()) {
    return j({ error: "session_expired" }, 401);
  }

  const ALLOWED = new Set([
    "score_network","score_gnv","is_connected","buffer",
    "epurateur","compresseur","digesteurs","euros",
    "mo","tut_step","owned","stock","charge",
    "stock_yield","charge_yield","stock_composition","charge_composition",
    "gnv_stations","gnv_split","gnv_bm","tractor_gnv",
    "auto_dump","auto_dump_threshold",
    "tractor_count","tractor_speed_boost","tractor_trailers","tractor_gnv_arr",
    "pinned_zones","local_stock","zone_state","saturated_since","offline_until",
    "reliability",
  ]);
  const upd: Record<string, unknown> = {};
  for (const k of Object.keys(state)) if (ALLOWED.has(k)) upd[k] = (state as any)[k];

  // Scores monotones + cap + anti-cheat
  if ("score_network" in upd) {
    const newNet = num(upd.score_network, 0);
    if (newNet > CAP) return j({ error: "score_out_of_range", field: "score_network" }, 400);
    if (newNet < 0)   return j({ error: "score_negative", field: "score_network" }, 400);
    const oldNet = Number(old.score_network || 0);
    upd.score_network = Math.max(newNet, oldNet);
    const lastMs = old.last_saved ? new Date(old.last_saved).getTime() : Date.now() - SESSION_TTL_MS;
    const elapsedSec = Math.max(1, (Date.now() - lastMs) / 1000);
    const maxGain = MAX_RATE_PER_SEC * elapsedSec + 1e6;
    if ((newNet - oldNet) > maxGain) {
      console.warn("[Save] gain_implausible network", { maia: old.maia, gained: newNet - oldNet, maxGain });
      upd.score_network = Math.min(newNet, oldNet + maxGain);
    }
  }
  if ("score_gnv" in upd) {
    const newGnv = num(upd.score_gnv, 0);
    if (newGnv > CAP) return j({ error: "score_out_of_range", field: "score_gnv" }, 400);
    if (newGnv < 0)   return j({ error: "score_negative", field: "score_gnv" }, 400);
    const oldGnv = Number(old.score_gnv || 0);
    upd.score_gnv = Math.max(newGnv, oldGnv);
    const lastMs = old.last_saved ? new Date(old.last_saved).getTime() : Date.now() - SESSION_TTL_MS;
    const elapsedSec = Math.max(1, (Date.now() - lastMs) / 1000);
    const maxGain = MAX_RATE_PER_SEC * elapsedSec + 1e6;
    if ((newGnv - oldGnv) > maxGain) {
      console.warn("[Save] gain_implausible gnv", { maia: old.maia, gained: newGnv - oldGnv, maxGain });
      upd.score_gnv = Math.min(newGnv, oldGnv + maxGain);
    }
  }
  if ("euros" in upd) {
    const newEur = num(upd.euros, 0);
    if (newEur > CAP) return j({ error: "score_out_of_range", field: "euros" }, 400);
    if (newEur < 0)   return j({ error: "score_negative", field: "euros" }, 400);
    upd.euros = newEur;
  }

  // Entiers monotones
  for (const k of ["digesteurs","gnv_stations","tractor_count","tut_step"]) {
    if (k in upd) {
      const newV = num(upd[k as keyof typeof upd] as any, 0);
      const oldV = Number((old as any)[k] || 0);
      upd[k] = Math.max(newV, oldV);
    }
  }

  if ("tractor_trailers" in upd) {
    const v = upd.tractor_trailers;
    const o = (old as any).tractor_trailers;
    if (typeof v === "number" && typeof o === "number") upd.tractor_trailers = Math.max(v, o);
    else if (Array.isArray(v) && Array.isArray(o)) upd.tractor_trailers = v.map((nv: any, i: number) => Math.max(num(nv, 0), num(o[i], 0)));
  }

  // Booleans one-way
  for (const k of ["epurateur","compresseur","is_connected","tractor_speed_boost"]) {
    if (k in upd) {
      const newV = !!upd[k as keyof typeof upd];
      const oldV = !!(old as any)[k];
      upd[k] = newV || oldV;
    }
  }

  // Array booleans monotone
  if ("tractor_gnv_arr" in upd) {
    const newArr = Array.isArray(upd.tractor_gnv_arr) ? upd.tractor_gnv_arr : [];
    const oldArr = Array.isArray((old as any).tractor_gnv_arr) ? (old as any).tractor_gnv_arr : [];
    const len = Math.max(newArr.length, oldArr.length, 3);
    upd.tractor_gnv_arr = Array.from({length: len}, (_, i) => !!newArr[i] || !!oldArr[i]);
  }

  // Array ints monotone par index
  if ("owned" in upd) {
    const newArr = Array.isArray(upd.owned) ? upd.owned : [0,0,0,0,0,0,0];
    const oldArr = Array.isArray((old as any).owned) ? (old as any).owned : [0,0,0,0,0,0,0];
    const len = Math.max(newArr.length, oldArr.length, 7);
    upd.owned = Array.from({length: len}, (_, i) => Math.max(num(newArr[i], 0), num(oldArr[i], 0)));
  }

  // v25.14 — current_yield = stock_yield (m³ CH₄/t du stock courant). Métrique de Maîtrise.
  if ("stock_yield" in upd) {
    const sy = num(upd.stock_yield, 0);
    upd.current_yield = sy > 0 ? sy : (Number(old.current_yield || 0));
  }

  // Timestamps : serveur autoritaire
  upd.session_expires_at = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  upd.last_saved         = new Date().toISOString();
  upd.updated_at         = new Date().toISOString();

  const { error } = await sb.from("players").update(upd).eq("session_token", session_token);
  if (error) return j({ error: "save_failed", detail: error.message }, 500);

  // v25.14 — snapshot quotidien (au plus 1 par 24h) pour le calcul de Performance 7j
  try {
    const { data: lastSnap } = await sb.from("players_snapshots")
      .select("snapshot_at")
      .eq("maia", old.maia)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const needSnap = !lastSnap || (Date.now() - new Date(lastSnap.snapshot_at).getTime()) > SNAPSHOT_MIN_GAP;
    if (needSnap) {
      await sb.from("players_snapshots").insert({
        maia: old.maia,
        score_network: upd.score_network ?? old.score_network ?? 0,
        score_gnv:     upd.score_gnv     ?? old.score_gnv     ?? 0,
        current_yield: upd.current_yield ?? old.current_yield ?? 0,
      });
    }
  } catch (e) {
    console.warn("[Snapshot] failed (non-blocking)", e);
  }

  return j({ ok: true });
}

async function handleLogout({ session_token }: any) {
  if (typeof session_token === "string" && UUID_RX.test(session_token)) {
    await sb.from("players").update({ session_token: null, session_expires_at: null }).eq("session_token", session_token);
  }
  return j({ ok: true });
}

// --- LEADERBOARD ------------------------------------------------------------
// modes : performance (m³/jour sur 7j) | mastery (yield CH₄/t) | cumulative_season | cumulative_lifetime
// region optionnel : si fourni, filtre les joueurs de cette région
async function handleLeaderboard({ mode, region, limit }: any) {
  const max = Math.min(num(limit, 50), 200);
  const validModes = new Set(["performance", "mastery", "cumulative_season", "cumulative_lifetime"]);
  if (!validModes.has(mode)) return j({ error: "unknown_mode" }, 400);
  const filterRegion = (typeof region === "string" && REGIONS.has(region)) ? region : null;

  if (mode === "mastery") {
    let q = sb.from("players")
      .select("maia, username, region, current_yield, score_network, score_gnv, is_connected, digesteurs, epurateur, compresseur, euros")
      .order("current_yield", { ascending: false, nullsFirst: false })
      .limit(max);
    if (filterRegion) q = q.eq("region", filterRegion);
    const { data, error } = await q;
    if (error) return j({ error: "query_failed", detail: error.message }, 500);
    return j({ ok: true, mode, results: data || [] });
  }

  if (mode === "cumulative_lifetime") {
    let q = sb.from("players")
      .select("maia, username, region, score_network, score_gnv, current_yield, is_connected, digesteurs, epurateur, compresseur, euros")
      .order("score_network", { ascending: false })
      .limit(max);
    if (filterRegion) q = q.eq("region", filterRegion);
    const { data, error } = await q;
    if (error) return j({ error: "query_failed", detail: error.message }, 500);
    return j({ ok: true, mode, results: data || [] });
  }

  if (mode === "cumulative_season") {
    let q = sb.from("players")
      .select("maia, username, region, score_network, score_gnv, current_yield, season_started_at, season_start_score_network, season_start_score_gnv, is_connected, digesteurs, epurateur, compresseur, euros")
      .limit(500);
    if (filterRegion) q = q.eq("region", filterRegion);
    const { data, error } = await q;
    if (error) return j({ error: "query_failed", detail: error.message }, 500);
    const scored = (data || []).map((r: any) => {
      const seasonNet = Math.max(0, (Number(r.score_network) || 0) - (Number(r.season_start_score_network) || 0));
      const seasonGnv = Math.max(0, (Number(r.score_gnv)     || 0) - (Number(r.season_start_score_gnv)     || 0));
      return {
        ...r,
        season_network: seasonNet,
        season_gnv:     seasonGnv,
        season_score:   seasonNet + seasonGnv * GNV_BONUS,
      };
    });
    scored.sort((a, b) => b.season_score - a.season_score);
    return j({ ok: true, mode, results: scored.slice(0, max) });
  }

  if (mode === "performance") {
    const targetIso = new Date(Date.now() - PERF_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let q = sb.from("players")
      .select("maia, username, region, score_network, score_gnv, current_yield, is_connected, digesteurs, epurateur, compresseur, euros")
      .limit(500);
    if (filterRegion) q = q.eq("region", filterRegion);
    const { data: players, error } = await q;
    if (error) return j({ error: "query_failed", detail: error.message }, 500);

    const results: any[] = [];
    for (const p of (players || [])) {
      const { data: snap } = await sb.from("players_snapshots")
        .select("score_network, score_gnv")
        .eq("maia", p.maia)
        .lte("snapshot_at", targetIso)
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const oldNet = Number(snap?.score_network ?? p.score_network ?? 0);
      const oldGnv = Number(snap?.score_gnv     ?? p.score_gnv     ?? 0);
      const perfNet = Math.max(0, (Number(p.score_network) || 0) - oldNet) / PERF_WINDOW_DAYS;
      const perfGnv = Math.max(0, (Number(p.score_gnv)     || 0) - oldGnv) / PERF_WINDOW_DAYS;
      results.push({
        ...p,
        perf_network_per_day: perfNet,
        perf_gnv_per_day:     perfGnv,
        perf_score:           perfNet + perfGnv * GNV_BONUS,
      });
    }
    results.sort((a, b) => b.perf_score - a.perf_score);
    return j({ ok: true, mode, results: results.slice(0, max) });
  }

  return j({ error: "unknown_mode" }, 400);
}
