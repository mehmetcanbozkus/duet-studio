import puppeteer from "puppeteer-core";

const URL = process.argv[2] ?? "http://localhost:3123/";
const shot = process.argv[3] ?? "/tmp/smoke.png";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--enable-features=WebMCP",
    "--no-sandbox",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,1000",
  ],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(URL, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForSelector("button[aria-pressed]", { timeout: 20000 });
// Tools register from React effects after the client-only studio mounts; poll for them.
await page
  .waitForFunction(
    async () => {
      const mc = document.modelContext;
      if (!mc) return false;
      return (await mc.getTools()).length > 0;
    },
    { timeout: 15000, polling: 250 },
  )
  .catch(() => undefined);

const OUTPUT_BUDGET = 1500; // Chrome's guidance for a single tool output
const sizes = [];
const call = async (name, args = {}) => {
  const raw = await page.evaluate(
    async (name, args) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((t) => t.name === name);
      if (!tool)
        throw new Error(
          `tool ${name} not registered; have: ${tools.map((t) => t.name).join(",")}`,
        );
      return document.modelContext.executeTool(tool, JSON.stringify(args));
    },
    name,
    args,
  );
  sizes.push({ name, chars: raw.length });
  return JSON.parse(raw);
};
const text = (r) => {
  try {
    return JSON.parse(r.content[0].text);
  } catch {
    return r.content?.[0]?.text ?? r;
  }
};

const names = await page.evaluate(async () =>
  (await document.modelContext.getTools()).map((t) => t.name),
);
console.log("registered tools:", names.length, names.join(", "));
if (names.length === 0) {
  console.log("PAGE ERRORS:", errors);
  await page.screenshot({ path: shot });
  await browser.close();
  process.exit(1);
}

let grid = text(await call("get_song"));
console.log("--- get_song text ---\n" + grid);
console.log(
  "--- list_instruments ---\n" + text(await call("list_instruments")),
);

let r;

r = text(
  await call("add_track", {
    instrument: "snare",
    name: "Snare",
    pattern: "....X.......X...",
  }),
);
console.log("add_track:", r.message, "->", r.track.pattern);
console.log("new track id:", r.track.id);

r = text(
  await call("set_drum_pattern", {
    track: "Hats",
    pattern: "x.x.x.x.x.x.x.x.",
  }),
);
console.log("set_drum_pattern:", r.message, "->", r.track.pattern);

r = text(
  await call("set_notes", {
    track: "bass",
    notes: [
      { step: 0, note: "A1", length: 2 },
      { step: 4, note: "A1" },
      { step: 6, note: "C2" },
      { step: 8, note: "E2", length: 2 },
      { step: 12, note: "G2" },
      { step: 14, note: "A2" },
      { step: 16, note: "F1", length: 2 },
      { step: 20, note: "F1" },
      { step: 24, note: "G1", length: 2 },
      { step: 28, note: "G2" },
    ],
  }),
);
console.log("set_notes:", r.message, "->", r.track.notes);

r = text(await call("set_tempo", { bpm: 96, swing: 0.2 }));
console.log("set_tempo:", r.message);

// validation: schema is advisory, the code must reject bad types and impossible combinations
const banana = await call("set_tempo", { bpm: "banana" });
console.log(
  "set_tempo bpm=banana isError:",
  banana.isError,
  "->",
  banana.content[0].text.slice(0, 100),
);
const wrongKind = await call("add_track", {
  instrument: "bass",
  pattern: "x.x.",
});
console.log("add_track bass+pattern isError:", wrongKind.isError);
const noop = await call("update_track", { track: "Kick" });
console.log("update_track no-op isError:", noop.isError);
grid = text(await call("get_song"));
console.log("bpm still a number after bad input:", /(\d+) BPM/.exec(grid)?.[1]);

// error path
const bad = await call("set_drum_pattern", { track: "nope", pattern: "x" });
console.log(
  "error path isError:",
  bad.isError,
  "->",
  bad.content[0].text.slice(0, 120),
);

// dynamic tool should be absent, then present after a shift-drag selection on the snare row
let has = await page.evaluate(async () =>
  (await document.modelContext.getTools()).some(
    (t) => t.name === "edit_selection",
  ),
);
console.log("edit_selection before selection:", has);
const cells = await page.$$('button[aria-label^="Snare step"]');
console.log("snare cells:", cells.length);
const a = await cells[8].boundingBox();
const b = await cells[15].boundingBox();
await page.keyboard.down("Shift");
await page.mouse.move(a.x + 5, a.y + 5);
await page.mouse.down();
await page.mouse.move(b.x + 5, b.y + 5, { steps: 6 });
await page.mouse.up();
await page.keyboard.up("Shift");
await new Promise((res) => setTimeout(res, 300));
has = await page.evaluate(async () =>
  (await document.modelContext.getTools()).some(
    (t) => t.name === "edit_selection",
  ),
);
console.log("edit_selection after selection:", has);
grid = text(await call("get_song"));
console.log(
  "selection line:",
  grid.split("\n").find((l) => l.includes("selected")),
);
r = text(
  await call("edit_selection", { action: "set_pattern", pattern: "x.xxx.xX" }),
);
console.log("edit_selection:", r.message, "->", r.track.pattern);

// playback via agent: audio unlocked by autoplay policy flag in headless
r = await call("set_playback", { playing: true });
console.log(
  "set_playback:",
  r.content[0].text.slice(0, 160),
  "isError:",
  !!r.isError,
);
await new Promise((res) => setTimeout(res, 1200));
const playing = await page.$eval("button[aria-pressed]", (b) =>
  b.getAttribute("aria-pressed"),
);
console.log("play button pressed:", playing);
await call("set_playback", { playing: false });

// confirmation flow: clear_song should open dialog; decline it
const pending = call("clear_song");
await page.waitForSelector('[data-slot="dialog-content"]', { timeout: 3000 });
console.log("confirm dialog opened");
await page.click('[data-slot="dialog-content"] button:nth-of-type(1)');
r = text(await pending);
console.log("clear_song declined ->", r.message, "confirmed:", r.confirmed);

const ruler = await page.$eval(
  'div[style*="width: 192px"]',
  (d) => d.textContent,
);
console.log("ruler text:", ruler);
await page.screenshot({ path: shot, fullPage: false });
console.log("screenshot:", shot);
const biggest = [...sizes].sort((a, b) => b.chars - a.chars)[0];
const overBudget = sizes.filter((s) => s.chars > OUTPUT_BUDGET);
console.log(
  `tool outputs: ${sizes.length} calls, largest ${biggest.name} = ${biggest.chars} chars, over ${OUTPUT_BUDGET}: ${overBudget.length}`,
);
overBudget.forEach((s) => console.log("   OVER BUDGET:", s.name, s.chars));
console.log("console errors/warnings:", errors.length);
errors.slice(0, 10).forEach((e) => console.log("  ", e));
await browser.close();
