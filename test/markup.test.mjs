import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { SHARE_PARAM_KEYS } from "../src/share-card.js";

const markup = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const shareCard = await readFile(new URL("../src/share-card.js", import.meta.url), "utf8");
const shareRoute = await readFile(new URL("../api/share.js", import.meta.url), "utf8");

// 번호 원문이나 그로부터 바로 복원되는 값들. 공유 경로 어디에도 나타나면 안 된다.
const NUMBER_DERIVED = ["normalized", "tail", "maskedDisplay", "maskedShare", "segments"];

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

test("the share URL carries only grade, value and type — nothing number-derived", () => {
  assert.deepEqual([...SHARE_PARAM_KEYS], ["g", "v", "t"]);

  const builder = shareCard.match(/export function buildShareParams\([\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(builder, "buildShareParams not found");
  for (const leak of NUMBER_DERIVED) {
    assert.ok(!builder.includes(leak), `share params must not reference ${leak}`);
  }

  // app.js는 화이트리스트를 돌 뿐, 직접 파라미터를 붙이지 않아야 한다.
  const urlBuilder = script.match(/function buildShareUrl\(\)[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(urlBuilder, "buildShareUrl not found");
  for (const leak of NUMBER_DERIVED) {
    assert.ok(!urlBuilder.includes(leak), `share URL must not reference ${leak}`);
  }
  assert.ok(urlBuilder.includes("SHARE_PARAM_KEYS"), "share URL must iterate the whitelist, not ad-hoc keys");
});

test("the OG route re-emits only values that passed validation", () => {
  const handler = shareRoute.match(/export default function handler[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(handler, "share handler not found");

  // 검증을 통과한 share 객체에서만 값을 꺼내야 한다. 원본 쿼리를 그대로 넘기면 조작된 값이 카드에 찍힌다.
  assert.ok(!/requestUrl\.searchParams(?!\))/.test(handler.replace("parseShareParams(requestUrl.searchParams)", "")),
    "handler must not forward raw query params");
  for (const leak of NUMBER_DERIVED) {
    assert.ok(!shareRoute.includes(leak), `share route must not reference ${leak}`);
  }
  assert.ok(shareRoute.includes("escapeHtml"), "OG tag values must be escaped");
});

test("the app markup carries a default OG card", () => {
  for (const property of ["og:title", "og:description", "og:image", "twitter:card"]) {
    assert.ok(markup.includes(property), `index.html is missing ${property}`);
  }
  assert.ok(markup.includes('content="summary_large_image"'), "large card is required for the share preview");
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
