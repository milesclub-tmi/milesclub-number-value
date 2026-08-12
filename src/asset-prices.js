/*
 * 원화 결과를 다른 자산 수량으로 환산한다.
 *
 * 달러·금·비트코인은 실시간으로 가져온다(전부 CORS를 허용하는 엔드포인트).
 * 주식은 브라우저에서 직접 받을 수 있는 무료 소스가 없어 아래 기준값을 쓴다 —
 * 네이버·야후·Stooq는 CORS 차단, AlphaVantage 무료 키는 하루 25회를 전체 방문자가 공유해 실사용 불가.
 *
 * ⚠️ live가 없는 자산(주식)의 krw는 손으로 넣은 스냅샷이다. 배포 전에 갱신하고 asOf도 같이 고칠 것.
 *
 * 호스트 앱이 시세를 알고 있다면 스크립트보다 먼저 window.MILES_ASSET_PRICES를 넣어 덮어쓸 수 있다.
 * 이 경우 외부 요청은 아예 하지 않는다.
 */
export const REFERENCE_PRICES = Object.freeze({
  asOf: "2026-08-12",
  assets: Object.freeze([
    { key: "usd", label: "미국 달러", unit: "달러", icon: "dollar", krw: 1390, live: "usd" },
    { key: "gold", label: "금", unit: "돈", icon: "gem", krw: 640000, live: "gold" },
    { key: "samsung", label: "삼성전자", unit: "주", icon: "stock", krw: 74000 },
    { key: "nvidia", label: "엔비디아", unit: "주", icon: "stock", krw: 250000 },
    { key: "btc", label: "비트코인", unit: "개", icon: "bitcoin", krw: 158000000, live: "btc" }
  ])
});

const GRAMS_PER_DON = 3.75;
const GRAMS_PER_TROY_OUNCE = 31.1034768;

export const LIVE_SOURCES = Object.freeze({
  usd: {
    url: "https://open.er-api.com/v6/latest/USD",
    read: (data) => data?.rates?.KRW
  },
  btc: {
    url: "https://api.upbit.com/v1/ticker?markets=KRW-BTC",
    read: (data) => data?.[0]?.trade_price
  },
  gold: {
    // PAXG는 금 1트로이온스를 추종하는 토큰이다. 국내 소매가가 아니라 국제 시세 기준으로 돈(3.75g) 환산.
    url: "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=krw",
    read: (data) => {
      const perOunce = data?.["pax-gold"]?.krw;
      return perOunce > 0 ? perOunce * (GRAMS_PER_DON / GRAMS_PER_TROY_OUNCE) : undefined;
    }
  }
});

const CACHE_KEY = "miles:asset-prices";

export function getPriceTable() {
  const injected = typeof window === "undefined" ? null : window.MILES_ASSET_PRICES;
  if (!injected?.assets?.length) return REFERENCE_PRICES;

  return {
    asOf: injected.asOf ?? REFERENCE_PRICES.asOf,
    assets: injected.assets.filter((asset) => Number.isFinite(asset?.krw) && asset.krw > 0)
  };
}

export function hostOverridesPrices() {
  return Boolean(typeof window !== "undefined" && window.MILES_ASSET_PRICES?.assets?.length);
}

// 하나가 실패해도 나머지는 살린다. 전부 실패하면 빈 객체가 나오고 화면은 스냅샷을 그대로 쓴다.
export async function fetchLivePrices({ timeout = 4000, cacheMs = 600000, fetcher = fetch } = {}) {
  const cached = readCache(cacheMs);
  if (cached) return cached;

  const entries = await Promise.all(
    Object.entries(LIVE_SOURCES).map(async ([key, source]) => {
      try {
        const response = await fetcher(source.url, { signal: AbortSignal.timeout(timeout) });
        if (!response.ok) return null;

        const value = source.read(await response.json());
        return Number.isFinite(value) && value > 0 ? [key, value] : null;
      } catch {
        return null;
      }
    })
  );

  const prices = Object.fromEntries(entries.filter(Boolean));
  const result = { prices, fetchedAt: Date.now() };

  if (Object.keys(prices).length > 0) writeCache(result);
  return result;
}

export function applyLivePrices(table, live) {
  const prices = live?.prices ?? {};
  const hasAny = Object.keys(prices).length > 0;

  return {
    ...table,
    fetchedAt: hasAny ? (live?.fetchedAt ?? null) : null,
    assets: table.assets.map((asset) =>
      asset.live && Number.isFinite(prices[asset.live]) ? { ...asset, krw: prices[asset.live], isLive: true } : asset
    )
  };
}

export function convertValue(krw, table = getPriceTable()) {
  return {
    asOf: table.asOf,
    fetchedAt: table.fetchedAt ?? null,
    // 실시간으로 못 채운 자산이 남아 있으면 화면에서 기준일을 따로 안내해야 한다.
    hasSnapshot: table.assets.some((asset) => !asset.isLive),
    items: table.assets.map((asset) => {
      const quantity = krw / asset.krw;

      return {
        key: asset.key,
        label: asset.label,
        unit: asset.unit,
        icon: asset.icon,
        isLive: Boolean(asset.isLive),
        quantity,
        display: `${formatQuantity(quantity)}${asset.unit}`
      };
    })
  };
}

// 1,000원짜리 결과는 비트코인 0.0000063개가 된다. 자릿수를 상황에 맞게 줄여
// "0개"로 뭉개지지도, 소수점이 끝없이 늘어지지도 않게 한다.
export function formatQuantity(quantity) {
  if (!Number.isFinite(quantity) || quantity <= 0) return "0";
  if (quantity >= 1000) return Math.round(quantity).toLocaleString("ko-KR");
  if (quantity >= 100) return quantity.toFixed(0);
  if (quantity >= 10) return trimZeros(quantity.toFixed(1));
  if (quantity >= 0.1) return trimZeros(quantity.toFixed(2));
  if (quantity >= 0.01) return trimZeros(quantity.toFixed(3));

  const precise = quantity.toPrecision(2);
  return precise.includes("e") ? "0.0000001 미만" : trimZeros(precise);
}

function trimZeros(text) {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

export function formatAsOf(asOf) {
  const [year, month, day] = String(asOf).split("-");
  return year && month && day ? `${year}.${month}.${day}` : String(asOf);
}

export function formatFetchedAt(timestamp) {
  return new Date(timestamp).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function readCache(cacheMs) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return Date.now() - parsed.fetchedAt < cacheMs ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(result) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // 프라이빗 모드 등 저장이 막힌 환경은 그냥 매번 새로 받는다.
  }
}
