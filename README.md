# Layla Mini-App Template

A starter template for building Layla mini-apps with React, TypeScript, Vite, and the `@layla-network/sdk`.

Layla mini-apps are client-side web apps that run inside the Layla app's WebView. In production, SDK calls go through the bridge injected by Layla and reach the on-device model. During local development, this template installs a mock Layla host so the app can run in a normal browser.

## What's Included

- React 19 + TypeScript + Vite
- `@layla-network/sdk` for chat completions, character cards, and character images
- A development mock host installed in `src/main.tsx`
- `vite-plugin-singlefile` so production builds emit a self-contained HTML bundle
- Mini-app metadata in `src/assets/app.json`

## Requirements

- Node.js 20 or newer
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Build the mini-app:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run linting:

```bash
npm run lint
```

## Project Structure

```text
.
+-- public/
|   +-- favicon.svg
|   +-- icons.svg
+-- src/
|   +-- assets/
|   |   +-- app.json
|   |   +-- bg.jpg
|   |   +-- hero.png
|   |   +-- icon.jpg
|   +-- App.css
|   +-- App.tsx
|   +-- index.css
|   +-- main.tsx
+-- index.html
+-- package.json
+-- vite.config.ts
```

## Mini-App Metadata

Edit `src/assets/app.json` to customize how the mini-app appears in Layla:

```json
{
  "title": "Layla Mini-App Template",
  "tagline": "A template to create your own mini-app powered by Layla.",
  "description": "This is a mini-app template built with React and Vite, designed to help you quickly create your own mini-app powered by the Layla SDK. It installs the Layla SDK and setups a mock in development mode, allowing you to start building and testing your mini-app right away.",
  "iconUri": "icon.jpg",
  "backgroundImgUri": "bg.jpg"
}
```

The image paths are relative to `src/assets/`.

## Using the Layla SDK

Create one SDK client and reuse it:

```ts
import { LaylaSDK, LaylaError } from '@layla-network/sdk'

const layla = new LaylaSDK()
```

Stream chat responses by default so users can see the on-device model respond token by token:

```ts
const stream = layla.chat.completions.stream({
  messages: [{ role: 'user', content: 'Write a short greeting.' }],
})

stream.on('content', (_delta, snapshot) => {
  console.log(snapshot)
})

try {
  const finalText = await stream.finalContent()
  console.log(finalText)
} catch (error) {
  if (error instanceof LaylaError) {
    console.error(error.message)
  } else {
    throw error
  }
}
```

Wire a stop button to `stream.abort()` for any interactive generation UI.

## Local Development Mock

The SDK bridge only exists inside the Layla WebView. In a normal browser, SDK calls need a mock host.

This template installs the mock in `src/main.tsx` during Vite development:

```ts
import { installLaylaMock } from '@layla-network/sdk'

if (import.meta.env.DEV) {
  installLaylaMock({
    respond: (messages) =>
      `You said: ${messages.at(-1)?.content}. Mock response from Layla.`,
    latencyMs: 1000,
    tokenDelayMs: 300,
  })
}
```

Keep this guarded by `import.meta.env.DEV` so the mock is not used in the production bundle.

## Building for Layla

Production output is generated with:

```bash
npm run build
```

The Vite config includes `vite-plugin-singlefile`, which helps produce WebView-friendly static output in `dist/`. The exact packaging or loading path depends on how the Layla host app consumes mini-app builds.

## Customizing the Template

Start with these files:

- `src/App.tsx` for the app UI and interactions
- `src/App.css` and `src/index.css` for styling
- `src/assets/app.json` for title, tagline, description, and app artwork
- `src/main.tsx` for app bootstrapping and development-only mock setup

Mini-apps run fully client-side. Do not add API keys, backend calls, or server-only code for model access; use `@layla-network/sdk` and let Layla provide the on-device bridge.
