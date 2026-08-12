import { analyzePhoneNumber, isValidKoreanMobileNumber } from "./number-value.js";
import { createIcon } from "./icons.js";
import {
  GRADE_ICON,
  GRADE_TIER,
  SHARE_BASE,
  SHARE_PARAM_KEYS,
  SHARE_PATH,
  TYPE_ICON,
  buildShareParams,
  parseShareParams,
  shareCopy
} from "./share-card.js";
import {
  applyLivePrices,
  convertValue,
  fetchLivePrices,
  formatAsOf,
  formatFetchedAt,
  getPriceTable,
  hostOverridesPrices
} from "./asset-prices.js";

const form = document.querySelector("[data-number-form]");
const firstInput = document.querySelector("[data-first]");
const secondInput = document.querySelector("[data-second]");
const errorMessage = document.querySelector("[data-error]");
const appShell = document.querySelector("[data-app]");
const analysisPanel = document.querySelector("[data-analysis]");
const analysisStatus = document.querySelector("[data-analysis-status]");
const resultPanel = document.querySelector("[data-result]");
const scanDigits = document.querySelector("[data-scan-digits]");
const scanStep = document.querySelector("[data-scan-step]");
const scanBar = document.querySelector("[data-scan-bar]");
const shareButton = document.querySelector("[data-share]");
const retryButton = document.querySelector("[data-retry]");
const copyButton = document.querySelector("[data-copy-link]");
const planButton = document.querySelector("[data-plan-cta]");
const fallbackShare = document.querySelector("[data-share-fallback]");
const moreDetails = document.querySelector("[data-more]");
const actionBar = document.querySelector("[data-actions]");
const heroCard = document.querySelector("[data-hero]");

const analysisSteps = ["패턴 찾는 중", "숫자 규칙 분석 중", "희소도 계산 중", "기억하기 쉬운지 확인 중"];

// 등급·타입 아이콘과 등급 연출은 OG 카드와 함께 써야 해서 share-card.js에 있다.
const PATTERN_ICON = {
  all_same: "repeat",
  full_repeat: "repeat",
  abab: "repeat",
  same_digit: "repeat",
  triple: "repeat",
  pair: "pair",
  pair_chain: "pair",
  double: "pair",
  block_echo: "wave",
  full_sequence: "sequence",
  sequence: "sequence",
  run: "sequence",
  step_run: "ladder",
  full_mirror: "mirror",
  palindrome: "mirror",
  mirror_run: "mirror",
  meaning_number: "speech",
  date_like: "calendar",
  round: "target",
  parity: "scales",
  all_distinct: "sparkle",
  bookend: "link",
  natural: "leaf"
};

const STAT_ICON = { 반복력: "repeat", 기억력: "bulb", 희소성: "gem", 리듬감: "music" };

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const ANALYSIS_DURATION = reducedMotion ? 400 : 1300;

let currentResult = null;
let ticker = null;
let pendingAnalysis = null;
let priceTable = getPriceTable();

// 실시간 시세는 결과를 막지 않는다. 스냅샷으로 먼저 그리고, 도착하면 조용히 갈아끼운다.
// 호스트가 시세를 직접 넣어준 경우에는 외부 요청을 아예 하지 않는다.
if (!hostOverridesPrices()) {
  fetchLivePrices()
    .then((live) => {
      priceTable = applyLivePrices(priceTable, live);
      if (currentResult) renderAssets(currentResult.estimatedValue);
    })
    .catch(() => {
      // 전부 실패하면 스냅샷을 그대로 쓴다. 사용자에게 알릴 일은 아니다.
    });
}

// 고정 CTA 바 높이만큼 결과 영역에 여백을 준다. 공유 폴백이 열리면 바가 커지므로 계속 관찰한다.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => {
    const height = Math.ceil(actionBar.getBoundingClientRect().height);
    if (height > 0) resultPanel.style.setProperty("--actions-height", `${height + 4}px`);
  }).observe(actionBar);
}

// data-icon이 붙은 자리를 전부 채운다. 정적 아이콘도 같은 정의를 쓰게 하기 위함.
document.querySelectorAll("[data-icon]").forEach((slot) => setIcon(slot, slot.dataset.icon));

const query = new URLSearchParams(window.location.search);
const entrySource = query.get("from") === "share" ? "share" : "direct";

