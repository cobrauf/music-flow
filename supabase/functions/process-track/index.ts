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
    frequency_hz?: number;
    midi_note?: number;
    pitch_confidence?: number;
    pitch_source?: string;
  }>;
  melody_notes?: Array<{
    time_ms: number;
    duration_ms?: number;
    frequency_hz?: number;
    midi_note?: number;
    pitch_confidence?: number;
    pitch_source?: string;
  }>;
};

type LevelMapEvent = {
  time_ms: number;
  action: "spawn_node" | "piano_tile" | "pulse_field" | "shift_visual_state";
  lane?: number;
  intensity?: number;
  color?: string;
  target_color?: string;
  duration_ms?: number;
  frequency_hz?: number;
  midi_note?: number;
  pitch_confidence?: number;
  pitch_source?: string;
};

type LevelMap = {
  schema_version: number;
  theme: string;
  bpm: number;
  duration_ms: number;
  events: LevelMapEvent[];
};

type NormalizedOnset = {
  time_ms: number;
  intensity: number;
  frequency_hz?: number;
  midi_note?: number;
  pitch_confidence?: number;
  pitch_source?: string;
};

type NormalizedMelodyNote = {
  time_ms: number;
  duration_ms?: number;
  frequency_hz?: number;
  midi_note?: number;
  pitch_confidence?: number;
  pitch_source?: string;
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
      melodyNotes: normalizeMelodyNotes(payload.analysis?.melody_notes),
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
  onsets: NormalizedOnset[];
  melodyNotes: NormalizedMelodyNote[];
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
      frequency_hz: onset.frequency_hz,
      midi_note: onset.midi_note,
      pitch_confidence: onset.pitch_confidence,
      pitch_source: onset.pitch_source,
    });
  }

  const melodyTileEvents: NormalizedMelodyNote[] = input.melodyNotes.length > 0
    ? input.melodyNotes
    : onsetEvents
      .filter((onset) => onset.frequency_hz || onset.midi_note)
      .map((onset) => ({
        time_ms: onset.time_ms,
        frequency_hz: onset.frequency_hz,
        midi_note: onset.midi_note,
        pitch_confidence: onset.pitch_confidence,
        pitch_source: onset.pitch_source,
      }));

  for (let index = 0; index < melodyTileEvents.length; index += 1) {
    const note = melodyTileEvents[index];
    if (note.time_ms >= input.durationMs) continue;

    events.push({
      time_ms: note.time_ms,
      action: "piano_tile",
      lane: noteToLane(note, index),
      duration_ms: note.duration_ms,
      intensity: clampIntensity(0.45 + (note.pitch_confidence ?? 0.35) * 0.45),
      color: colors[index % colors.length],
      frequency_hz: note.frequency_hz,
      midi_note: note.midi_note,
      pitch_confidence: note.pitch_confidence,
      pitch_source: note.pitch_source,
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
  const onsets: NormalizedOnset[] = [];
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
      frequency_hz: clampFrequency(onset.frequency_hz),
      midi_note: clampMidiNote(onset.midi_note),
      pitch_confidence: clampPitchConfidence(onset.pitch_confidence),
      pitch_source: normalizePitchSource(onset.pitch_source),
    }))
    .filter((onset) => Number.isFinite(onset.time_ms) && onset.time_ms >= 0)
    .sort((a, b) => a.time_ms - b.time_ms)
    .slice(0, 240);
}

function normalizeMelodyNotes(notes: AudioAnalysis["melody_notes"]) {
  if (!Array.isArray(notes)) return [];
  return notes
    .map((note) => ({
      time_ms: Math.round(Number(note.time_ms)),
      duration_ms: clampNoteDuration(note.duration_ms),
      frequency_hz: clampFrequency(note.frequency_hz),
      midi_note: clampMidiNote(note.midi_note),
      pitch_confidence: clampPitchConfidence(note.pitch_confidence),
      pitch_source: normalizePitchSource(note.pitch_source),
    }))
    .filter((note) => (
      Number.isFinite(note.time_ms) &&
      note.time_ms >= 0 &&
      Boolean(note.frequency_hz || note.midi_note)
    ))
    .sort((a, b) => a.time_ms - b.time_ms)
    .slice(0, 260);
}

function noteToLane(note: NormalizedMelodyNote, index: number) {
  const midiNote = note.midi_note ?? (note.frequency_hz ? frequencyToMidi(note.frequency_hz) : undefined);
  if (!Number.isFinite(midiNote)) return index % 4;
  const octavePosition = ((Math.round(midiNote as number) % 12) + 12) % 12;
  if (octavePosition <= 2) return 0;
  if (octavePosition <= 5) return 1;
  if (octavePosition <= 8) return 2;
  return 3;
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

function clampNoteDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return undefined;
  return Math.max(40, Math.min(10000, Math.round(duration)));
}

function clampFrequency(value: unknown) {
  const frequency = Number(value);
  if (!Number.isFinite(frequency) || frequency < 55 || frequency > 1760) return undefined;
  return Math.round(frequency * 10) / 10;
}

function clampMidiNote(value: unknown) {
  const midiNote = Number(value);
  if (!Number.isFinite(midiNote) || midiNote < 21 || midiNote > 108) return undefined;
  return Math.round(midiNote);
}

function clampPitchConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return undefined;
  return Math.max(0, Math.min(1, confidence));
}

function normalizePitchSource(value: unknown) {
  if (value !== "melodia" && value !== "autocorrelation" && value !== "manual") return undefined;
  return value;
}

function frequencyToMidi(frequency: number) {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
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
