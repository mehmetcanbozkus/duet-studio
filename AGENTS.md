<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## What this is

Duet Studio is a WebMCP-powered browser music studio built for the OpenAI WebMCP Challenge (Sept 2026). A step sequencer and piano roll expose the whole song as WebMCP tools on `document.modelContext`, so a browser agent (ChatGPT's built-in browser, Chrome with the WebMCP flag) can read and edit the song alongside the human.

## Documentation

- Use Context7 MCP for current library, framework, SDK, API, CLI, and cloud service documentation before answering or coding against those tools.
- WebMCP spec: https://webmachinelearning.github.io/webmcp/ ; Chrome docs: https://developer.chrome.com/docs/ai/webmcp ; ChatGPT site tools: https://learn.chatgpt.com/docs/webmcp

## Commands

- Package manager: Bun.
- `bun run dev` starts the development server.
- `bun run build` creates the production build (no `output: "export"`; deployed on Vercel by the maintainer).
- `bun run check` runs lint, typecheck, and formatting checks.
- `bun run smoke` runs the headless WebMCP smoke test against a running server; it asserts registration, titles/annotations, validation errors, the dynamic selection tool, playback, the confirmation flow, a share link that reopens the song in a fresh browser context, output sizes (≤1.5K chars) and a clean console, and exits 1 on any failure.
- `bun run smoke:hosts` checks the page against a minimal `document.modelContext` (registerTool only, injected at load and late) so hosts like ChatGPT's browser cannot crash it. `bun run smoke:all` runs both.
- Both default to http://localhost:3000/ and Chromium at /usr/bin/chromium; override with `SMOKE_URL=http://localhost:3123/` and `CHROMIUM=/path/to/chrome`. The app runs without any environment variables; the two it looks at (`VERCEL` at build time, `BLOB_READ_WRITE_TOKEN` at request time) are optional and documented in `.env.example` and Stack.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript, React Compiler. The studio itself is client-only; the sole server code is the share-link API.
- Vercel Blob (`@vercel/blob`) backs short share links. `POST /api/share` stores the song and returns a 10-char id, `GET /api/share/[id]` serves it back, and the link is `/?s=<id>`. `BLOB_READ_WRITE_TOKEN` is optional and only ever read on the server: with no store connected `POST` answers `{ id: null }` and the browser falls back to the self-contained `#song=` link (thousands of characters, but no server needed). Since anyone can call `POST`, it size-caps the body and re-parses it with `parseSong`, so only songs we serialized reach the store.
- `@vercel/analytics` (Web Analytics). `src/app/layout.tsx` renders `<Analytics />` only when `process.env.VERCEL === "1"` at build time; off Vercel the insights script would 404 and fail the smoke test's clean-console assertion. Custom `track()` events are not used.
- Tailwind CSS 4, shadcn/ui (Base UI primitives), Lucide icons.
- Tone.js for audio, tonal for music theory, zustand + zundo for state and undo history, lz-string for the inline share-link fallback.
- `webmcp-types` (official spec typings, devDependency) provides the global `WebMCP` namespace and `document.modelContext`; registration is our own code in `src/lib/webmcp/register.ts`.

## Architecture

- `src/lib/studio/types.ts` — song model (drum tracks with per-step velocity and provenance, melodic tracks with notes).
- `src/lib/studio/share.ts` — share-link encoding and the id/blob-path format, imported by both the client and the API routes.
- `src/lib/studio/store.ts` — zustand store; every change goes through `commit(actor, label, mutate)` which records who did it.
- `src/lib/studio/engine.ts` — Tone.js sequencer that re-reads the song on every 16th note, so edits are heard live.
- `src/lib/webmcp/tools.ts` — the WebMCP tool specs (name, description, JSON schema, execute). `when` makes a tool conditional (e.g. `edit_selection` only exists while the human has a selection).
- `src/components/studio/agent-tools.tsx` — one effect per tool spec: `registerSpec()` with an `AbortController` (abort = unregister), registration errors surface as a toast. `src/lib/webmcp/use-model-context.ts` is the shared late-detection hook for `document.modelContext`.
- `src/lib/webmcp/types.ts` — re-exports the official `WebMCP.*` types and derives a `ModelContext` where everything beyond `registerTool` is optional; feature-check before calling `getTools`, `executeTool` or `addEventListener` (ChatGPT's browser has none of them). WebMCP-facing widgets render inside `Safe` (react-error-boundary).
- `src/components/studio/*` — UI. The studio is loaded with `next/dynamic` and `ssr: false` because it touches Web Audio, localStorage and `document.modelContext`.

## Code Style

- Prefer existing project patterns and existing libraries over new abstractions.
- Use `@/*` imports for files under `src`.
- Everything under `src/components/studio` is client-only. Keep zustand selectors stable (use `useShallow` when returning arrays/objects).
- Tool `execute` functions return plain objects and throw `Error` with an actionable message on bad input; the hook turns those into MCP `isError` results.
