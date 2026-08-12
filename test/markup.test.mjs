import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const markup = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

const selectorsIn = (source) => new Set([...source.matchAll(/\[data-([a-z-]+)\]/g)].map((match) => match[1]));
const attributesIn = (source) => new Set([...source.matchAll(/[\s"]data-([a-z-]+)[\s=>]/g)].map((match) => match[1]));

test("every data hook queried by app.js exists in index.html", () => {
  const queried = new Set([
    ...selectorsIn(script),
    ...[...script.matchAll(/setText\("([a-z-]+)"/g)].map((match) => match[1])
  ]);
  const present = attributesIn(markup);

  for (const hook of queried) {
    assert.ok(present.has(hook), `index.html is missing [data-${hook}], which app.js queries`);
  }
});

test("every in-page anchor points at an element that exists", () => {
  const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

  for (const [, target] of markup.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(target), `href="#${target}" has no matching element`);
  }
});

test("the scanning animation is not wired to a live region", () => {
  const panel = markup.match(/<section class="analysis-panel"[^>]*>/)?.[0] ?? "";
  assert.ok(panel, "analysis panel not found");
  assert.ok(!panel.includes("aria-live"), "the 180ms scan ticker must not sit inside an aria-live region");
});

test("phone inputs opt out of autofill so split blocks cannot be clobbered", () => {
  const inputs = [...markup.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(inputs.length, 2);

  for (const input of inputs) {
    assert.ok(input.includes('autocomplete="off"'), `input should disable autofill: ${input}`);
  }
});

test("the privacy promise in the markup matches what the code sends", () => {
  assert.ok(markup.includes("저장하지 않고"), "privacy note missing");
  assert.ok(!/track\([^)]*normalized/.test(script), "analytics must never receive the raw number");
});

test("the share URL carries only the grade, never anything number-derived", () => {
  const params = [...script.matchAll(/url\.searchParams\.set\(\s*"([^"]+)"\s*,\s*([^)]+)\)/g)];
  const allowed = { g: "currentResult.grade" };

  for (const [, key, value] of params) {
    assert.ok(key in allowed, `share URL must not carry "${key}"`);
    assert.equal(value.trim(), allowed[key], `"${key}" must be exactly ${allowed[key]}`);
  }

  const builder = script.match(/function buildShareUrl\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(builder, "buildShareUrl not found");
  for (const leak of ["normalized", "tail", "maskedDisplay", "estimatedValue", "segments"]) {
    assert.ok(!builder.includes(leak), `share URL must not reference ${leak}`);
  }
});

test("the analytics whitelist has not been widened to anything number-derived", () => {
  const list = script.match(/const allowedProperties = \[([\s\S]*?)\]/)?.[1] ?? "";
  const keys = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(keys.sort(), [
    "detected_pattern_types",
    "entry_source",
    "estimated_value_bucket",
    "grade",
    "score_bucket",
    "shared_entry"
  ]);
});
