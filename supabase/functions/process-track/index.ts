import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ProcessTrackRequest = {
  track_id?: string;
  storage_path?: string;
  analysis?: AudioAnalysis;
};

type AudioAnalysis = {
  bpm?: number;
  duration_ms?: number;
  onsets?: Array<{
    time_ms: number;
    intensity?: number;
  }>;
};

type LevelMapEvent = {
  time_ms: number;
  action: "spawn_node" | "pulse_field" | "shift_visual_state";
  lane?: number;
  intensity?: number;
  color?: string;
  target_color?: string;
};

type LevelMap = {
  schema_version: number;
  theme: string;
  bpm: number;
  duration_ms: number;
  events: LevelMapEvent[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing SB service configuration" }, 500);
  }

  let payload: ProcessTrackRequest;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON request body" }, 400);
  }

  if (!payload.track_id) {
    return json({ error: "track_id is required" }, 400);
  }

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: track, error: readError } = await sb
    .from("tracks")
    .select("id,title,storage_path,bpm,duration_ms")
    .eq("id", payload.track_id)
    .single();

  if (readError || !track) {
    return json({ error: readError?.message ?? "Track not found" }, 404);
  }

  await sb
    .from("tracks")
    .update({
      processing_status: "processing",
      processing_error: null,
    })
    .eq("id", payload.track_id);

  try {
    const storagePath = payload.storage_path ?? track.storage_path;
    const levelMap = buildLevelMap({
      title: track.title,
      bpm: clampBpm(payload.analysis?.bpm ?? track.bpm ?? 72),
      durationMs: clampDuration(payload.analysis?.duration_ms ?? track.duration_ms ?? 64000),
      storagePath,
      onsets: normalizeOnsets(payload.analysis?.onsets),
    });

    validateLevelMap(levelMap);

    const { error: updateError } = await sb
      .from("tracks")
      .update({
        bpm: levelMap.bpm,
        duration_ms: levelMap.duration_ms,
        level_map: levelMap,
        processing_status: "ready",
        is_published: true,
        processing_error: null,
      })
      .eq("id", payload.track_id);

    if (updateError) {
      throw updateError;
    }

    return json({ track_id: payload.track_id, status: "ready", level_map: levelMap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await sb
      .from("tracks")
      .update({
        processing_status: "failed",
        processing_error: message,
      })
      .eq("id", payload.track_id);

    return json({ error: message }, 500);
  }
});

function buildLevelMap(input: {
  title: string;
  bpm: number;
  durationMs: number;
  storagePath: string;
  onsets: Array<{ time_ms: number; intensity: number }>;
}): LevelMap {
  const beatMs = Math.round(60000 / input.bpm);
  const colors = ["#66d8cb", "#edcb7e", "#b99cff", "#e58ba8"];
  const events: LevelMapEvent[] = [];
  const onsetEvents = input.onsets.length > 0
    ? input.onsets
    : fallbackOnsets(input.durationMs, beatMs);

  for (let index = 0; index < onsetEvents.length; index += 1) {
    const onset = onsetEvents[index];
    if (onset.time_ms >= input.durationMs) continue;

    if (index % 8 === 0) {
      events.push({
        time_ms: Math.max(0, onset.time_ms - Math.round(beatMs * 0.25)),
        action: "pulse_field",
        intensity: clampIntensity(0.35 + onset.intensity * 0.45),
        color: colors[index % colors.length],
      });
    }

    if (index % 16 === 8) {
      events.push({
        time_ms: onset.time_ms,
        action: "shift_visual_state",
        target_color: colors[(index + 1) % colors.length],
        intensity: clampIntensity(0.35 + onset.intensity * 0.25),
      });
    }

    events.push({
      time_ms: onset.time_ms,
      action: "spawn_node",
      lane: index % 4,
      intensity: clampIntensity(0.35 + onset.intensity * 0.55),
      color: colors[index % colors.length],
    });
  }

  return {
    schema_version: 1,
    theme: "aurora_ripple",
    bpm: input.bpm,
    duration_ms: input.durationMs,
    events: events.sort((a, b) => a.time_ms - b.time_ms),
  };
}

function fallbackOnsets(durationMs: number, beatMs: number) {
  const onsets: Array<{ time_ms: number; intensity: number }> = [];
  for (let time = beatMs; time < durationMs; time += beatMs * 2) {
    onsets.push({ time_ms: time + Math.round(beatMs * 0.9), intensity: 0.55 });
  }
  return onsets;
}

function normalizeOnsets(onsets: AudioAnalysis["onsets"]) {
  if (!Array.isArray(onsets)) return [];
  return onsets
    .map((onset) => ({
      time_ms: Math.round(Number(onset.time_ms)),
      intensity: clampIntensity(Number(onset.intensity ?? 0.5)),
    }))
    .filter((onset) => Number.isFinite(onset.time_ms) && onset.time_ms >= 0)
    .sort((a, b) => a.time_ms - b.time_ms)
    .slice(0, 240);
}

function clampBpm(value: number) {
  if (!Number.isFinite(value)) return 72;
  return Math.max(30, Math.min(220, Math.round(value)));
}

function clampDuration(value: number) {
  if (!Number.isFinite(value)) return 64000;
  return Math.max(1000, Math.min(60 * 60 * 1000, Math.round(value)));
}

function clampIntensity(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.1, Math.min(1, value));
}

function validateLevelMap(levelMap: LevelMap) {
  if (!levelMap.theme) {
    throw new Error("level_map.theme is required");
  }

  if (!Array.isArray(levelMap.events) || levelMap.events.length === 0) {
    throw new Error("level_map.events must be a non-empty array");
  }

  for (const event of levelMap.events) {
    if (!Number.isFinite(event.time_ms) || event.time_ms < 0) {
      throw new Error("Every level_map event needs a non-negative time_ms");
    }

    if (!event.action) {
      throw new Error("Every level_map event needs an action");
    }
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
