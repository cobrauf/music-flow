# Music Flow

Music Flow is an interactive mobile and web audio-visual experience designed to guide users into a psychological flow state through rhythmic interaction and reactive, tranquil art.

Unlike traditional rhythm games that emphasize high-speed reflexes, Music Flow prioritizes calmness, fluid movement, and aesthetic immersion.

## MVP Goal

Establish an end-to-end operational pipeline:

```text
User Audio Upload
  -> Backend AI / Algorithmic Synthesis
  -> Interactive JSON Level Map
  -> Beautiful Frontend Visualization
```

The MVP serves as a baseline sandbox to test and finalize the exact gameplay mechanics.

## Core User Flow

```text
[User Uploads Audio]
        |
        v
[Supabase Storage Bucket] -- triggers --> [Supabase Edge Function]
                                           |
                                           | Audio analysis and LLM choreography
                                           v
[Frontend UI - Flutter] <-- fetches map -- [Supabase Database - JSON]
```

### Upload Phase

A creator or admin uploads an ambient or calm audio file, such as `.mp3` or `.wav`, through the developer/admin dashboard.

### Analysis Phase

The backend processes the audio by isolating structural sections and rhythm transients, then hands this structural matrix to an LLM to generate a sequenced game layout.

### Consumption Phase

End users browse the available catalog in the mobile or web app, select a track, and download both the streamable audio file and its matching kinetic JSON mapping.

### Interactive Phase

The application uses synchronized rendering loops to generate reactive visuals that adapt fluidly to user interactions and music beats.

## Technical Stack Recommendation

| Component | Technology | Selection Rationale |
| --- | --- | --- |
| Cross-platform UI | Flutter 3.x / WebAssembly | Provides native cross-platform builds for iOS and Android with efficient browser rendering through Wasm. |
| Graphics engine | Flutter Canvas + Impeller + GLSL | Custom GLSL fragment shaders bypass standard widget layouts and draw directly on the GPU for fluid simulations and fractals. |
| Backend and database | Supabase | Provides Postgres provisioning, built-in row-level security, and a unified JavaScript/Dart SDK ecosystem. |
| File storage | Supabase Storage | Globally distributed CDN buckets for serving high-quality audio files. |
| Pipeline processing | Supabase Edge Functions | Globally distributed Deno/V8 isolate scripts for orchestrating third-party APIs and metadata extraction. |
| Audio intelligence | Essentia.js WASM + Gemini Flash API | Essentia.js analyzes physical onsets and beats, while Gemini evaluates composition structure to generate clean JSON mapping. |

## Functional Requirements

### Backend and Processing Pipeline

The backend synthesis pipeline is an offline process that turns uploaded audio into a playable level map.

Required capabilities:

- Secure upload endpoints targeting a dedicated `music-assets` Supabase Storage bucket.
- Storage triggers that invoke a dedicated processing Edge Function.
- Native peak detection through a compiled WebAssembly library such as Essentia.js.
- Millisecond-accurate extraction of transient note changes and rhythm beats.
- LLM contextual interpretation that assigns thematic changes and lanes.
- Database synchronization that saves the resulting JSON timeline into a `tracks` table linked to the audio storage UUID.

### Frontend Presentation Layer

The frontend should provide synchronized playback and calming, reactive visuals across mobile and web.

Required capabilities:

- Audio playback synchronized with the game tick clock using precise millisecond markers rather than frame counts.
- A custom `ShaderPainter` that passes real-time input variables to a GLSL shader canvas.
- Idle visual state with subtle breathing color waves mapped to track BPM.
- Active interaction state that generates smooth ripple equations from user touch coordinates.

## Preliminary Data Schema

### `tracks` Table

```sql
create table public.tracks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  audio_url text not null,
  bpm integer default 60,
  level_map jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

### `level_map` Timeline Schema

```json
{
  "theme": "aurora_fractal",
  "events": [
    {
      "time_ms": 1200,
      "action": "spawn_node",
      "lane": 2,
      "intensity": 0.7
    },
    {
      "time_ms": 2400,
      "action": "spawn_node",
      "lane": 1,
      "intensity": 0.5
    },
    {
      "time_ms": 4800,
      "action": "shift_visual_state",
      "target_color": "#2A8B9E"
    }
  ]
}
```

## MVP Scope

### Included

- Manual upload interface for admins to process new audio tracks.
- Working backend pipeline that processes audio into a valid `level_map` JSON object.
- Minimalist operational frontend displaying descending hit nodes over an active fluid canvas.
- Web browser rendering verification through Flutter Wasm.

### Excluded

- Complex user profiles.
- User level-creation tools.
- Leaderboards, because they conflict with the calm flow goal.
- Native multi-track audio mixing engine layers inside the client app.
- Haptic feedback optimizations, which are reserved for post-MVP mobile refinement.

## Open Product Direction

The first target prototype needs a clear visual theme. Candidate directions include:

- Fluid geometric fractals.
- Soft bleeding watercolor auroras.
- Rain-on-water ripples.

## GitHub Pages Publishing

This repository includes a static GitHub Pages site in `index.html`.

Publishing is handled by `.github/workflows/pages.yml`. On every push to `main`, GitHub Actions uploads the repository root as a Pages artifact and deploys it with GitHub Pages.

To finish setup in GitHub:

1. Open the repository settings.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push `main` to GitHub.
