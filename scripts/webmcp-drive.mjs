// Interactive WebMCP driver: keeps a Chromium with the WebMCP feature alive between invocations so
// the tools can be called one at a time, the way a browser agent would.
//
//   node scripts/webmcp-drive.mjs start [url] [--headless] [--fresh] [--clean]
//   node scripts/webmcp-drive.mjs list
//   node scripts/webmcp-drive.mjs schema <tool>
//   node scripts/webmcp-drive.mjs call <tool> ['{"json":"args"}']
//   node scripts/webmcp-drive.mjs demo [--beat=2200]
//   node scripts/webmcp-drive.mjs click [css selector]
//   node scripts/webmcp-drive.mjs shot [path.png]
//   node scripts/webmcp-drive.mjs eval '<javascript>'
//   node scripts/webmcp-drive.mjs logs
//   node scripts/webmcp-drive.mjs stop
//
// `demo` plays a scripted session end to end; `call clear_song` blocks until the human answers the
// in-app dialog, so approve that one with `click` from a second shell.
//
// The browser is spawned detached with a remote debugging port, so it outlives this process and the
// song survives between commands; `stop` kills it. Override the port with DRIVE_PORT and the binary
// with CHROMIUM.
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.DRIVE_PORT ?? 9333);
const STATE = join(tmpdir(), `duet-studio-drive-${PORT}.json`);
const PROFILE = join(tmpdir(), `duet-studio-drive-profile-${PORT}`);
const OUTPUT_BUDGET = 1500; // Chrome's guidance for a single tool output
const [command, ...rest] = process.argv.slice(2);

const die = (message) => {
  console.error(message);
  process.exit(1);
};

const readState = async () => {
  try {
    return JSON.parse(await readFile(STATE, "utf8"));
  } catch {
    return null;
  }
};

const attach = async () => {
  const state = await readState();
  if (!state) die("no session; run `bun run drive start` first");
  const browser = await puppeteer
    .connect({
      browserURL: `http://127.0.0.1:${state.port}`,
      defaultViewport: null,
    })
    .catch(() => die("session is gone; run `bun run drive start` again"));
  const pages = await browser.pages();
  const page = pages.findLast((p) => p.url().startsWith("http")) ?? pages[0];
  if (!page) die("no page open in the session");
  return { browser, page, state };
};

// Tools register from React effects after the client-only studio mounts; poll for them.
const waitForTools = (page, timeout = 20000) =>
  page
    .waitForFunction(
      async () => {
        const mc = document.modelContext;
        return Boolean(mc) && (await mc.getTools()).length > 0;
      },
      { timeout, polling: 250 },
    )
    .catch(() => undefined);

const toolNames = (page) =>
  page.evaluate(async () =>
    (await document.modelContext.getTools()).map((t) => t.name),
  );

const start = async () => {
  const args = rest.filter((a) => !a.startsWith("--"));
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const url = args[0] ?? process.env.SMOKE_URL ?? "http://localhost:3000/";
  await rm(STATE, { force: true });
  if (flags.has("--clean")) await rm(PROFILE, { recursive: true, force: true });
  await mkdir(PROFILE, { recursive: true });

  const binary = process.env.CHROMIUM ?? "/usr/bin/chromium";
  const child = spawn(
    binary,
    [
      "--enable-features=WebMCP",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1440,1000",
      ...(flags.has("--headless") ? ["--headless=new"] : []),
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  const deadline = Date.now() + 20000;
  let endpoint;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        endpoint = await res.json();
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!endpoint) die(`${binary} never opened the debugging port ${PORT}`);

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });
  const page = (await browser.pages())[0] ?? (await browser.newPage());

  // Page-side hooks survive the disconnect, so later invocations can read what happened in between.
  await page.evaluateOnNewDocument(() => {
    window.__driveLog = [];
    for (const level of ["error", "warn"]) {
      const original = console[level].bind(console);
      console[level] = (...parts) => {
        window.__driveLog.push(
          `[${level}] ${parts.map((p) => (p instanceof Error ? p.message : String(p))).join(" ")}`,
        );
        original(...parts);
      };
    }
    window.addEventListener("error", (e) =>
      window.__driveLog.push(`[pageerror] ${e.message}`),
    );
    window.addEventListener("unhandledrejection", (e) =>
      window.__driveLog.push(`[rejection] ${e.reason}`),
    );
    // Reading the clipboard needs a permission prompt; record writes instead so `eval` can see them.
    window.__clipboard = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__clipboard.push(value);
        },
      },
    });
  });

  await page.goto(url, { waitUntil: "load" });
  if (flags.has("--fresh")) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
  }
  await waitForTools(page);
  const names = await toolNames(page).catch(() => []);
  await writeFile(
    STATE,
    JSON.stringify({
      port: PORT,
      url,
      pid: child.pid,
      browser: endpoint.Browser,
    }),
  );
  browser.disconnect();
  console.log(`${endpoint.Browser} on ${url} (pid ${child.pid})`);
  console.log(
    names.length
      ? `${names.length} tools: ${names.join(", ")}`
      : "no tools registered — is this build WebMCP-capable and the studio mounted?",
  );
};

