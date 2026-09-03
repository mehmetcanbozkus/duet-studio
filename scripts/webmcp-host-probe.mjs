// Simulates hosts that implement less of WebMCP than Chromium:
//  mode "minimal": document.modelContext is a plain object with registerTool only (no EventTarget, no getTools).
//  mode "late":    the same object appears 2.5 s after load.
// Usage: SMOKE_URL=http://localhost:3123/ node scripts/webmcp-host-probe.mjs [minimal|late]
import puppeteer from "puppeteer-core";

const URL = process.env.SMOKE_URL ?? "http://localhost:3000/";
const mode = process.argv[2] ?? "minimal";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--window-size=1440,1000"],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console] ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) =>
  errors.push(`[pageerror] ${e.message.slice(0, 200)}`),
);
await page.evaluateOnNewDocument((mode) => {
  const install = () => {
    const tools = new Map();
    // Deliberately NOT an EventTarget and without getTools/executeTool.
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool, options) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () =>
            tools.delete(tool.name),
          );
        },
      },
    });
    window.__hostTools = tools;
  };
  if (mode === "late") setTimeout(install, 2500);
  else install();
}, mode);
await page.goto(URL, { waitUntil: "load" });
await page.waitForSelector("button[aria-pressed]", { timeout: 30000 });
const deadline = Date.now() + 15000;
let count = 0;
while (Date.now() < deadline) {
  count = await page.evaluate(() => window.__hostTools?.size ?? 0);
  if (count >= 15) break;
  await new Promise((r) => setTimeout(r, 250));
}
// Give the status badge a moment to re-render after detection.
await new Promise((r) => setTimeout(r, 600));
const status = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /agent tools live|No agent detected/.test(b.textContent ?? ""),
  );
  return btn?.textContent?.trim() ?? "(status button missing)";
});
const crashed = await page.evaluate(() =>
  document.body.innerText.includes("Something went wrong"),
);
const toolNames = await page.evaluate(() => [
  ...(window.__hostTools?.keys() ?? []),
]);
console.log(
  JSON.stringify(
    { mode, crashed, status, registered: count, toolNames, errors },
    null,
    2,
  ),
);
await browser.close();
process.exit(crashed || count < 15 || errors.length ? 1 : 0);
