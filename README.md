# LLM-based Long-term Memory

A Layla mini-app that processes character chat history with an LLM and writes
the results back into Layla long-term memory.

The app reads a character's conversations, breaks new messages into overlapping
windows, condenses each window into durable memories, and extracts a compact
knowledge graph from those memories. Each saved memory keeps the original text,
the generated summary, and the graph JSON so the character can recall earlier
context and preserve relationships across long-running chats.

## Features

- Browse Layla characters with portraits, tags, and descriptions
- Load characters in pages and fetch portraits through the Layla SDK
- Keep per-character ingest settings in Layla's file storage
- Customize the system prompt and instruction used for summarization
- Customize the system prompt and instruction used for graph extraction
- Skip already-processed history by using the latest saved memory timestamp
- Read chat sessions and history through paginated SDK calls
- Summarize overlapping transcript windows into long-term memory drafts
- Extract graph triples for people, places, events, traits, and objects
- Visualize ingest progress with reading, summarizing, and graphing phases
- Save generated memories with `rawText`, `summary`, and `knowledgeGraphJSON`
- Cancel an in-progress ingest run with abort-aware SDK calls
- Run locally with a built-in demo Layla host and sample characters

## How It Works

1. **Choose a character.** The app lists characters from Layla and hydrates each
   card with its portrait when available.
2. **Tune the ingest prompts.** Review or edit the summarization and graph
   prompts for that specific character. Changes are saved to `config.json`
   through Layla file storage.
3. **Read new history.** The app checks the latest memory timestamp for the
   character, then scans chat sessions for newer messages only.
4. **Build transcript windows.** New chat messages are sorted by time and
   grouped into small overlapping windows so nearby context stays together.
5. **Summarize.** Each window is sent to Layla chat completions with the
   configured summary prompt.
6. **Graph.** Each summary is sent back to the model for JSON graph extraction.
   The app defensively parses graph triples and visualizes the resulting nodes
   and relationships.
7. **Commit memories.** Generated memory drafts are saved with
   `layla.memories.createOrUpdate`.

## Running Locally

### Requirements

- Node.js 20 or newer
- npm

Install dependencies:

```bash
npm install
```

Start Vite:

```bash
npm run dev
```

During local development, `src/main.tsx` installs a demo Layla host from
`src/demo/data.ts`. The mock host provides sample characters, portraits, chat
history, memory storage, and canned LLM responses, so the app can be exercised
in a normal browser without the Layla WebView.

Preview a production build locally:

```bash
npm run build
npm run preview
```

## Running in Layla

In production, the app creates a `LaylaSDK` client and talks to the bridge
provided by the Layla WebView. Character listing, character images, chat
history, memory reads and writes, file storage, and model completions all go
through `@layla-network/sdk`.

No model endpoint or API key is embedded in the production bundle.

Create the production bundle with:

```bash
npm run build
```

The build is written to `dist/`. `vite-plugin-singlefile` bundles the app into a
WebView-friendly static output, while Vite copies the mini-app metadata and
artwork from `public/`.

Layla listing metadata lives in `public/app.json`:

```json
{
  "title": "LLM-based Long-term Memory",
  "tagline": "Uses LLM to process long-term memory instead of the built-in Layla models",
  "description": "...",
  "iconUri": "icon.jpg",
  "backgroundImgUri": "bg.jpg"
}
```

## Memory Format

Each generated memory is saved as a Layla memory draft with:

- `character_id`: the selected character
- `rawText`: the transcript window used as source material
- `timestamp`: the newest message timestamp in that window
- `summary`: the generated long-term memory text
- `knowledgeGraphJSON`: the parsed graph response serialized as JSON

The graph parser accepts either an array of triples or an object containing
`relations`, `edges`, `entities`, or `nodes`. Relation fields can use common
aliases such as `subject`/`object`, `from`/`to`, `source`/`target`, and
`relationship`/`relation`/`label`.

## Per-Character Settings

Prompt settings are stored in `config.json` through `layla.utils.saveFile`.
The file has versioned per-character entries:

```json
{
  "version": 1,
  "characters": {
    "character-id": {
      "summarySystem": "...",
      "summaryInstruction": "...",
      "graphSystem": "...",
      "graphInstruction": "..."
    }
  }
}
```

If the file is missing or a setting is invalid, the app falls back to the
defaults in `src/features/memoryIngest/config.ts`.

## Project Structure

```text
.
+-- assets/                         # README and store artwork assets
+-- public/
|   +-- app.json                    # Layla mini-app metadata
|   +-- bg.jpg                      # Listing background
|   +-- icon.jpg                    # Listing icon
+-- src/
|   +-- demo/
|   |   +-- data.ts                 # Development Layla mock host
|   |   +-- portraits.ts            # Generated demo portraits
|   +-- features/
|   |   +-- memoryIngest/
|   |       +-- components/         # Shared feature UI
|   |       +-- screens/            # Picker, settings, and ingest screens
|   |       +-- config.ts           # Default prompts and display helpers
|   |       +-- configFile.ts       # Layla config.json persistence
|   |       +-- ingestion.ts        # Transcript, summary, graph, memory logic
|   |       +-- layla.ts            # Layla helper utilities
|   |       +-- types.ts
|   |       +-- useCharacterCatalog.ts
|   |       +-- useIngestAnimation.ts
|   |       +-- useIngestFlow.ts
|   +-- libs/
|   |   +-- defensiveJsonParser.ts
|   +-- App.tsx                     # Top-level screen routing
|   +-- main.tsx                    # App bootstrap and development mock
|   +-- styles.css
+-- package.json
+-- vite.config.ts
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Vite server |
| `npm run build` | Type-check and create the production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

## Tech Stack

- React 19
- TypeScript
- Vite
- `@layla-network/sdk`
- `vite-plugin-singlefile`

## Layla App

Visit the official Layla website: https://www.layla-network.ai/

Download the Layla app:

<p>
  <a href="https://play.google.com/store/apps/details?id=com.layla">
    <img src="./assets/google_badge.png" alt="Get it on Google Play" height="60">
  </a>
  &nbsp;&nbsp;
  <a href="https://apps.apple.com/us/app/layla/id6456886656">
    <img src="./assets/apple_badge.png" alt="Download on the App Store" height="60">
  </a>
</p>
