// Headless end-to-end check of the WebMCP surface in Chromium (needs the WebMCP feature).
// Usage: SMOKE_URL=http://localhost:3123/ CHROMIUM=/usr/bin/chromium bun run smoke [screenshot.png]
// Exits 1 when an assertion fails, any tool output exceeds Chrome's 1.5K guidance, or the page logs
// a console error or warning.
import puppeteer from "puppeteer-core";

const URL = process.env.SMOKE_URL ?? "http://localhost:3000/";
const shot = process.argv[2] ?? "/tmp/smoke.png";
const OUTPUT_BUDGET = 1500; // Chrome's guidance for a single tool output
const EXPECTED_TOOLS = 15; // edit_selection is dynamic and absent without a selection

const failures = [];
const expect = (ok, label, detail) => {
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail !== undefined ? ` -> ${detail}` : ""}`,
  );
  if (!ok) failures.push(label);
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
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
// Unwrap the MCP text block: JSON results become objects, plain text stays a string.
const text = (r) => {
  const t = r.content?.[0]?.text;
  try {
    return JSON.parse(t);
  } catch {
    return t ?? r;
  }
};
const hasTool = (name) =>
  page.evaluate(
    async (name) =>
      (await document.modelContext.getTools()).some((t) => t.name === name),
    name,
  );

const registered = await page.evaluate(async () =>
  (await document.modelContext.getTools()).map((t) => ({
    name: t.name,
    title: t.title,
    annotations: t.annotations ?? {},
    descriptionLength: t.description.length,
  })),
);
console.log(
  "registered tools:",
  registered.length,
  registered.map((t) => t.name).join(", "),
);
if (registered.length === 0) {
  console.log("PAGE ERRORS:", errors);
  await page.screenshot({ path: shot });
  await browser.close();
  process.exit(1);
}
expect(
  registered.length === EXPECTED_TOOLS,
  `${EXPECTED_TOOLS} tools registered`,
  registered.length,
);
expect(
  registered.every((t) => t.title),
  "every tool has a title",
);
expect(
  registered.every((t) => t.descriptionLength <= 500),
  "descriptions within 500 chars",
);
const getSong = registered.find((t) => t.name === "get_song");
expect(
  getSong?.annotations.readOnlyHint === true &&
    getSong?.annotations.untrustedContentHint === true,
  "get_song is readOnly + untrustedContent",
  JSON.stringify(getSong?.annotations),
);

let grid = text(await call("get_song"));
console.log("--- get_song text ---\n" + grid);
expect(
  typeof grid === "string" && /112 BPM/.test(grid),
  "get_song is a text grid",
);
const instruments = text(await call("list_instruments"));
expect(
  typeof instruments === "string" && instruments.split("\n").length === 14,
  "list_instruments lists 14 instruments",
);

let r = text(
  await call("add_track", {
    instrument: "snare",
    name: "Snare",
    pattern: "....X.......X...",
  }),
);
expect(
  r.track?.pattern === "|....X.......X...|....X.......X...|",
  "add_track returns the new pattern",
  r.track?.pattern,
);
expect(
  typeof r.track?.id === "string" && r.track.id.length > 0,
  "add_track returns an id",
  r.track?.id,
);

r = text(
  await call("set_drum_pattern", {
    track: "Hats",
    pattern: "x.x.x.x.x.x.x.x.",
  }),
);
expect(
  r.track?.pattern === "|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|",
  "set_drum_pattern tiles a 16-step pattern over 2 bars",
  r.track?.pattern,
);

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
expect(
  r.track?.notes?.startsWith("0:A1(2) 4:A1 6:C2"),
  "set_notes returns note tokens",
  r.track?.notes,
);

r = text(await call("set_tempo", { bpm: 96, swing: 0.2 }));
expect(/96 BPM/.test(r.message ?? ""), "set_tempo", r.message);

// validation: the schema is advisory, the code must reject bad types and impossible combinations
const banana = await call("set_tempo", { bpm: "banana" });
expect(
  banana.isError === true && /must be a number/.test(banana.content[0].text),
  "set_tempo bpm=banana is rejected",
  banana.content[0].text.slice(0, 100),
);
const wrongKind = await call("add_track", {
  instrument: "bass",
  pattern: "x.x.",
});
expect(wrongKind.isError === true, "add_track melodic+pattern is rejected");
const noop = await call("update_track", { track: "Kick" });
expect(noop.isError === true, "update_track without changes is rejected");
grid = text(await call("get_song"));
expect(/96 BPM/.test(grid), "bpm still 96 after bad input");

const bad = await call("set_drum_pattern", { track: "nope", pattern: "x" });
expect(
  bad.isError === true && /No track matches "nope"/.test(bad.content[0].text),
  "unknown track error is actionable",
  bad.content[0].text.slice(0, 120),
);

// dynamic tool: absent until the human shift-drags a selection on the snare row
expect(
  (await hasTool("edit_selection")) === false,
  "edit_selection absent without selection",
);
const cells = await page.$$('button[aria-label^="Snare step"]');
expect(cells.length === 32, "snare row has 32 cells", cells.length);
const a = await cells[8].boundingBox();
const b = await cells[15].boundingBox();
await page.keyboard.down("Shift");
await page.mouse.move(a.x + 5, a.y + 5);
await page.mouse.down();
await page.mouse.move(b.x + 5, b.y + 5, { steps: 6 });
await page.mouse.up();
await page.keyboard.up("Shift");
await new Promise((res) => setTimeout(res, 300));
expect(
  (await hasTool("edit_selection")) === true,
  "edit_selection appears with a selection",
);
grid = text(await call("get_song"));
expect(
  /selected steps 8-15 on track "Snare"/.test(grid),
  "get_song reports the selection",
);
r = text(
  await call("edit_selection", { action: "set_pattern", pattern: "x.xxx.xX" }),
);
expect(
  r.track?.pattern === "|....X...x.xxx.xX|....X.......X...|",
  "edit_selection writes only the selected steps",
  r.track?.pattern,
);

// playback via agent: audio unlocked by the autoplay flag in headless
r = await call("set_playback", { playing: true });
expect(!r.isError, "set_playback starts", r.content[0].text.slice(0, 80));
await new Promise((res) => setTimeout(res, 1200));
const pressed = await page.$eval("button[aria-pressed]", (b) =>
  b.getAttribute("aria-pressed"),
);
expect(pressed === "true", "play button shows playing");
await call("set_playback", { playing: false });

// confirmation flow: clear_song opens a dialog; declining leaves the song alone
const pending = call("clear_song");
const dialog = await page
  .waitForSelector('[data-slot="dialog-content"]', { timeout: 3000 })
  .catch(() => null);
expect(dialog !== null, "clear_song opens the confirmation dialog");
if (dialog)
  await page.click('[data-slot="dialog-content"] button:nth-of-type(1)');
r = text(await pending);
expect(r.confirmed === false, "declined clear_song leaves the song", r.message);
grid = text(await call("get_song"));
expect(/^4\. /m.test(grid), "song still has 4 tracks after decline");

await page.screenshot({ path: shot, fullPage: false });
console.log("screenshot:", shot);

const biggest = [...sizes].sort((x, y) => y.chars - x.chars)[0];
const overBudget = sizes.filter((s) => s.chars > OUTPUT_BUDGET);
expect(
  overBudget.length === 0,
  `all ${sizes.length} tool outputs within ${OUTPUT_BUDGET} chars`,
  `largest ${biggest.name} = ${biggest.chars}`,
);
overBudget.forEach((s) => console.log("   OVER BUDGET:", s.name, s.chars));
expect(errors.length === 0, "no console errors or warnings", errors.length);
errors.slice(0, 10).forEach((e) => console.log("  ", e));

await browser.close();
if (failures.length) {
  console.log(
    `\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}`,
  );
  process.exit(1);
}
console.log("\nall checks passed");