const list = async () => {
  const { browser, page } = await attach();
  const tools = await page.evaluate(async () =>
    (await document.modelContext.getTools()).map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      annotations: t.annotations ?? {},
      // Chromium hands the schema over as a JSON string, the same way executeTool takes its args.
      schema:
        typeof t.inputSchema === "string"
          ? JSON.parse(t.inputSchema)
          : (t.inputSchema ?? {}),
    })),
  );
  for (const t of tools) {
    const required = t.schema.required ?? [];
    const properties = Object.keys(t.schema.properties ?? {});
    const hints = Object.entries(t.annotations)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/Hint$/, ""));
    console.log(`\n${t.name}  —  ${t.title ?? "(no title)"}`);
    console.log(`  ${t.description.replace(/\s+/g, " ").slice(0, 160)}`);
    console.log(
      `  args: ${properties.map((p) => (required.includes(p) ? `${p}*` : p)).join(", ") || "none"}${hints.length ? `   [${hints.join(", ")}]` : ""}`,
    );
  }
  console.log(`\n${tools.length} tools`);
  browser.disconnect();
};

const schema = async () => {
  const name = rest[0] ?? die("usage: drive schema <tool>");
  const { browser, page } = await attach();
  const tool = await page.evaluate(async (name) => {
    const found = (await document.modelContext.getTools()).find(
      (t) => t.name === name,
    );
    return found
      ? {
          name: found.name,
          title: found.title,
          description: found.description,
          annotations: found.annotations ?? {},
          inputSchema:
            typeof found.inputSchema === "string"
              ? JSON.parse(found.inputSchema)
              : found.inputSchema,
        }
      : null;
  }, name);
  browser.disconnect();
  if (!tool) die(`tool ${name} is not registered`);
  console.log(JSON.stringify(tool, null, 2));
};

// One tool call, the way a host makes it: look the tool up, hand it a JSON string, unwrap the
// MCP text block. Returns the payload (parsed JSON when the tool answered with JSON) plus metrics.
const execute = async (page, name, args = {}) => {
  const started = Date.now();
  const raw = await page.evaluate(
    async (name, args) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((t) => t.name === name);
      if (!tool)
        throw new Error(
          `tool ${name} is not registered; have: ${tools.map((t) => t.name).join(", ")}`,
        );
      // This Chromium build takes the arguments as a JSON string, not an object.
      return document.modelContext.executeTool(tool, JSON.stringify(args));
    },
    name,
    args,
  );
  const chars =
    typeof raw === "string" ? raw.length : JSON.stringify(raw).length;
  let result;
  try {
    result = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    result = raw;
  }
  let payload = result?.content?.[0]?.text ?? result;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {}
  }
  return {
    payload,
    isError: Boolean(result?.isError),
    chars,
    ms: Date.now() - started,
  };
};

const print = (payload) =>
  console.log(
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
  );

const drainLog = (page) =>
  page.evaluate(() => {
    const entries = window.__driveLog ?? [];
    window.__driveLog = [];
    return entries;
  });

