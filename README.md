# Duet Studio

**A browser music studio where you and your AI agent produce a track together.**
Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/) (September 2026).

> Live demo: _coming soon_ · Demo video: _coming soon_

![Duet Studio: a kick, hats, bass and snare track; violet cells were written by the agent, the teal range is the human's selection, and the session log on the right lists every tool call](docs/screenshot.png)

Duet Studio is a step sequencer and piano roll that runs entirely in the browser. Every part of the song — tempo, swing, tracks, drum hits, notes, mixer, transport — is exposed as a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool on `document.modelContext`. Open it in ChatGPT's built-in browser (or Chrome with the WebMCP flag) and the agent can hear what you hear, write alongside you, and act on exactly the steps you point at.

## Why WebMCP fits

An agent cannot listen to audio, and it cannot reliably click a 32 × 12 grid of tiny cells. Both problems disappear with tools:

- **`get_song` gives the agent ears.** It returns the song as a compact text grid (`|X...x...X...x...|`) plus structured JSON, so the model "sees" what the human is hearing and can reason about groove, density and harmony.
- **Write tools are musical, not mechanical.** `set_drum_pattern` takes a pattern string, `set_notes` takes note names and lengths, `humanize` adds velocity variation. One call replaces dozens of fragile clicks.
- **The human's pointer becomes context.** Shift-drag across steps and a new tool, `edit_selection`, appears (and disappears when the selection clears, via the `toolchange` lifecycle). "Make *these* steps a snare fill" is now something an agent can do exactly.
- **Destructive actions stay human-gated.** `clear_song` opens an approve/decline dialog in the app and only proceeds if the human approves. The agent learns the outcome either way.
- **Every change is attributed.** Cells and notes are tinted by who wrote them (amber = you, violet = agent), and a session log shows each tool call with a one-click revert. Undo/redo covers both of you.

## What people and agents can do together

- You tap in a kick, the agent adds a hat groove that fits it, live, without stopping playback.
- The agent writes a bassline in the song's key with `get_scale_notes`; you drag a note somewhere unexpected; the agent reads the change and adapts the chords.
- You select the last four steps of a bar and say "fill", and the agent fills exactly that range.
- The agent proposes clearing a section; you decline; nothing changes.

## The tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `get_song` | read | Full song as text grid + JSON, transport state, human selection |
| `list_instruments` | read | Instrument ids, character, recommended pitch ranges |
| `get_scale_notes` | read | Notes of a scale within a range (music theory helper) |
| `set_tempo` | write | BPM and swing |
| `set_playback` | write | Start/stop the loop (after the human has clicked once, per browser autoplay rules) |
| `set_song_meta` | write | Title, key, scale, bars (1/2/4) |
| `add_track` / `remove_track` / `update_track` | write | Tracks and mixer (volume, mute, solo, rename) |
| `set_drum_pattern` | write | Replace a drum pattern (`X` accent, `x` hit, `o` soft, `.` rest), whole song or one bar |
| `set_notes` | write | Write melodic notes (replace or merge), chords by stacking notes |
| `humanize` | write | Velocity variation on one or all tracks |
| `undo` / `redo` | write | Shared history |
| `clear_song` | write, gated | Requires human approval in the UI |
| `edit_selection` | write, dynamic | Only registered while the human has a selection: clear, transpose, scale velocity, set pattern/notes on exactly that range |

Read tools carry `readOnlyHint: true`. Bad input throws an actionable error (for example "No track matches 'nope'. Available: Kick (id …), …") which reaches the agent as an `isError` result.

## How it is built

- **Next.js 16** (static export) · **React 19** · **TypeScript** · **Tailwind 4** · **shadcn/ui**
- **Tone.js** drives the sequencer. It re-reads the song on every 16th note, so edits from either party are heard on the next step.
- **tonal** for music theory, **zustand + zundo** for state and undo history, **lz-string** for share links.
- **[`use-webmcp-tool`](https://github.com/GoogleChromeLabs/use-webmcp-tool)** (Chrome Labs) registers each tool with `document.modelContext.registerTool` and unregisters via `AbortSignal` when the component unmounts or `enabled` flips.

Key files:

```
src/lib/webmcp/tools.ts              # every WebMCP tool: name, description, JSON schema, execute
src/components/studio/agent-tools.tsx # mounts one useWebMCP hook per tool
src/lib/studio/store.ts               # zustand store; commit(actor, label, mutate) records provenance
src/lib/studio/engine.ts              # Tone.js engine
src/lib/studio/format.ts              # the text grid the agent reads
scripts/webmcp-smoke.mjs              # headless test that drives the real document.modelContext API
```

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # static export in out/
```

### Test with an agent

- **ChatGPT desktop app**: open the URL in the built-in browser and pick **Site tools** in the address bar. Use GPT-5.6 Sol or Terra.
- **Chrome 149+**: enable `chrome://flags/#enable-webmcp-testing`, then use Gemini in Chrome or the [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) extension to call tools by hand.
- **Headless smoke test** (Chromium at `/usr/bin/chromium`): `bun run smoke` registers the tools, calls them through `document.modelContext.executeTool`, exercises the selection-scoped tool and the confirmation dialog, and takes a screenshot.

Without WebMCP the studio is still a complete, fully usable sequencer.

### Deploy

The app is a static export with no server or environment variables. Any static host works:

| Host | Build command | Output directory |
| --- | --- | --- |
| Vercel | auto-detected (`next build`) | auto-detected (`out`) |
| Cloudflare Pages | `bun run build` | `out` |
| Netlify | `bun run build` | `out` |
| Render (static site) | `bun run build` | `out` |

## License

MIT
