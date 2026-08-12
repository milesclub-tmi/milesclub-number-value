/*
 * 공유 카드의 순수 로직과 /s 라우트가 실제로 뱉는 HTML을 검증한다.
 * api/og.js는 @vercel/og(엣지 전용)를 끌어와서 여기서는 다루지 않는다 — 대신 그 입력을
 * 만드는 share-card.js를 조인다.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { analyzePhoneNumber } from "../src/number-value.js";
import { buildShareParams, parseShareParams, shareCopy } from "../src/share-card.js";
import shareHandler from "../api/share.js";

const params = (query) => new URLSearchParams(query);
const shareResponse = (query) => shareHandler(new Request(`https://example.com/s?${query}`));

test("share params round-trip through the URL without touching the number", async () => {
  const result = analyzePhoneNumber("010-7777-7777");
  const built = buildShareParams(result);

  assert.deepEqual(Object.keys(built).sort(), ["g", "t", "v"]);
  assert.equal(JSON.stringify(built).includes("7777"), false, "번호 흔적이 파라미터에 남았습니다");

  const parsed = parseShareParams(params(new URLSearchParams(built)));
  assert.equal(parsed.grade, result.grade);
  assert.equal(parsed.value, result.estimatedValue);
  assert.equal(parsed.typeKey, result.type.key);
});

test("a tampered link degrades instead of rendering whatever it was given", () => {
  assert.equal(parseShareParams(params("g=SUPREME&v=1&t=legend")), null, "모르는 등급은 통째로 버려야 합니다");
  assert.equal(parseShareParams(params("g=%3Cscript%3E")), null);

  const overpriced = parseShareParams(params("g=LEGEND&v=999999999999&t=legend"));
  assert.equal(overpriced.value, null, "엔진이 낼 수 없는 금액은 버려야 합니다");

  const badType = parseShareParams(params("g=GOLD&v=200000&t=../../etc/passwd"));
  assert.equal(badType.typeKey, null);
  assert.equal(badType.grade, "GOLD");
});

test("copy falls back gracefully when only the grade survives", () => {
  const full = shareCopy(parseShareParams(params("g=LEGEND&v=32470000&t=legend")));
  assert.equal(full.headline, "32,470,000원");
  assert.match(full.ogTitle, /32,470,000원.*LEGEND/);
  assert.match(full.invite, /32,470,000원/);
  assert.equal(full.tier, "rare");

  const bare = shareCopy(parseShareParams(params("g=SILVER")));
  assert.equal(bare.headline, "SILVER 번호");
  assert.equal(bare.ogTitle, "내 번호는 SILVER래요");
  assert.ok(!bare.ogDescription.includes("undefined"), `문구가 깨졌습니다: ${bare.ogDescription}`);
});

test("every share card keeps the disclaimer", () => {
  for (const grade of ["NORMAL", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "LEGEND"]) {
    const copy = shareCopy(parseShareParams(params(`g=${grade}&v=50000&t=citizen`)));
    assert.match(copy.ogDescription, /실제 시장 가치가 아니에요/, `${grade} 카드에 고지 문구가 없습니다`);
  }
});

test("the /s route serves crawler tags and sends humans to the app", async () => {
  const response = await shareResponse("g=LEGEND&v=32470000&t=legend");
  const html = await response.text();

  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(html, /property="og:title" content="내 번호는 32,470,000원, LEGEND래요"/);
  assert.match(html, /property="og:image" content="https:\/\/example\.com\/api\/og\?g=LEGEND&amp;v=32470000&amp;t=legend"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);

  // 사람은 앱으로 넘어가야 하고, JS가 막혀도 meta refresh와 링크가 남는다.
  assert.match(html, /location\.replace\("https:\/\/example\.com\/\?from=share&g=LEGEND&v=32470000&t=legend"\)/);
  assert.match(html, /http-equiv="refresh"/);
  assert.match(html, /<a href="[^"]+">/);
});

test("the /s route escapes anything that reaches an attribute", async () => {
  const html = await (await shareResponse('g=LEGEND&v=1000&t="><script>alert(1)</script>')).text();

  assert.ok(!html.includes("<script>alert(1)</script>"), "스크립트가 그대로 박혔습니다");
  assert.ok(!html.includes('t="><'), "따옴표 탈출이 가능합니다");
  assert.ok(!html.includes("alert(1)"), "조작된 타입 값이 페이지에 남았습니다");
});

test("a bare /s still produces a usable card", async () => {
  const html = await (await shareResponse("")).text();

  assert.match(html, /property="og:title" content="내 번호, 얼마일까\?"/);
  assert.match(html, /property="og:image" content="https:\/\/example\.com\/api\/og"/);
  // 깨진 링크로 들어와도 유입 경로는 공유가 맞다. 다만 등급이 없으니 안내 배너는 앱이 알아서 접는다.
  assert.match(html, /location\.replace\("https:\/\/example\.com\/\?from=share"\)/);
});
