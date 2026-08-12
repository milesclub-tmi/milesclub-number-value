import { SCORE_CDF } from "./score-calibration.js";

export const MEANING_NUMBERS = Object.freeze({
  "1004": { label: "천사", description: "좋은 기운이 떠오르는 의미 숫자예요" },
  "8282": { label: "빨리빨리", description: "한국 사용자에게 익숙한 리듬 숫자예요" },
  "7942": { label: "친구사이", description: "말맛이 있는 관계형 의미 숫자예요" },
  "2424": { label: "이사이사", description: "반복 발음이 쉬운 의미 숫자예요" },
  "2580": { label: "키패드 세로줄", description: "전화 키패드를 세로로 훑는 익숙한 배열이에요" },
  "486": { label: "사랑해", description: "오래 알려진 숫자 고백 코드예요" },
  "119": { label: "119", description: "누구나 아는 긴급 번호 조합이에요" },
  "112": { label: "112", description: "누구나 아는 신고 번호 조합이에요" }
});

const SHORT_MEANINGS = Object.freeze(
  Object.entries(MEANING_NUMBERS).filter(([value]) => value.length < 4)
);

const SCORE_WEIGHTS = Object.freeze({
  repetition: 22,
  sequence: 16,
  symmetry: 14,
  memorability: 18,
  density: 12,
  completion: 10,
  rarity: 8
});

const GRADE_BANDS = buildGradeBands([
  { grade: "NORMAL", share: 0.45, valueMin: 1000, valueMax: 30000 },
  { grade: "SILVER", share: 0.27, valueMin: 30000, valueMax: 150000 },
  { grade: "GOLD", share: 0.17, valueMin: 150000, valueMax: 800000 },
  { grade: "PLATINUM", share: 0.09, valueMin: 800000, valueMax: 5000000 },
  { grade: "DIAMOND", share: 0.018, valueMin: 5000000, valueMax: 30000000 },
  { grade: "LEGEND", share: 0.002, valueMin: 30000000, valueMax: 90000000 }
]);

// 공유 카드(share-card.js)가 타입 키로 제목을 되찾아야 해서 내보낸다.
export const TYPE_RULES = Object.freeze({
  legend: {
    key: "legend",
    title: "전설의 번호",
    description: "강한 희소성과 압도적인 기억성을 동시에 가진 최상위 번호예요."
  },
  numeric_noble: {
    key: "numeric_noble",
    title: "번호의 귀족",
    description: "흔히 보기 어려운 규칙성이 고급스럽게 겹쳐 있는 번호예요."
  },
  repeat_king: {
    key: "repeat_king",
    title: "반복의 제왕",
    description: "한 번 들으면 쉽게 잊히지 않는 강력한 반복 패턴을 가진 번호예요."
  },
  mirror_maniac: {
    key: "mirror_maniac",
    title: "대칭 집착러",
    description: "앞뒤 균형이 또렷해서 숫자 배열이 깔끔하게 기억되는 번호예요."
  },
  sequence_hunter: {
    key: "sequence_hunter",
    title: "연속번호 헌터",
    description: "숫자가 자연스럽게 이어지는 흐름 덕분에 리듬감이 좋은 번호예요."
  },
  gold_collector: {
    key: "gold_collector",
    title: "골드 수집가",
    description: "익숙한 의미 숫자와 발음 리듬이 숨어 있어 공유하기 좋은 번호예요."
  },
  date_keeper: {
    key: "date_keeper",
    title: "기념일 번호",
    description: "날짜처럼 읽히는 구간이 있어 사연을 붙이기 좋은 번호예요."
  },
  flawless: {
    key: "flawless",
    title: "겹침 없는 번호",
    description: "여덟 자리가 한 번씩만 등장하는, 의외로 드문 무중복 배열이에요."
  },
  quiet_power: {
    key: "quiet_power",
    title: "은근히 리드미컬",
    description: "튀지는 않지만 반복, 페어, 리듬 요소가 적당히 살아 있는 번호예요."
  },
  citizen: {
    key: "citizen",
    title: "무난해서 쓰기 좋은",
    description: "강한 희소 패턴은 적지만 담백하고 자연스러운 일상형 번호예요."
  }
});

export function normalizePhoneNumber(input) {
  return String(input ?? "").replace(/\D/g, "");
}

export function isValidKoreanMobileNumber(input) {
  return /^010\d{8}$/.test(normalizePhoneNumber(input));
}

