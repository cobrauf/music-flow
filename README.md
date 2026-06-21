# Music Flow

Music Flow is a web-first audio-visual MVP for calm rhythm interaction. The product loop is:

```text
Admin audio upload -> SB Storage -> synthesis pipeline -> level_map JSON -> synchronized web playback
```

Throughout this project, **SB means Supabase**.

## Current Phase

**Phase 1 is in progress:** keep the static GitHub Pages prototype live while adding the SB data contract, migration, and Edge Function scaffold. This gives the project a concrete surface before Flutter, hosted SB credentials, and Gemini secrets are wired in.

### Phase Plan

| Phase | Goal | Status |
| --- | --- | --- |
| 1 | Static prototype, `level_map` contract, SB schema, deployment docs | In progress |
| 2 | Flutter web app foundation with catalog/player routes | Planned |
| 3 | Admin upload flow using `supabase_flutter` and SB Storage | Planned |
| 4 | SB Edge Function synthesis pipeline with Essentia.js and Gemini Flash | Planned |
| 5 | GitHub Actions Flutter web build and Pages deployment | Planned |
| 6 | End-to-end MVP validation with one uploaded ready track | Planned |

## Repository Layout

```text
.
├── index.html
├── data/
│   └── sample-level-map.json
├── supabase/
│   ├── migrations/
│   │   └── 202606210001_music_flow_foundation.sql
│   └── functions/
│       └── process-track/
│           └── index.ts
└── .github/workflows/pages.yml
```

## MVP Acceptance Criteria

- Uploading a valid `.mp3` or `.wav` stores the file in the SB `music-assets` bucket.
- Uploading creates or updates a row in `public.tracks` with `processing_status = 'uploaded'` or `processing`.
- Processing extracts timing features, asks Gemini Flash for calm choreography, validates JSON, and stores `level_map`.
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
- RLS policies for public ready-track reads and service-role writes.

## Edge Function

[supabase/functions/process-track/index.ts](supabase/functions/process-track/index.ts) is the first pipeline scaffold. It accepts:

```json
{
  "track_id": "uuid",
  "storage_path": "optional/path.mp3"
}
```

For Phase 1, it validates the request, marks the track as `processing`, builds a deterministic placeholder `level_map`, and marks the track `ready`. Phase 4 will replace the placeholder analysis with Essentia.js WASM and Gemini Flash choreography while preserving the same database contract.

## Static Prototype

The current `index.html` is the GitHub Pages prototype. It:

- Loads `data/sample-level-map.json`.
- Lets testers choose a local audio file for browser-only playback.
- Renders descending nodes and calm canvas pulses against the loaded timeline.
- Shows the admin upload/process flow as disabled placeholders until Phase 3.

Open `index.html` directly or use the deployed GitHub Pages URL.

## GitHub Pages Publishing

Publishing is handled by [.github/workflows/pages.yml](.github/workflows/pages.yml). On every push to `main`, GitHub Actions uploads the repository root as a Pages artifact and deploys it.

To finish setup in GitHub:

1. Open repository settings.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push `main`.

## Next Implementation Steps

1. Create the Flutter app scaffold in this repo without breaking the current Pages prototype.
2. Add `supabase_flutter`, `just_audio`, and the first catalog/player screens.
3. Move the static sample playback logic into Flutter models and rendering code.
4. Build authenticated admin upload against SB Storage and `tracks`.
5. Replace placeholder Edge Function synthesis with Essentia.js and Gemini Flash.