// 공유 링크에는 등급·예상 금액·타입만 싣는다(번호는 절대 아님). 유입자에게 맥락을 주기 위한 최소 정보다.
// 손으로 고친 링크가 그대로 찍히지 않도록 share-card.js가 값을 전부 검증한다.
const sharedFrom = entrySource === "share" ? parseShareParams(query) : null;

if (sharedFrom) {
  const invite = document.querySelector("[data-invite]");
  const copy = shareCopy(sharedFrom);
  invite.replaceChildren(createIcon(copy.gradeIcon), document.createTextNode(copy.invite));
  invite.hidden = false;
}

track("number_value_view", baseProperties());

// 실기기에서 나는 예외는 이 이벤트가 아니면 볼 방법이 없다. 메시지는 싣지 않는다(화이트리스트가 걸러냄).
window.addEventListener("error", () => track("number_value_runtime_error", baseProperties()));
window.addEventListener("unhandledrejection", () => track("number_value_runtime_error", baseProperties()));

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const phoneNumber = `010${firstInput.value}${secondInput.value}`;
  clearError();

  if (!isValidKoreanMobileNumber(phoneNumber)) {
    showError("번호 뒤 8자리를 정확히 입력해주세요.");
    track("number_value_input_error", baseProperties());
    return;
  }

  track("number_value_start", baseProperties());
  startAnalysis(phoneNumber);

  pendingAnalysis = window.setTimeout(() => {
    pendingAnalysis = null;

    try {
      const result = analyzePhoneNumber(phoneNumber);
      stopAnalysis();
      renderResult(result);
      currentResult = result;
      track("number_value_complete", analyticsFromResult(result));
    } catch {
      resetToInput();
      showError("분석 중 문제가 생겼어요. 다시 입력해주세요.");
      track("number_value_analyze_error", baseProperties());
    }
  }, ANALYSIS_DURATION);
});

[firstInput, secondInput].forEach((input, index, inputs) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    clearError();

    if (input.value.length === 4 && inputs[index + 1]) {
      inputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && input.value.length === 0 && inputs[index - 1]) {
      inputs[index - 1].focus();
    }
  });

  input.addEventListener("paste", (event) => {
    const pasted = (event.clipboardData ?? window.clipboardData)?.getData("text") ?? "";
    const digits = pasted.replace(/\D/g, "");
    if (digits.length <= 4) return;

    event.preventDefault();
    fillFromDigits(digits);
  });
});

/*
 * 링크 하나만 보낸다. 받는 쪽에서 /s 라우트의 OG 태그가 카드로 펼쳐지므로 이미지를 따로 붙일 필요가 없다.
 * 파일을 함께 실으면 여러 공유 타깃이 URL을 떨어뜨려 오히려 카드가 안 뜬다.
 */
shareButton.addEventListener("click", async () => {
  if (!currentResult) return;

  track("number_value_share_click", analyticsFromResult(currentResult));
  fallbackShare.hidden = true;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "내 번호 가격",
        text: `내 번호는 ${currentResult.estimatedValueLabel}, ${currentResult.grade}래요. 너 번호는 얼마?`,
        url: buildShareUrl()
      });
      track("number_value_share_complete", analyticsFromResult(currentResult));
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  fallbackShare.hidden = false;
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildShareUrl());
    copyButton.textContent = "복사 완료";
    if (currentResult) track("number_value_share_complete", analyticsFromResult(currentResult));
  } catch {
    copyButton.textContent = "복사 실패";
  }

  window.setTimeout(() => {
    copyButton.textContent = "링크 복사";
  }, 1500);
});

retryButton.addEventListener("click", () => {
  resetToInput();
  firstInput.value = "";
  secondInput.value = "";
  firstInput.focus();
  track("number_value_retry", baseProperties());
});

moreDetails.addEventListener("toggle", () => {
  if (moreDetails.open && currentResult) {
    track("number_value_detail_open", analyticsFromResult(currentResult));
  }
});

planButton.addEventListener("click", (event) => {
  track("number_value_plan_cta_click", currentResult ? analyticsFromResult(currentResult) : baseProperties());

  // 평소에는 링크가 그냥 열린다. 호스트 앱이 웹뷰 안에서 직접 라우팅하고 싶으면
  // miles_navigate에 preventDefault를 걸어 기본 이동을 막을 수 있다.
  const navigation = new CustomEvent("miles_navigate", {
    detail: { target: "plan_type_test", url: planButton.href },
    cancelable: true
  });

  if (!window.dispatchEvent(navigation)) event.preventDefault();
});