const call = async () => {
  const name = rest[0] ?? die("usage: drive call <tool> ['<json args>']");
  let args = {};
  if (rest[1] !== undefined) {
    try {
      args = JSON.parse(rest[1]);
    } catch (error) {
      die(`arguments must be JSON: ${error.message}`);
    }
  }
  const { browser, page } = await attach();
  const before = await toolNames(page);
  const { payload, isError, chars, ms } = await execute(page, name, args).catch(
    (error) => die(error.message),
  );
  print(payload);
  console.log(
    `\n${isError ? "isError " : ""}${chars} chars${chars > OUTPUT_BUDGET ? ` (over the ${OUTPUT_BUDGET} budget)` : ""}  ${ms}ms`,
  );
  const after = await toolNames(page);
  const added = after.filter((n) => !before.includes(n));
  const removed = before.filter((n) => !after.includes(n));
  if (added.length) console.log(`tools appeared: ${added.join(", ")}`);
  if (removed.length) console.log(`tools disappeared: ${removed.join(", ")}`);
  const logged = await drainLog(page);
  if (logged.length) console.log(`console:\n  ${logged.join("\n  ")}`);
  browser.disconnect();
};

// A choreographed run for the camera: the loop starts early and every later call is heard and seen
// live, which is the whole point of editing a song through WebMCP. Pace it with --beat=<ms>.
const demo = async () => {
  const beat = Number(
    rest.find((a) => a.startsWith("--beat="))?.slice("--beat=".length) ?? 2200,
  );
  const { browser, page } = await attach();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const failures = [];
  let index = 0;

  const act = async (line, name, args = {}) => {
    index += 1;
    console.log(`\n${String(index).padStart(2)}. ${line}`);
    console.log(`    ${name}(${JSON.stringify(args)})`.slice(0, 200));
    const { payload, isError, chars, ms } = await execute(page, name, args);
    const headline =
      typeof payload === "string"
        ? payload.split("\n")[0]
        : (payload?.message ?? JSON.stringify(payload));
    console.log(
      `    ${isError ? "ERROR " : "-> "}${String(headline).slice(0, 160)}   (${chars} chars, ${ms}ms)`,
    );
    if (isError) failures.push(`${name}: ${headline}`);
    await wait(beat);
    return payload;
  };

  // A track can be referenced by its instrument id, but only once such a track exists.
  const song = String((await execute(page, "get_song")).payload);
  const ensure = async (instrument, args) => {
    if (song.includes(`[${instrument}, id=`)) return instrument;
    await act(`The song has no ${instrument}; add one.`, "add_track", {
      instrument,
      ...args,
    });
    return instrument;
  };

  // Web Audio needs a genuine gesture before the transport can make a sound.
  const { width, height } = page.viewport() ?? { width: 1440, height: 1000 };
  await page.mouse.click(Math.round(width / 2), Math.round(height / 2));

  await act("Read the song before touching anything.", "get_song");
  await act("Name it and set the key.", "set_song_meta", {
    title: "Night Drive",
    key: "A",
    scale: "minor",
    bars: 2,
  });
  await act("Slow it down and add a little swing.", "set_tempo", {
    bpm: 104,
    swing: 0.12,
  });
  await act(
    "Start the loop now — every edit from here is heard live.",
    "set_playback",
    { playing: true },
  );
  await act("Write a kick that leaves room.", "set_drum_pattern", {
    track: await ensure("kick", { name: "Kick" }),
    pattern: "X..x..X...X.x...",
  });
  await act("Spread 11 hats over 16 steps with euclid.", "set_drum_pattern", {
    track: await ensure("hat_closed", { name: "Hats" }),
    euclid: { hits: 11, steps: 16 },
  });
  await act("Backbeat clap.", "add_track", {
    instrument: "clap",
    name: "Clap",
    pattern: "....X.......X...",
  });
  await act("Shaker on the offbeats.", "add_track", {
    instrument: "shaker",
    name: "Shaker",
    pattern: "x.x.x.x.x.x.x.x.",
  });
  await act("Loosen the shaker so it breathes.", "humanize", {
    track: "shaker",
    amount: 0.45,
  });
  await act("A bassline that walks the minor scale.", "set_notes", {
    track: await ensure("bass", { name: "Bass" }),
    notes: [
      { step: 0, note: "A1", length: 2, velocity: 0.9 },
      { step: 3, note: "A1" },
      { step: 6, note: "C2", length: 2 },
      { step: 8, note: "A1", length: 2 },
      { step: 11, note: "G1" },
      { step: 14, note: "E2", length: 2 },
      { step: 16, note: "F1", length: 2, velocity: 0.9 },
      { step: 19, note: "F1" },
      { step: 22, note: "A1", length: 2 },
      { step: 24, note: "C2", length: 2 },
      { step: 27, note: "G1" },
      { step: 30, note: "D2", length: 2 },
    ],
  });
  await act("Give the chords somewhere to live.", "add_track", {
    instrument: "pad",
    name: "Chords",
  });
  await act("i VI III VII, voice-led across the bars.", "set_chords", {
    track: "Chords",
    progression: "i VI III VII",
  });
  await act("A hook on top.", "add_track", {
    instrument: "pluck",
    name: "Hook",
    notes: [
      { step: 8, note: "E5", length: 2 },
      { step: 12, note: "C5", length: 2 },
      { step: 16, note: "D5", length: 4 },
      { step: 24, note: "A4", length: 2 },
      { step: 28, note: "C5", length: 4 },
    ],
  });
  await act("Tuck the pad under everything else.", "update_track", {
    track: "Chords",
    volume: 0.55,
  });
  await act("Humanize the whole kit.", "humanize", { amount: 0.3 });
  await act("Read back what the two of us built.", "get_song");

  const logged = await drainLog(page);
  if (logged.length) console.log(`\nconsole:\n  ${logged.join("\n  ")}`);
  console.log(
    failures.length
      ? `\n${failures.length} step(s) failed:\n  ${failures.join("\n  ")}`
      : `\n${index} steps, no errors. The loop is still playing — \`drive call set_playback '{"playing":false}'\` to stop.`,
  );
  browser.disconnect();
};

