// Runs Chrome's own eval harness (webmcp-evals) over evals/duet-studio.json in `smoke` mode:
// every expectedCall is executed against the live page, with no LLM and no API key.
// Usage: SMOKE_URL=http://localhost:3123/ CHROMIUM=/usr/bin/chromium bun run evals
// Exits 1 when any step errors or the suite shrinks below the steps it declares.
//
// The published CLI launches Puppeteer with `channel: "chrome-canary"`, which only resolves a real
// Google Chrome install, so we call the evaluator directly and hand it our own launcher — the same
// Chromium `bun run smoke` uses. That reaches past the package's public surface, hence the exact
// version pin in package.json.
import { executeSmokeEvals } from "webmcp-evals/dist/evaluator/smokeEvaluator.js";
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const target = process.env.SMOKE_URL ?? "http://localhost:3000/";
const SUITE = new URL("../evals/duet-studio.json", import.meta.url);
const tests = JSON.parse(await readFile(SUITE, "utf8"));

const launchBrowser = () =>
  puppeteer.launch({
    executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
    headless: true,
    args: [
      "--enable-features=WebMCP",
      "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

console.log(`WebMCP evals (smoke) against ${target}\n`);
const { results, testCount, passCount, errorCount, totalExpectedSteps } =
  await executeSmokeEvals(tests, { url: target }, { launchBrowser });

let lastCase = "";
for (const step of results) {
  if (step.testName !== lastCase) {
    console.log(`\n${step.testName}`);
    lastCase = step.testName;
  }
  const ok = step.outcome === "pass";
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${step.functionName}${ok ? "" : ` -> ${step.error}`}`,
  );
}

// A step that errors stops its case, so a short run means steps never ran at all.
const missing = totalExpectedSteps - results.length;
console.log(
  `\n${passCount}/${totalExpectedSteps} steps across ${testCount} case(s)` +
    `${errorCount ? `, ${errorCount} error(s)` : ""}` +
    `${missing ? `, ${missing} step(s) never ran` : ""}`,
);
process.exit(passCount === totalExpectedSteps ? 0 : 1);
