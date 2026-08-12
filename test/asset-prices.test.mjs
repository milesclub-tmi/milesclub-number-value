import assert from "node:assert/strict";
import test from "node:test";

import {
  REFERENCE_PRICES,
  applyLivePrices,
  convertValue,
  fetchLivePrices,
  formatAsOf,
  formatQuantity,
  hostOverridesPrices
} from "../src/asset-prices.js";

test("기준 시세표가 형식을 지킨다", () => {
  assert.match(REFERENCE_PRICES.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(REFERENCE_PRICES.assets.length >= 3);

  for (const asset of REFERENCE_PRICES.assets) {
    assert.ok(asset.key && asset.label && asset.unit && asset.icon, `${asset.key} 필드 누락`);
    assert.ok(Number.isFinite(asset.krw) && asset.krw > 0, `${asset.key} 가격이 유효하지 않습니다`);
  }

  const keys = REFERENCE_PRICES.assets.map((asset) => asset.key);
  assert.equal(new Set(keys).size, keys.length, "key가 중복됩니다");
});

test("수량은 자릿수에 맞춰 읽기 좋게 줄인다", () => {
  assert.equal(formatQuantity(62590.3), "62,590");
  assert.equal(formatQuantity(136.4), "136");
  assert.equal(formatQuantity(56.78), "56.8");
  assert.equal(formatQuantity(0.5506), "0.55");
  assert.equal(formatQuantity(0.0266), "0.027");
  assert.equal(formatQuantity(0.00027), "0.00027");
  assert.equal(formatQuantity(0.0000063), "0.0000063");
});

test("0이나 잘못된 값은 0으로 떨어진다", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatQuantity(value), "0");
  }
});

test("아무리 작은 금액도 '0개'로 뭉개지지 않는다", () => {
  // 최저 등급 1,000원도 각 자산에서 의미 있는 숫자가 나와야 한다.
  for (const item of convertValue(1000).items) {
    assert.notEqual(item.display, `0${item.unit}`, `${item.label}이 0으로 뭉개졌습니다`);
    assert.ok(item.quantity > 0);
  }
});

test("환산 결과가 금액에 비례한다", () => {
  const small = convertValue(1_000_000);
  const large = convertValue(10_000_000);

  for (const [index, item] of large.items.entries()) {
    assert.ok(
      Math.abs(item.quantity / small.items[index].quantity - 10) < 1e-9,
      `${item.label} 비례가 깨졌습니다`
    );
  }
});

test("호스트가 시세를 덮어쓸 수 있고, 망가진 항목은 무시한다", () => {
  globalThis.window = {
    MILES_ASSET_PRICES: {
      asOf: "2030-01-02",
      assets: [
        { key: "usd", label: "미국 달러", unit: "달러", icon: "dollar", krw: 1000 },
        { key: "broken", label: "깨진 항목", unit: "개", icon: "gem", krw: 0 }
      ]
    }
  };

  try {
    const result = convertValue(50_000);
    assert.equal(result.asOf, "2030-01-02");
    assert.equal(result.items.length, 1, "krw가 0인 항목은 걸러야 합니다");
    assert.equal(result.items[0].display, "50달러");
  } finally {
    delete globalThis.window;
  }
});

test("기준일을 화면 표기로 바꾼다", () => {
  assert.equal(formatAsOf("2026-08-12"), "2026.08.12");
  assert.equal(formatAsOf("이상한값"), "이상한값");
});

// ---------- 실시간 시세 ----------

const okResponse = (payload) => ({ ok: true, json: async () => payload });

const LIVE_PAYLOAD = {
  "https://open.er-api.com/v6/latest/USD": { rates: { KRW: 1412.87 } },
  "https://api.upbit.com/v1/ticker?markets=KRW-BTC": [{ trade_price: 90340000 }],
  "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=krw": { "pax-gold": { krw: 6239190 } }
};

const fakeFetch = (overrides = {}) => async (url) => {
  if (url in overrides) return overrides[url];
  return okResponse(LIVE_PAYLOAD[url]);
};

test("세 소스를 모두 받아 실시간 가격을 만든다", async () => {
  const live = await fetchLivePrices({ fetcher: fakeFetch(), cacheMs: 0 });

  assert.equal(live.prices.usd, 1412.87);
  assert.equal(live.prices.btc, 90340000);
  // PAXG는 1트로이온스(31.1035g) 기준이므로 1돈(3.75g)으로 환산돼야 한다.
  assert.ok(Math.abs(live.prices.gold - 6239190 * (3.75 / 31.1034768)) < 1e-6);
  assert.ok(live.prices.gold > 700000 && live.prices.gold < 800000);
});

test("일부 소스가 죽어도 나머지는 살린다", async () => {
  const live = await fetchLivePrices({
    cacheMs: 0,
    fetcher: fakeFetch({
      "https://api.upbit.com/v1/ticker?markets=KRW-BTC": Promise.reject(new Error("네트워크 실패")),
      "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=krw": { ok: false, status: 503 }
    })
  });

  assert.equal(live.prices.usd, 1412.87);
  assert.equal(live.prices.btc, undefined);
  assert.equal(live.prices.gold, undefined);
});

test("전부 실패하면 빈 결과를 돌려주고 화면은 스냅샷을 유지한다", async () => {
  const live = await fetchLivePrices({ cacheMs: 0, fetcher: async () => { throw new Error("오프라인"); } });
  assert.deepEqual(live.prices, {});

  const table = applyLivePrices(REFERENCE_PRICES, live);
  assert.equal(table.fetchedAt, null);

  const conversion = convertValue(87_000_000, table);
  assert.equal(conversion.fetchedAt, null);
  assert.ok(conversion.items.every((item) => !item.isLive));
});

test("응답이 이상하면 그 항목만 버린다", async () => {
  const live = await fetchLivePrices({
    cacheMs: 0,
    fetcher: fakeFetch({
      "https://open.er-api.com/v6/latest/USD": okResponse({ rates: {} }),
      "https://api.upbit.com/v1/ticker?markets=KRW-BTC": okResponse([{ trade_price: -5 }])
    })
  });

  assert.equal(live.prices.usd, undefined);
  assert.equal(live.prices.btc, undefined);
  assert.ok(live.prices.gold > 0);
});

test("실시간 값이 스냅샷을 대체하고, 주식은 스냅샷으로 남는다", async () => {
  const live = await fetchLivePrices({ fetcher: fakeFetch(), cacheMs: 0 });
  const conversion = convertValue(87_000_000, applyLivePrices(REFERENCE_PRICES, live));

  const byKey = Object.fromEntries(conversion.items.map((item) => [item.key, item]));
  assert.equal(byKey.usd.isLive, true);
  assert.equal(byKey.btc.isLive, true);
  assert.equal(byKey.gold.isLive, true);
  assert.equal(byKey.samsung.isLive, false);
  assert.equal(byKey.nvidia.isLive, false);

  assert.equal(conversion.hasSnapshot, true, "스냅샷이 남아 있으면 화면에서 기준일을 안내해야 한다");
  assert.ok(conversion.fetchedAt > 0);
});

test("호스트가 시세를 넣으면 외부 요청을 하지 않는다", () => {
  assert.equal(hostOverridesPrices(), false);

  globalThis.window = { MILES_ASSET_PRICES: { assets: [{ key: "usd", krw: 1000 }] } };
  try {
    assert.equal(hostOverridesPrices(), true);
  } finally {
    delete globalThis.window;
  }
});