export function analyzePhoneNumber(input) {
  const normalized = normalizePhoneNumber(input);

  if (!isValidKoreanMobileNumber(normalized)) {
    throw new Error("대한민국 휴대폰 번호 형식(010-0000-0000)에 맞게 입력해주세요.");
  }

  const inspection = inspectTail(normalized.slice(3));
  const { tail, front, back, segmentInfo, fullInfo, scan } = inspection;
  const detections = collectDetections(inspection);
  const components = scoreComponents(inspection);
  const combination = scoreCombination(inspection, detections);
  const baseScore = Object.values(components).reduce((sum, component) => sum + component.points, 0);
  const patternScore = clamp(Math.round((baseScore + combination.bonus) * combination.multiplier), 0, 100);

  const rank = rankPatternScore(patternScore, normalized);
  const band = getGradeBand(rank);
  const estimatedValue = estimateValue(rank, patternScore, band);

  return {
    normalized,
    tail,
    segments: { front, back },
    maskedDisplay: maskPhoneNumber(normalized, "result"),
    maskedShare: maskPhoneNumber(normalized, "share"),
    score: clamp(Math.round(rank * 100), 0, 100),
    patternScore,
    grade: band.grade,
    percentile: Number(clamp((1 - rank) * 100, 0.1, 99.9).toFixed(1)),
    estimatedValue,
    estimatedValueLabel: formatKRW(estimatedValue),
    estimatedValueBucket: valueBucket(estimatedValue),
    components,
    detections,
    detectedPatternTypes: [...new Set(detections.map((detection) => detection.type))],
    type: chooseNumberType(rank, inspection),
    trace: {
      baseScore,
      rank,
      combination,
      segmentInfo,
      fullInfo,
      scan
    }
  };
}

export function computePatternScore(tail) {
  const inspection = inspectTail(tail);
  const detections = collectDetections(inspection);
  const components = scoreComponents(inspection);
  const combination = scoreCombination(inspection, detections);
  const baseScore = Object.values(components).reduce((sum, component) => sum + component.points, 0);

  return clamp(Math.round((baseScore + combination.bonus) * combination.multiplier), 0, 100);
}

export function maskPhoneNumber(input, mode = "result") {
  const normalized = normalizePhoneNumber(input);

  if (!/^010\d{8}$/.test(normalized)) {
    return "010-••••-••••";
  }

  const first = normalized.slice(3, 7);
  const last = normalized.slice(7);

  if (mode === "share") {
    return `010-••••-••${last.slice(2)}`;
  }

  return `010-${first.slice(0, 2)}••-${last}`;
}