function fillFromDigits(digits) {
  const tail = digits.startsWith("010") ? digits.slice(3) : digits;
  firstInput.value = tail.slice(0, 4);
  secondInput.value = tail.slice(4, 8);
  clearError();
  (secondInput.value.length === 4 ? secondInput : firstInput).focus();
}

function startAnalysis(phoneNumber) {
  appShell.dataset.state = "analysis";
  resultPanel.hidden = true;
  analysisPanel.hidden = false;
  fallbackShare.hidden = true;
  analysisStatus.textContent = "번호를 분석하고 있습니다.";

  const lastFour = phoneNumber.slice(-4);
  scanDigits.textContent = `010-••••-${lastFour}`;
  scanStep.textContent = analysisSteps[0];

  scanBar.style.transition = "none";
  scanBar.style.width = "0%";
  requestAnimationFrame(() => {
    scanBar.style.transition = `width ${ANALYSIS_DURATION}ms linear`;
    scanBar.style.width = "100%";
  });

  window.clearInterval(ticker);
  if (reducedMotion) return;

  let tick = 0;
  ticker = window.setInterval(() => {
    tick += 1;
    scanStep.textContent = analysisSteps[tick % analysisSteps.length];
    scanDigits.textContent = `010-${rollingBlock(tick)}-${lastFour}`;
  }, 260);
}

function stopAnalysis() {
  window.clearInterval(ticker);
  ticker = null;
  analysisPanel.hidden = true;
  analysisStatus.textContent = "";
}

function resetToInput() {
  window.clearTimeout(pendingAnalysis);
  pendingAnalysis = null;
  stopAnalysis();
  resultPanel.hidden = true;
  fallbackShare.hidden = true;
  moreDetails.open = false;
  appShell.dataset.state = "input";
  currentResult = null;
}

function renderResult(result) {
  appShell.dataset.state = "result";
  resultPanel.hidden = false;

  const value = document.querySelector("[data-value]");
  value.style.setProperty("--value-length", String(result.estimatedValueLabel.length));
  countUp(value, result.estimatedValue, (amount) => `${amount.toLocaleString("ko-KR")}원`);

  setText("grade", result.grade);
  setText("rank", `상위 ${result.percentile}%`);
  setText("masked", result.maskedDisplay);
  setText("score", `${result.detections.length}개`);
  setText("type-title", result.type.title);
  setText("type-description", result.type.description);
  setIcon(document.querySelector("[data-type-icon]"), TYPE_ICON[result.type.key] ?? "face");
  setIcon(document.querySelector("[data-grade-emblem]"), GRADE_ICON[result.grade] ?? "face");

  heroCard.dataset.tier = GRADE_TIER[result.grade] ?? "base";
  replayAnimation(heroCard.querySelector("[data-grade-emblem]"), "emblem-pop");

  document.querySelector("[data-patterns]").replaceChildren(
    ...result.detections.slice(0, 6).map((detection) => {
      const chip = document.createElement("span");
      chip.className = `chip chip--${detection.strength}`;
      chip.title = detection.reason;

      chip.append(createIcon(PATTERN_ICON[detection.type] ?? "sparkle"), document.createTextNode(detection.label));
      return chip;
    })
  );

  const metrics = [
    { label: "반복력", value: weightedDisplay(result.components.repetition, result.components.density) },
    { label: "기억력", value: result.components.memorability.displayScore },
    { label: "희소성", value: weightedDisplay(result.components.rarity, result.components.completion) },
    { label: "리듬감", value: weightedDisplay(result.components.sequence, result.components.symmetry) }
  ];

  document.querySelector("[data-bars]").replaceChildren(...metrics.map(createStatRow));

  renderAssets(result.estimatedValue);

  document.querySelector("[data-reasons]").replaceChildren(
    ...Object.values(result.components)
      .filter((component) => component.points > 0)
      .sort((a, b) => b.displayScore - a.displayScore)
      .slice(0, 3)
      .map((component) => {
        const item = document.createElement("li");
        item.textContent = `${component.label} · ${component.reason}`;
        return item;
      })
  );

  resultPanel.focus();
}

