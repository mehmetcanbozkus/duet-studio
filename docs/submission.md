# Devpost submission draft

## Project name

Duet Studio

## Tagline

A browser music studio where you and your agent produce a track together.

## Description (paste into Devpost)

**Why this use case is a strong fit for WebMCP**

Making music in a browser is a dense, visual, real-time activity: dozens of tiny cells, notes that only make sense in a key, a loop that never stops. It is exactly the kind of interface an agent cannot operate by clicking, and cannot judge by screenshot because it cannot hear. WebMCP fixes both. Duet Studio exposes the song itself as tools: `get_song` returns the arrangement as a compact text grid plus JSON, so the agent "sees" what the human hears; `set_drum_pattern`, `set_notes`, `humanize`, `set_tempo` let it write musically instead of mechanically. The imperative API lets the tool surface change with the UI: shift-drag a range of steps and a new tool, `edit_selection`, is registered; clear the selection and it is unregistered through the AbortSignal lifecycle. The agent always sees a tool set that matches what is on screen.

**How it creates a better user experience**

Nothing is hidden behind a chat window. The human keeps the transport running, taps in a kick, drags a note, mutes a track, and the agent's edits land in the same grid, tinted violet, while the human's stay amber. A session log lists every tool call with a one-click revert, and a shared undo history covers both parties. Destructive actions such as `clear_song` open an approve/decline dialog in the app and the tool result tells the agent what the human decided. The result feels like two people at one instrument rather than a form being filled in.

**What people and agents can do together that was difficult or impossible before**

- Point at four steps and say "make this a snare fill": the agent acts on exactly that range.
- Ask for a bassline in the song's key and watch it appear while the loop plays; then move a note and let the agent adapt the chords to it.
- Let the agent tidy velocities across the whole kit in one call, then undo just that if you disagree.
- Hand off musical knowledge (scales, chord voicings, groove conventions) to the agent while keeping taste and the final say with the human.

None of that is achievable by screen-scraping a sequencer grid, and none of it needs a backend or an account: the whole app is a static page.

**How WebMCP is implemented**

Each tool is a plain object (name, description, JSON schema, execute) in `src/lib/webmcp/tools.ts`. A React component registers each tool with `document.modelContext.registerTool(..., { signal })` (typed with the official `webmcp-types`), aborts the signal to unregister on unmount, and forwards the host's cancellation signal into the tool. Read tools are annotated `readOnlyHint: true`. Every mutation goes through a `commit(actor, label, mutate)` function that records provenance per cell and per note, feeds the undo history and the session log. Errors throw with actionable text ("No track matches 'nope'. Available: …") and reach the agent as `isError` results. The page also ships a fallback agent: with a visitor's own OpenAI key it discovers the tools through `document.modelContext.getTools()` and calls them with `executeTool()`, so the WebMCP surface is testable in any Chrome with the flag, not only in agent browsers. A headless test (`scripts/webmcp-smoke.mjs`) drives the real `document.modelContext.getTools()` / `executeTool()` API in Chromium to verify registration, the dynamic selection tool, playback and the confirmation flow.

Stack: Next.js 16 (static export), React 19, TypeScript, Tailwind 4, shadcn/ui, Tone.js, tonal, zustand + zundo, lz-string.

## Links

- Live URL: TODO
- Repo: https://github.com/mehmetcanbozkus/duet-studio
- Video: TODO

## Video script (under 3 minutes)

0:00 – 0:15 Title card over the app. "This is Duet Studio. A sequencer where my agent and I make a beat together, through WebMCP."
0:15 – 0:35 Press Play. Tap a kick pattern by hand (amber cells). Show the agent status badge: "15 agent tools live".
0:35 – 1:05 In the ChatGPT browser: "Look at my song and add a hi-hat groove that fits the kick, then a two-bar bassline in A minor." Show the agent calling get_song, then set_drum_pattern / add_track / set_notes. Violet cells appear while the loop keeps playing. Point out the session log.
1:05 – 1:30 Drag a bass note somewhere odd. Ask: "I moved a note, adapt the pad chords to it." Agent reads the change, writes chords.
1:30 – 1:55 Shift-drag steps 12–15 on the snare. Show the tool count go to 16 and edit_selection appear. "Make the steps I selected a snare fill." Agent fills exactly that range.
1:55 – 2:15 "Humanize the hats and bring the tempo to 96 with some swing." Show velocity tints change and BPM update.
2:15 – 2:35 Ask the agent to clear the song. The approve/decline dialog appears; click Decline. Show the agent receiving "the human declined".
2:35 – 2:55 Copy the share link, show the repo and the tool list. "Every edit is attributed, everything is undoable, no backend, open source."