export function formatKRW(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function inspectTail(rawTail) {
  const tail = String(rawTail);
  const front = tail.slice(0, 4);
  const back = tail.slice(4);
  const segmentInfo = [front, back].map(inspectSegment);
  const scan = scanTail(tail);
  const fullInfo = inspectFullTail(tail, front, back, segmentInfo);

  return { tail, front, back, segmentInfo, fullInfo, scan };
}

function inspectSegment(segment) {
  const chars = [...segment];
  const unique = new Set(chars);
  const sameDigit = /^(\d)\1{3}$/.test(segment);
  const pair = chars[0] === chars[1] && chars[2] === chars[3] && chars[0] !== chars[2];
  const abab = chars[0] === chars[2] && chars[1] === chars[3] && chars[0] !== chars[1];
  const palindrome = segment === reverse(segment) && unique.size > 1;
  const sequence = sequenceDirection(segment);

  return {
    value: segment,
    uniqueCount: unique.size,
    sameDigit,
    pair,
    abab,
    palindrome,
    sequence,
    dateLike: dateLikeKind(segment),
    roundLevel: roundLevel(segment),
    meaning: MEANING_NUMBERS[segment] ?? null,
    isPatterned: sameDigit || pair || abab || palindrome || Boolean(sequence) || Boolean(MEANING_NUMBERS[segment])
  };
}

function scanTail(tail) {
  const digits = [...tail].map(Number);
  const sameRuns = [];
  let runLength = 1;

  for (let index = 1; index <= digits.length; index += 1) {
    if (index < digits.length && digits[index] === digits[index - 1]) {
      runLength += 1;
      continue;
    }
    if (runLength > 1) sameRuns.push(runLength);
    runLength = 1;
  }

  const longestStepRun = (step) => {
    let best = 1;
    let current = 1;

    for (let index = 1; index < digits.length; index += 1) {
      current = digits[index] - digits[index - 1] === step ? current + 1 : 1;
      best = Math.max(best, current);
    }

    return best;
  };

  let mirror3 = 0;
  for (let index = 0; index + 2 < digits.length; index += 1) {
    if (digits[index] === digits[index + 2] && digits[index] !== digits[index + 1]) mirror3 += 1;
  }

  return {
    doubles: sameRuns.filter((length) => length === 2).length,
    triples: sameRuns.filter((length) => length >= 3).length,
    longestSameRun: sameRuns.reduce((max, length) => Math.max(max, length), 1),
    longestSequenceRun: Math.max(longestStepRun(1), longestStepRun(-1)),
    longestStepRun: Math.max(longestStepRun(2), longestStepRun(-2)),
    mirror3,
    allDistinct: new Set(digits).size === digits.length,
    allEven: digits.every((digit) => digit % 2 === 0),
    allOdd: digits.every((digit) => digit % 2 === 1),
    bookend: digits[0] === digits[digits.length - 1]
  };
}

function inspectFullTail(tail, front, back, segmentInfo) {
  const digitCounts = countDigits([...tail]);
  const meanings = findMeanings(segmentInfo);

  return {
    uniqueCount: Object.keys(digitCounts).length,
    maxDigitCount: Math.max(...Object.values(digitCounts)),
    allSame: /^(\d)\1{7}$/.test(tail),
    fullRepeat: front === back,
    fullMirror: front === reverse(back),
    fullSequence: sequenceDirection(tail),
    pairChain: [...tail].every((char, index) => index % 2 === 1 || char === tail[index + 1]),
    blockEcho: front.slice(0, 2) === back.slice(0, 2) || front.slice(2) === back.slice(2),
    meanings,
    meaningRepeat: segmentInfo.every((segment) => segment.meaning) && front === back,
    dateLikeCount: segmentInfo.filter((segment) => segment.dateLike).length,
    roundLevel: Math.max(...segmentInfo.map((segment) => segment.roundLevel)),
    segmentPatternCount: segmentInfo.filter((segment) => segment.isPatterned).length,
    segmentSequenceCount: segmentInfo.filter((segment) => segment.sequence).length
  };
}

function collectDetections({ tail, front, segmentInfo, fullInfo, scan }) {
  const detections = [];
  const add = (type, label, reason, strength = "medium") => {
    if (!detections.some((item) => item.type === type && item.label === label)) {
      detections.push({ type, label, reason, strength });
    }
  };

  if (fullInfo.allSame) {
    add("all_same", `${tail[0]} 8연속`, "뒤 8자리가 모두 같은 숫자예요.", "legend");
  }

  if (fullInfo.fullRepeat && !fullInfo.allSame) {
    add("full_repeat", `${front} 반복`, "앞 4자리와 뒤 4자리가 동일해요.", "high");
  }

  if (fullInfo.fullSequence) {
    add(
      "full_sequence",
      fullInfo.fullSequence === "ascending" ? "전체 연속" : "전체 역순",
      "뒤 8자리가 하나의 연속 흐름으로 이어져요.",
      "high"
    );
  }

  if (fullInfo.fullMirror && !fullInfo.allSame) {
    add("full_mirror", "전체 대칭", "앞 4자리와 뒤 4자리가 거울처럼 맞물려요.", "high");
  }

  if (fullInfo.pairChain && !fullInfo.allSame) {
    add("pair_chain", "페어 체인", "두 자리씩 같은 숫자가 이어져요.", "high");
  }

  segmentInfo.forEach((segment, index) => {
    const scope = index === 0 ? "앞자리" : "뒷자리";

    if (segment.sameDigit && !fullInfo.allSame) {
      add("same_digit", `${segment.value} 동일`, `${scope} 4자리가 모두 같은 숫자예요.`, "high");
    }

    if (segment.pair) {
      add("pair", "페어 패턴", `${scope}에 두 자리씩 묶이는 페어가 있어요.`, "medium");
    }

    if (segment.abab) {
      add("abab", `${segment.value.slice(0, 2)} 반복`, `${scope}가 ABAB 형태로 반복돼요.`, "medium");
    }

    if (segment.palindrome) {
      add("palindrome", "대칭형", `${scope} 자체가 좌우 대칭이에요.`, "medium");
    }

    if (segment.sequence) {
      add(
        "sequence",
        segment.sequence === "ascending" ? `${segment.value} 연속` : `${segment.value} 역순`,
        `${scope}가 연속 숫자 흐름을 가져요.`,
        "medium"
      );
    }
  });

  fullInfo.meanings.forEach((meaning) => {
    add("meaning_number", meaning.label, `${meaning.value}${topicParticle(meaning.value)} ${meaning.description}.`, "medium");
  });

  if (scan.triples > 0 && !fullInfo.allSame) {
    add("triple", `${scan.longestSameRun}연속 동일`, `같은 숫자가 ${scan.longestSameRun}번 이어지는 구간이 있어요.`, "medium");
  }

  if (fullInfo.blockEcho && !fullInfo.fullRepeat) {
    add("block_echo", "두 자리 메아리", "앞뒤 블록에서 같은 두 자리가 다시 등장해요.", "medium");
  }

  if (scan.longestSequenceRun >= 3 && !fullInfo.fullSequence) {
    add("run", `${scan.longestSequenceRun}연속 흐름`, `연속된 숫자가 ${scan.longestSequenceRun}자리 이어져요.`, "low");
  }

  if (scan.longestStepRun >= 3) {
    add("step_run", "등차 흐름", "두 칸씩 건너뛰는 규칙적인 흐름이 있어요.", "low");
  }

  if (scan.mirror3 > 0 && !fullInfo.fullMirror) {
    add("mirror_run", "부분 대칭", "가운데를 접으면 겹치는 세 자리 구간이 있어요.", "low");
  }

  if (scan.doubles > 0 && !fullInfo.pairChain) {
    add("double", `더블 ${scan.doubles}개`, "같은 숫자가 나란히 붙은 구간이 있어요.", "low");
  }

  if (fullInfo.dateLikeCount > 0) {
    add("date_like", "날짜 배열", "월일 또는 연도처럼 읽히는 네 자리가 있어요.", "low");
  }

  if (fullInfo.roundLevel > 0) {
    add("round", "라운드 넘버", "0으로 떨어지는 마무리라 말하기 편해요.", "low");
  }

  if (scan.allEven || scan.allOdd) {
    add("parity", scan.allEven ? "올 짝수" : "올 홀수", `여덟 자리가 모두 ${scan.allEven ? "짝수" : "홀수"}예요.`, "low");
  }

  if (scan.allDistinct) {
    add("all_distinct", "무중복", "여덟 자리에 같은 숫자가 하나도 없어요.", "low");
  }

  if (scan.bookend && !fullInfo.allSame) {
    add("bookend", "수미상관", "시작과 끝이 같은 숫자로 맞물려요.", "low");
  }

  if (detections.length === 0) {
    add("natural", "자연 번호", "강한 희소 패턴 없이 자연스럽게 섞인 번호예요.", "low");
  }

  return detections;
}

function scoreComponents(inspection) {
  const { segmentInfo, fullInfo, scan } = inspection;

  return {
    repetition: makeComponent(
      "반복성",
      scoreRepetition(segmentInfo, fullInfo, scan),
      SCORE_WEIGHTS.repetition,
      explainRepetition(segmentInfo, fullInfo, scan)
    ),
    sequence: makeComponent(
      "연속성",
      scoreSequence(segmentInfo, fullInfo, scan),
      SCORE_WEIGHTS.sequence,
      explainSequence(fullInfo, scan)
    ),
    symmetry: makeComponent(
      "대칭성",
      scoreSymmetry(segmentInfo, fullInfo, scan),
      SCORE_WEIGHTS.symmetry,
      explainSymmetry(segmentInfo, fullInfo, scan)
    ),
    memorability: makeComponent(
      "기억 용이성",
      scoreMemorability(segmentInfo, fullInfo, scan),
      SCORE_WEIGHTS.memorability,
      explainMemorability(fullInfo, scan)
    ),
    density: makeComponent(
      "동일 숫자 밀도",
      scoreDensity(fullInfo),
      SCORE_WEIGHTS.density,
      `서로 다른 숫자 ${fullInfo.uniqueCount}개로 이루어졌고, 가장 많이 나온 숫자가 ${fullInfo.maxDigitCount}번 등장해요.`
    ),
    completion: makeComponent(
      "전체 패턴 완성도",
      scoreCompletion(fullInfo, scan),
      SCORE_WEIGHTS.completion,
      explainCompletion(fullInfo, scan)
    ),
    rarity: makeComponent(
      "특수 희소성",
      scoreRarity(segmentInfo, fullInfo, scan),
      SCORE_WEIGHTS.rarity,
      explainRarity(segmentInfo, fullInfo, scan)
    )
  };
}

function makeComponent(label, points, max, reason) {
  const bounded = clamp(points, 0, max);

  return {
    label,
    points: bounded,
    max,
    displayScore: clamp(Math.round((bounded / max) * 100), 0, 100),
    reason
  };
}

function scoreRepetition(segmentInfo, fullInfo, scan) {
  if (fullInfo.allSame) return SCORE_WEIGHTS.repetition;

  let points = 0;
  if (fullInfo.fullRepeat) points += 13;
  if (fullInfo.pairChain) points += 4;
  if (fullInfo.blockEcho) points += 2;

  points += Math.min(5, scan.doubles * 2);
  points += Math.min(7, scan.triples * 4);
  if (scan.longestSameRun >= 4) points += 3;

  segmentInfo.forEach((segment) => {
    if (segment.sameDigit) points += 6;
    if (segment.abab) points += 4;
    if (segment.pair) points += 3;
  });

  return points;
}

function scoreSequence(segmentInfo, fullInfo, scan) {
  if (fullInfo.fullSequence) return SCORE_WEIGHTS.sequence;

  let points = 0;
  segmentInfo.forEach((segment) => {
    if (segment.sequence) points += 5;
  });

  if (fullInfo.segmentSequenceCount === 2) points += 2;
  if (scan.longestSequenceRun >= 3) points += (scan.longestSequenceRun - 2) * 2;
  if (scan.longestStepRun >= 3) points += (scan.longestStepRun - 2) * 1.5;

  return points;
}

function scoreSymmetry(segmentInfo, fullInfo, scan) {
  if (fullInfo.fullMirror) return SCORE_WEIGHTS.symmetry;

  let points = 0;
  segmentInfo.forEach((segment) => {
    if (segment.palindrome) points += 5;
  });

  points += Math.min(5, scan.mirror3 * 1.6);
  if (scan.bookend) points += 2;

  return points;
}

function scoreMemorability(segmentInfo, fullInfo, scan) {
  if (fullInfo.allSame) return SCORE_WEIGHTS.memorability;

  let points = Math.max(1, (9 - fullInfo.uniqueCount) * 0.9);
  if (fullInfo.fullRepeat) points += 10;
  if (fullInfo.fullSequence) points += 12;
  if (fullInfo.fullMirror) points += 11;
  if (fullInfo.pairChain) points += 7;

  points += fullInfo.meanings.length * 4;
  points += fullInfo.dateLikeCount * 2.5;
  points += fullInfo.roundLevel * 1.5;
  if (scan.triples > 0) points += 3;

  segmentInfo.forEach((segment) => {
    if (segment.sameDigit) points += 5;
    if (segment.abab || segment.pair || segment.palindrome || segment.sequence) points += 2.5;
  });

  return points;
}

function scoreDensity(fullInfo) {
  const repeatShare = ((fullInfo.maxDigitCount - 1) / 7) * 8;
  const varietyShare = ((8 - fullInfo.uniqueCount) / 7) * 4;

  return repeatShare + varietyShare;
}

function scoreCompletion(fullInfo, scan) {
  if (fullInfo.allSame || fullInfo.fullRepeat || fullInfo.fullSequence || fullInfo.fullMirror) return 10;
  if (fullInfo.pairChain) return 8;
  if (fullInfo.segmentPatternCount === 2) return 7;
  if (fullInfo.segmentPatternCount === 1) return 4;
  if (scan.longestSameRun >= 3 || scan.longestSequenceRun >= 4) return 3;
  if (scan.doubles > 0 || scan.mirror3 > 0) return 2;

  return 0;
}

function scoreRarity(segmentInfo, fullInfo, scan) {
  if (fullInfo.allSame) return SCORE_WEIGHTS.rarity;

  let points = 0;
  if (fullInfo.fullSequence || fullInfo.fullMirror) points += 6;
  else if (fullInfo.fullRepeat) points += 5;

  if (fullInfo.pairChain) points += 3;
  if (segmentInfo.some((segment) => segment.sameDigit)) points += 2;
  if (fullInfo.meanings.length > 0) points += 1.5;
  if (scan.allDistinct) points += 2;
  if (scan.allEven || scan.allOdd) points += 2;

  return points;
}

function scoreCombination({ fullInfo, segmentInfo, scan }, detections) {
  const strongTypes = new Set();
  let bonus = 0;

  if (fullInfo.allSame) {
    strongTypes.add("all_same");
    bonus += 10;
  }

  if (fullInfo.fullSequence) {
    strongTypes.add("full_sequence");
    bonus += 24;
  }

  if (fullInfo.fullMirror && !fullInfo.allSame) {
    strongTypes.add("full_mirror");
    bonus += 14;
  }

  if (fullInfo.fullRepeat && !fullInfo.allSame) {
    strongTypes.add("full_repeat");
    bonus += 9;
  }

  if (fullInfo.meaningRepeat) {
    strongTypes.add("meaning_repeat");
    bonus += 5;
  } else if (fullInfo.meanings.length > 0) {
    strongTypes.add("meaning_number");
    bonus += 3;
  }

  if (fullInfo.pairChain && !fullInfo.allSame) {
    strongTypes.add("pair_chain");
    bonus += 6;
  }

  if (scan.triples > 0 && !fullInfo.allSame) {
    strongTypes.add("triple");
    bonus += 2;
  }

  if (fullInfo.segmentSequenceCount === 2 && !fullInfo.fullSequence) {
    strongTypes.add("double_segment_sequence");
  }

  if (segmentInfo.some((segment) => segment.sameDigit || segment.abab || segment.pair || segment.palindrome)) {
    strongTypes.add("segment_pattern");
  }

  bonus += Math.max(0, strongTypes.size - 1) * 3;

  const highStrengthCount = detections.filter(
    (detection) => detection.strength === "high" || detection.strength === "legend"
  ).length;
  const multiplier = 1 + Math.min(0.16, strongTypes.size * 0.025 + highStrengthCount * 0.012);

  return {
    bonus,
    multiplier: Number(multiplier.toFixed(3)),
    appliedTypes: [...strongTypes]
  };
}

function chooseNumberType(rank, { fullInfo, segmentInfo, scan }) {
  if (fullInfo.allSame || rank >= 0.998) return TYPE_RULES.legend;
  if (rank >= 0.98) return TYPE_RULES.numeric_noble;
  if (fullInfo.fullRepeat || scan.triples > 0 || segmentInfo.some((segment) => segment.sameDigit || segment.abab)) {
    return TYPE_RULES.repeat_king;
  }
  if (fullInfo.fullMirror || segmentInfo.some((segment) => segment.palindrome) || scan.mirror3 >= 2) {
    return TYPE_RULES.mirror_maniac;
  }
  if (fullInfo.fullSequence || segmentInfo.some((segment) => segment.sequence) || scan.longestSequenceRun >= 4) {
    return TYPE_RULES.sequence_hunter;
  }
  if (fullInfo.meanings.length > 0) return TYPE_RULES.gold_collector;
  if (fullInfo.dateLikeCount > 0) return TYPE_RULES.date_keeper;
  if (scan.allDistinct) return TYPE_RULES.flawless;
  if (rank >= 0.45) return TYPE_RULES.quiet_power;

  return TYPE_RULES.citizen;
}

// 같은 패턴 점수를 받은 번호들은 모델상 구분이 불가능하므로,
// 그 점수 구간 안에서만 번호 해시로 순서를 매겨 균등하게 펼친다.
// 덕분에 최종 순위는 전체 010 번호에 대해 균등 분포가 되고, 같은 번호는 항상 같은 결과가 나온다.
function rankPatternScore(patternScore, normalized) {
  const index = clamp(patternScore, 0, SCORE_CDF.length - 1);
  const lower = index === 0 ? 0 : SCORE_CDF[index - 1];
  const upper = SCORE_CDF[index];
  const spread = Math.max(0, upper - lower);

  return clamp(lower + spread * seedFraction(normalized), 0, 1);
}

function buildGradeBands(bands) {
  let cursor = 1;

  const built = [...bands]
    .reverse()
    .map((band) => {
      const hi = cursor;
      cursor = Math.max(0, cursor - band.share);
      return { ...band, lo: cursor, hi };
    })
    .reverse();

  built[0].lo = 0;

  return Object.freeze(built.map((band) => Object.freeze({ ...band, ...rawRangeFor(band) })));
}

// 등급 구간의 양 끝에 해당하는 패턴 점수. 순위만으로 값을 매기면 상위 구간이
// 전부 한 점으로 뭉치기 때문에, 구간 안에서의 위치는 패턴 점수로도 가늠한다.
function rawRangeFor(band) {
  let rawMin = 0;
  let rawMax = SCORE_CDF.length - 1;

  for (let score = 0; score < SCORE_CDF.length; score += 1) {
    if (SCORE_CDF[score] > band.lo) {
      rawMin = score;
      break;
    }
  }

  for (let score = SCORE_CDF.length - 1; score >= 0; score -= 1) {
    if ((score === 0 ? 0 : SCORE_CDF[score - 1]) < band.hi) {
      rawMax = score;
      break;
    }
  }

  return { rawMin, rawMax: Math.max(rawMax, rawMin) };
}

function getGradeBand(rank) {
  return GRADE_BANDS.find((band) => rank >= band.lo && rank < band.hi) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
}

function estimateValue(rank, patternScore, band) {
  const rankPosition = clamp((rank - band.lo) / Math.max(band.hi - band.lo, Number.EPSILON), 0, 1);
  const rawPosition = clamp((patternScore - band.rawMin) / Math.max(band.rawMax - band.rawMin, 1), 0, 1);
  const eased = Math.pow(rawPosition * 0.72 + rankPosition * 0.28, 1.25);

  return roundNatural(band.valueMin * Math.pow(band.valueMax / band.valueMin, eased));
}

function valueBucket(value) {
  if (value < 30000) return "under_30k";
  if (value < 150000) return "30k_150k";
  if (value < 800000) return "150k_800k";
  if (value < 5000000) return "800k_5m";
  if (value < 30000000) return "5m_30m";
  return "over_30m";
}

function findMeanings(segmentInfo) {
  const meanings = [];
  const push = (value, meaning) => {
    if (!meanings.some((item) => item.label === meaning.label)) {
      meanings.push({ value, label: meaning.label, description: meaning.description });
    }
  };

  segmentInfo.forEach((segment) => {
    if (segment.meaning) push(segment.value, segment.meaning);
  });

  // 3자리 의미 숫자는 4자리 블록 안에서 앞뒤로 붙어 있을 때만 인정한다.
  // 블록 경계를 가로지르는 매칭(3721|1260 → "112")은 아무도 그렇게 읽지 않는다.
  segmentInfo.forEach((segment) => {
    SHORT_MEANINGS.forEach(([value, meaning]) => {
      if (segment.value.startsWith(value) || segment.value.endsWith(value)) push(value, meaning);
    });
  });

  return meanings;
}

function dateLikeKind(segment) {
  if (/^(19|20)\d{2}$/.test(segment)) return "year";

  const month = Number(segment.slice(0, 2));
  const day = Number(segment.slice(2));
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return "date";

  return null;
}

function roundLevel(segment) {
  if (/0000$/.test(segment)) return 3;
  if (/000$/.test(segment)) return 2;
  if (/00$/.test(segment)) return 1;

  return 0;
}

function explainRepetition(segmentInfo, fullInfo, scan) {
  if (fullInfo.allSame) return "뒤 8자리가 하나의 숫자로 완성된 최고 반복 패턴이에요.";
  if (fullInfo.fullRepeat) return "앞 4자리와 뒤 4자리가 같은 블록으로 반복돼요.";
  if (fullInfo.pairChain) return "두 자리 단위 페어가 이어져 반복 리듬이 있어요.";
  if (scan.triples > 0) return `같은 숫자가 ${scan.longestSameRun}번 연달아 나오는 구간이 있어요.`;
  if (segmentInfo.some((segment) => segment.sameDigit || segment.abab || segment.pair)) {
    return "일부 구간에서 반복 또는 페어 구조가 발견됐어요.";
  }
  if (scan.doubles > 0) return `같은 숫자가 나란히 붙은 구간이 ${scan.doubles}곳 있어요.`;

  return "강한 반복 패턴은 발견되지 않았어요.";
}

function explainSequence(fullInfo, scan) {
  if (fullInfo.fullSequence) return "뒤 8자리가 전체적으로 끊기지 않는 연속 흐름이에요.";
  if (fullInfo.segmentSequenceCount > 0) return "4자리 구간 안에서 연속 숫자 흐름이 발견됐어요.";
  if (scan.longestSequenceRun >= 3) return `연속된 숫자가 ${scan.longestSequenceRun}자리 이어지는 구간이 있어요.`;
  if (scan.longestStepRun >= 3) return "두 칸씩 건너뛰는 등차 흐름이 있어요.";

  return "연속 또는 역순 흐름은 약해요.";
}

function explainSymmetry(segmentInfo, fullInfo, scan) {
  if (fullInfo.fullMirror) return "뒤 8자리가 앞뒤로 접히는 전체 대칭 구조예요.";
  if (segmentInfo.some((segment) => segment.palindrome)) return "일부 구간이 좌우 대칭이에요.";
  if (scan.mirror3 > 0) return `가운데를 접으면 겹치는 세 자리 구간이 ${scan.mirror3}곳 있어요.`;
  if (scan.bookend) return "시작과 끝이 같은 숫자로 맞물려요.";

  return "뚜렷한 대칭 패턴은 발견되지 않았어요.";
}

function explainMemorability(fullInfo, scan) {
  if (fullInfo.allSame || fullInfo.fullRepeat || fullInfo.fullSequence || fullInfo.fullMirror) {
    return "큰 단위 규칙이 있어 한 번에 기억하기 쉬워요.";
  }
  if (fullInfo.meanings.length > 0) return "의미 숫자 또는 발음 리듬이 기억을 도와요.";
  if (fullInfo.dateLikeCount > 0) return "날짜처럼 읽히는 구간이 있어 사연을 붙여 외우기 좋아요.";
  if (fullInfo.roundLevel > 0) return "0으로 떨어지는 마무리라 말로 전하기 편해요.";
  if (fullInfo.segmentPatternCount > 0 || scan.doubles > 0) return "일부 구간에 기억하기 쉬운 리듬이 있어요.";

  return "숫자가 비교적 고르게 섞여 즉각적인 기억 단서는 적어요.";
}

function explainCompletion(fullInfo, scan) {
  if (fullInfo.allSame || fullInfo.fullRepeat || fullInfo.fullSequence || fullInfo.fullMirror) {
    return "뒤 8자리 전체가 하나의 규칙으로 읽혀요.";
  }
  if (fullInfo.pairChain || fullInfo.segmentPatternCount === 2) return "두 구간 모두 일정한 규칙을 가져요.";
  if (fullInfo.segmentPatternCount === 1) return "한 구간에서만 뚜렷한 규칙이 보여요.";
  if (scan.longestSameRun >= 3 || scan.longestSequenceRun >= 4) return "부분적으로 이어지는 규칙 구간이 있어요.";

  return "전체를 관통하는 완성형 패턴은 약해요.";
}

function explainRarity(segmentInfo, fullInfo, scan) {
  if (fullInfo.allSame) return "동일 숫자 8자리는 극히 강한 희소 패턴으로 봐요.";
  if (fullInfo.fullSequence || fullInfo.fullMirror || fullInfo.fullRepeat) {
    return "전체 8자리가 강한 규칙을 갖는 희소 패턴이에요.";
  }
  if (scan.allEven || scan.allOdd) return `여덟 자리가 모두 ${scan.allEven ? "짝수" : "홀수"}인 드문 배열이에요.`;
  if (scan.allDistinct) return "같은 숫자가 한 번도 겹치지 않는 무중복 배열이에요.";
  if (segmentInfo.some((segment) => segment.sameDigit) || fullInfo.meanings.length > 0 || fullInfo.pairChain) {
    return "일부 구간에서 재미있는 희소 신호가 있어요.";
  }

  return "특수 희소 패턴은 발견되지 않았어요.";
}

// 숫자를 읽었을 때 받침이 있으면 "은", 없으면 "는". (486은 "사팔육", 2580은 "이오팔공")
function topicParticle(value) {
  return "24590".includes(value.at(-1)) && value.at(-1) !== "0" ? "는" : "은";
}

function sequenceDirection(value) {
  const digits = [...value].map(Number);
  const ascending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] + 1);
  const descending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] - 1);

  if (ascending) return "ascending";
  if (descending) return "descending";

  return null;
}

function countDigits(chars) {
  return chars.reduce((counts, char) => {
    counts[char] = (counts[char] ?? 0) + 1;
    return counts;
  }, {});
}

function seededHash(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedFraction(value) {
  return (seededHash(value) % 1000003) / 1000003;
}

function roundNatural(value) {
  const unit =
    value >= 10000000 ? 1000000 : value >= 1000000 ? 100000 : value >= 100000 ? 10000 : value >= 10000 ? 1000 : 100;

  return Math.max(unit, Math.round(value / unit) * unit);
}

function reverse(value) {
  return [...value].reverse().join("");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