function renderAssets(krw) {
  const conversion = convertValue(krw, priceTable);

  setText(
    "asset-asof",
    conversion.fetchedAt ? `실시간 ${formatFetchedAt(conversion.fetchedAt)}` : `기준 ${formatAsOf(conversion.asOf)}`
  );

  const note = document.querySelector("[data-asset-note]");
  if (note) {
    // 실시간과 스냅샷이 섞여 있으면 어느 쪽이 옛날 값인지 밝혀야 한다.
    const stale = conversion.fetchedAt && conversion.hasSnapshot;
    note.textContent = stale ? `주식은 ${formatAsOf(conversion.asOf)} 기준이에요.` : "";
    note.hidden = !stale;
  }

  document.querySelector("[data-assets]").replaceChildren(...conversion.items.map(createAssetRow));
}

function createAssetRow(item) {
  const row = document.createElement("div");
  row.className = "asset";

  const label = document.createElement("span");
  label.className = "asset__label";
  label.append(createIcon(item.icon), document.createTextNode(item.label));

  const value = document.createElement("span");
  value.className = "asset__value";
  value.textContent = item.display;

  row.append(label, value);
  return row;
}

function createStatRow(metric, index) {
  const row = document.createElement("div");
  row.className = "stat";

  const label = document.createElement("span");
  label.className = "stat__label";

  label.append(createIcon(STAT_ICON[metric.label] ?? "sparkle"), document.createTextNode(metric.label));

  const track = document.createElement("div");
  track.className = "stat__track";
  track.setAttribute("role", "meter");
  track.setAttribute("aria-valuenow", String(metric.value));
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-label", `${metric.label} ${metric.value}점`);

  const fill = document.createElement("span");
  fill.className = "stat__fill";
  fill.style.transitionDelay = `${index * 80}ms`;
  track.append(fill);

  const value = document.createElement("span");
  value.className = "stat__value";
  value.textContent = "0";

  row.append(label, track, value);

  requestAnimationFrame(() => {
    fill.style.width = `${metric.value}%`;
    countUp(value, metric.value, String, 900, index * 80);
  });

  return row;
}

// 같은 애니메이션을 다시 태우려면 클래스를 뗐다가 리플로우 후 다시 붙여야 한다.
function replayAnimation(element, className) {
  if (!element || reducedMotion) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function countUp(element, target, format, duration = 1100, delay = 0) {
  if (reducedMotion) {
    element.textContent = format(target);
    return;
  }

  element.textContent = format(0);

  const start = performance.now() + delay;
  const tick = (now) => {
    const progress = Math.min(1, Math.max(0, (now - start) / duration));
    element.textContent = format(Math.round(target * (1 - Math.pow(1 - progress, 4))));
    if (progress < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function baseProperties() {
  return { entry_source: entrySource, shared_entry: entrySource === "share" };
}

function analyticsFromResult(result) {
  return {
    score_bucket: `${Math.floor(result.score / 10) * 10}_${Math.min(100, Math.floor(result.score / 10) * 10 + 9)}`,
    grade: result.grade,
    detected_pattern_types: result.detectedPatternTypes,
    estimated_value_bucket: result.estimatedValueBucket,
    entry_source: entrySource,
    shared_entry: entrySource === "share"
  };
}

function track(event, properties = {}) {
  const allowedProperties = [
    "score_bucket",
    "grade",
    "detected_pattern_types",
    "estimated_value_bucket",
    "entry_source",
    "shared_entry"
  ];
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => allowedProperties.includes(key))
  );
  const payload = { event, ...safeProperties };

  window.dispatchEvent(new CustomEvent("miles_analytics", { detail: payload }));

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(payload);
  }
}

/*
 * 공유 링크는 앱이 아니라 /s 라우트를 가리킨다. 크롤러는 JS를 실행하지 않으므로
 * 앱 URL을 그대로 보내면 미리보기가 비어 버린다. /s가 OG 태그를 찍고 사람은 앱으로 넘긴다.
 */
function buildShareUrl() {
  const url = new URL(SHARE_PATH, SHARE_BASE || window.location.href);
  if (!currentResult) return url.toString();

  const params = buildShareParams(currentResult);
  for (const key of SHARE_PARAM_KEYS) url.searchParams.set(key, params[key]);

  return url.toString();
}

function rollingBlock(tick) {
  return Array.from({ length: 4 }, (_, index) => ((tick * 7 + index * 3) % 10).toString()).join("");
}

function weightedDisplay(primary, secondary) {
  return Math.round(primary.displayScore * 0.68 + secondary.displayScore * 0.32);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function setText(key, value) {
  const target = document.querySelector(`[data-${key}]`);
  if (target) target.textContent = value;
}

function setIcon(slot, name) {
  if (!slot) return;
  slot.dataset.icon = name;
  slot.replaceChildren(createIcon(name));
}