// A real CDP mouse click, so it counts as the user gesture Web Audio and the confirm dialog need.
const click = async () => {
  const { browser, page } = await attach();
  const selector = rest[0];
  if (selector) {
    const target = await page.$(selector);
    if (!target) {
      browser.disconnect();
      die(`no element matches ${selector}`);
    }
    await target.click();
  } else {
    const { width, height } = page.viewport() ?? { width: 1440, height: 1000 };
    await page.mouse.click(Math.round(width / 2), Math.round(height / 2));
  }
  browser.disconnect();
  console.log(selector ? `clicked ${selector}` : "clicked the page");
};

const shot = async () => {
  const path = rest[0] ?? "/tmp/duet-drive.png";
  const { browser, page } = await attach();
  await page.screenshot({ path });
  browser.disconnect();
  console.log(path);
};

const evaluate = async () => {
  const source = rest[0] ?? die("usage: drive eval '<javascript>'");
  const { browser, page } = await attach();
  const value = await page
    .evaluate(`(async () => (${source}))()`)
    .catch((error) => die(error.message));
  browser.disconnect();
  console.log(
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
};

const logs = async () => {
  const { browser, page } = await attach();
  const entries = await drainLog(page);
  browser.disconnect();
  console.log(entries.length ? entries.join("\n") : "(clean)");
};

const stop = async () => {
  const state = await readState();
  if (!state) return console.log("no session");
  try {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${state.port}`,
      defaultViewport: null,
    });
    await browser.close();
  } catch {
    try {
      process.kill(state.pid);
    } catch {}
  }
  await rm(STATE, { force: true });
  console.log("stopped");
};

const commands = {
  start,
  list,
  schema,
  call,
  demo,
  click,
  shot,
  eval: evaluate,
  logs,
  stop,
};
const run = commands[command];
if (!run)
  die(
    `usage: drive <${Object.keys(commands).join("|")}>  (see the header of ${import.meta.filename})`,
  );
await run();
