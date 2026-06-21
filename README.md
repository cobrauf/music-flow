# Music Flow

Music Flow is a web-first audio-visual MVP for calm rhythm interaction. The product loop is:

```text
Admin audio upload -> SB Storage -> synthesis pipeline -> level_map JSON -> synchronized web playback
```

Throughout this project, **SB means Supabase**.

## Current Phase

**Phase 2 is in progress:** the static GitHub Pages prototype can fetch ready tracks from SB, upload audio to Storage, extract lightweight timing features in the browser, invoke the processing function, and fall back to the local sample map. Flutter remains the planned app shell, but the current static prototype proves the hosted data loop first.

### Phase Plan

| Phase | Goal | Status |
| --- | --- | --- |
| 1 | Static prototype, `level_map` contract, SB schema, deployment docs | Done |
| 2 | SB-backed static catalog/player and upload/process loop | In progress |
| 3 | Flutter web app foundation with catalog/player/upload routes | Planned |
| 4 | SB Edge Function synthesis pipeline with Essentia.js and Gemini Flash | Planned |
| 5 | GitHub Actions Flutter web build and Pages deployment | Planned |
| 6 | End-to-end MVP validation with one uploaded ready track | Planned |

## Repository Layout

```text
.
+-- index.html
+-- data/
|   +-- sample-level-map.json
+-- supabase/
|   +-- migrations/
|   |   +-- 202606210001_music_flow_foundation.sql
|   +-- functions/
|       +-- process-track/
|           +-- index.ts
+-- .github/workflows/pages.yml
```

## MVP Acceptance Criteria

- Uploading a valid `.mp3` or `.wav` stores the file in the SB `music-assets` bucket.
- Uploading creates or updates a row in `public.tracks` with `processing_status = 'uploaded'` or `processing`.
- Processing extracts timing features, validates JSON, and stores `level_map`. Gemini Flash choreography remains planned for the full synthesis phase.
- Ready tracks are publicly readable by the frontend.
- The published page lists ready tracks, plays audio, and renders visuals synchronized to `level_map.events[*].time_ms`.
- GitHub Actions deploys the MVP page from `main` to GitHub Pages.

## Public Data Contract

### `tracks`

The `tracks` table is the central content record. See [supabase/migrations/202606210001_music_flow_foundation.sql](supabase/migrations/202606210001_music_flow_foundation.sql) for the executable schema.

Key fields:

- `id`: UUID primary key.
- `title`: track display title.
- `artist`: optional creator/artist name.
- `storage_path`: object path inside the `music-assets` bucket.
- `audio_url`: optional public or signed playback URL.
- `bpm`: detected or entered BPM.
- `processing_status`: `draft`, `uploaded`, `processing`, `ready`, `failed`, or `archived`.
- `is_published`: true when public users may read the track.
- `level_map`: generated gameplay JSON.
- `processing_error`: last pipeline error, if any.

### `level_map`

Minimum shape:

```json
{
  "theme": "aurora_ripple",
  "duration_ms": 64000,
  "events": [
    {
      "time_ms": 1200,
      "action": "spawn_node",
      "lane": 2,
      "intensity": 0.7,
      "color": "#65d6ca"
    }
  ]
}
```

Supported MVP actions:

- `spawn_node`: creates a descending hit node.
- `pulse_field`: adds a soft canvas pulse.
- `shift_visual_state`: changes the target visual color or mood.

## SB Setup

Install the SB CLI, authenticate, and link this repo to the hosted Music Flow project:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Create required function secrets:

```bash
supabase secrets set GEMINI_API_KEY=<key>
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase secrets set SB_SERVICE_ROLE_KEY=<service-role-key>
```

Deploy the processing function:

```bash
supabase functions deploy process-track
```

The initial migration creates:

- `music-assets` Storage bucket.
- `track_processing_status` enum.
- `public.tracks` table.
- `public.ready_tracks` view.
- Fast/open MVP access so the prototype can move quickly.

The current migration intentionally disables RLS on `tracks` and grants broad access for the MVP. Tighten this before inviting untrusted users or shipping anything beyond prototype scope.

## Edge Function

[supabase/functions/process-track/index.ts](supabase/functions/process-track/index.ts) is the first pipeline scaffold. It accepts:

```json
{
  "track_id": "uuid",
  "storage_path": "optional/path.mp3"
}
```

For Phase 2, it validates the request, marks the track as `processing`, accepts browser-derived BPM/duration/onset hints when available, builds a deterministic `level_map`, and marks the track `ready`. Phase 4 will replace the lightweight browser analysis with Essentia.js WASM and Gemini Flash choreography while preserving the same database contract.

## Static Prototype

The current `index.html` is the GitHub Pages prototype. It:

- Fetches `ready_tracks` from the linked SB project when a public anon key is provided.
- Saves the SB URL and anon key in browser local storage only.
- Falls back to `data/sample-level-map.json`.
- Lets testers choose a local audio file for browser-only playback.
- Uploads `.mp3` or `.wav` files to the `music-assets` bucket in fast MVP mode.
- Estimates duration, BPM, and onset peaks locally with the Web Audio API before upload processing.
- Creates a matching `tracks` row and invokes the deployed `process-track` Edge Function.
- Provides a mobile-first 4x6 tappable region grid that plays soft pentatonic Web Audio tones over the track.
- Renders descending nodes and calm canvas pulses against the loaded timeline.

Open `index.html` directly or use the deployed GitHub Pages URL.

To connect the prototype to SB:

1. Open the page.
2. Paste the public anon key from `Project Settings -> API Keys`.
3. Click `Load Ready Tracks`.
4. To test the full loop, fill `Admin Flow`, choose an audio file, and click `Upload and Process`.

The anon key is expected to be public frontend configuration. Never paste or commit the service-role key into frontend code.

## GitHub Pages Publishing

Publishing is handled by [.github/workflows/pages.yml](.github/workflows/pages.yml). On every push to `main`, GitHub Actions uploads the repository root as a Pages artifact and deploys it.

To finish setup in GitHub:

1. Open repository settings.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push `main`.

## Next Implementation Steps

1. Test one real audio upload through the static prototype.
2. Create the Flutter app scaffold in this repo without breaking the current Pages prototype.
3. Add `supabase_flutter`, `just_audio`, and the first catalog/player/upload screens.
4. Move the static sample playback logic into Flutter models and rendering code.
5. Replace placeholder Edge Function synthesis with Essentia.js and Gemini Flash.
