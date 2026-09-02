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
- `bun run build` creates the static export in `out/`.
- `bun run check` runs lint, typecheck, and formatting checks.
- `bun run smoke` runs the headless WebMCP smoke test (needs Chromium at /usr/bin/chromium and a server at http://localhost:3000).
- `bun run smoke:hosts` checks the page against a minimal `document.modelContext` (registerTool only, injected at load and late) so hosts like ChatGPT's browser cannot crash it.

## Stack

- Next.js 16 App Router (static export), React 19, strict TypeScript, React Compiler.
- Tailwind CSS 4, shadcn/ui (Base UI primitives), Lucide icons.
- Tone.js for audio, tonal for music theory, zustand + zundo for state and undo history, lz-string for share links.
- `use-webmcp-tool` (Chrome Labs) registers tools with `document.modelContext`.

## Architecture

- `src/lib/studio/types.ts` — song model (drum tracks with per-step velocity and provenance, melodic tracks with notes).
- `src/lib/studio/store.ts` — zustand store; every change goes through `commit(actor, label, mutate)` which records who did it.
- `src/lib/studio/engine.ts` — Tone.js sequencer that re-reads the song on every 16th note, so edits are heard live.
- `src/lib/webmcp/tools.ts` — the WebMCP tool specs (name, description, JSON schema, execute). `when` makes a tool conditional (e.g. `edit_selection` only exists while the human has a selection).
- `src/components/studio/agent-tools.tsx` — mounts one `useWebMCP` hook per tool spec.
- `src/lib/webmcp/types.ts` — `ModelContext` typing where everything beyond `registerTool` is optional; feature-check before calling `getTools`, `executeTool` or `addEventListener` (ChatGPT's browser has none of them). WebMCP-facing widgets render inside `Safe` (react-error-boundary).
- `src/components/studio/*` — UI. The studio is loaded with `next/dynamic` and `ssr: false` because it touches Web Audio, localStorage and `document.modelContext`.

## Code Style

- Prefer existing project patterns and existing libraries over new abstractions.
- Use `@/*` imports for files under `src`.
- Everything under `src/components/studio` is client-only. Keep zustand selectors stable (use `useShallow` when returning arrays/objects).
- Tool `execute` functions return plain objects and throw `Error` with an actionable message on bad input; the hook turns those into MCP `isError` results.
