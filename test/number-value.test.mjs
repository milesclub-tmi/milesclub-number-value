import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePhoneNumber,
  isValidKoreanMobileNumber,
  maskPhoneNumber,
  normalizePhoneNumber
} from "../src/number-value.js";

const GRADE_ORDER = ["NORMAL", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "LEGEND"];

const includesAll = (result, patternTypes) => {
  for (const type of patternTypes) {
    assert.ok(
      result.detectedPatternTypes.includes(type),
      `${result.normalized} should include pattern type ${type}; got ${result.detectedPatternTypes.join(", ")}`
    );
  }
};

const atLeastGrade = (result, grade) => {
  assert.ok(
    GRADE_ORDER.indexOf(result.grade) >= GRADE_ORDER.indexOf(grade),
    `${result.normalized} should be at least ${grade}; got ${result.grade} (score ${result.score})`
  );
};

test("normalizes and validates 010 Korean mobile numbers", () => {
  assert.equal(normalizePhoneNumber("010-1234-5678"), "01012345678");
  assert.equal(isValidKoreanMobileNumber("010-1234-5678"), true);
  assert.equal(isValidKoreanMobileNumber("011-1234-5678"), false);
  assert.equal(isValidKoreanMobileNumber("010-123-5678"), false);
});

test("rejects malformed input", () => {
  assert.throws(() => analyzePhoneNumber("010-123-4567"), /휴대폰 번호 형식/);
  assert.throws(() => analyzePhoneNumber(""), /휴대폰 번호 형식/);
  assert.throws(() => analyzePhoneNumber(null), /휴대폰 번호 형식/);
});

test("010-7777-7777 is a LEGEND all-same number", () => {
  const result = analyzePhoneNumber("010-7777-7777");
  assert.equal(result.grade, "LEGEND");
  assert.equal(result.patternScore, 100);
  assert.equal(result.score, 100);
  includesAll(result, ["all_same"]);
  assert.equal(result.trace.fullInfo.allSame, true);
  assert.equal(result.type.key, "legend");
});

test("010-1234-1234 detects a repeated sequence block", () => {
  const result = analyzePhoneNumber("010-1234-1234");
  atLeastGrade(result, "DIAMOND");
  includesAll(result, ["full_repeat", "sequence"]);
  assert.equal(result.trace.fullInfo.fullRepeat, true);
  assert.equal(result.trace.fullInfo.segmentSequenceCount, 2);
});

test("010-1234-5678 receives full-sequence treatment", () => {
  const result = analyzePhoneNumber("010-1234-5678");
  atLeastGrade(result, "DIAMOND");
  includesAll(result, ["full_sequence"]);
  assert.equal(result.trace.fullInfo.fullSequence, "ascending");
});

test("010-1234-4321 detects full mirror symmetry", () => {
  const result = analyzePhoneNumber("010-1234-4321");
  atLeastGrade(result, "DIAMOND");
  includesAll(result, ["full_mirror", "sequence"]);
  assert.equal(result.trace.fullInfo.fullMirror, true);
});

test("010-8282-8282 detects ABAB, repeated, and meaning-number patterns", () => {
  const result = analyzePhoneNumber("010-8282-8282");
  atLeastGrade(result, "DIAMOND");
  includesAll(result, ["full_repeat", "abab", "meaning_number"]);
  assert.equal(result.trace.fullInfo.meaningRepeat, true);
});

test("010-1122-3344 detects pair-chain structure", () => {
  const result = analyzePhoneNumber("010-1122-3344");
  atLeastGrade(result, "GOLD");
  includesAll(result, ["pair_chain", "pair"]);
  assert.equal(result.trace.fullInfo.pairChain, true);
});

test("010-5831-7264 stays ordinary without strong patterns", () => {
  const result = analyzePhoneNumber("010-5831-7264");
  assert.equal(result.grade, "NORMAL");
  assert.ok(result.patternScore < 10, `patternScore should stay low; got ${result.patternScore}`);
  includesAll(result, ["all_distinct"]);
});

test("three-digit meaning numbers match only when block-aligned", () => {
  // 4자리 블록의 앞이나 뒤에 붙어 있으면 인정한다.
  for (const number of ["010-1486-2537", "010-4860-1234"]) {
    const result = analyzePhoneNumber(number);
    assert.ok(
      result.detections.some((detection) => detection.label === "사랑해"),
      `${number} should surface 486`
    );
  }

  // 블록 경계를 가로지르는 우연한 일치는 인정하지 않는다. 아무도 그렇게 읽지 않는다.
  for (const number of ["010-3721-1260", "010-2345-6112"]) {
    const result = analyzePhoneNumber(number);
    const crossing = result.detections.filter((detection) => detection.type === "meaning_number");
    assert.deepEqual(
      crossing.filter((detection) => ["112", "119", "사랑해"].includes(detection.label) && number === "010-3721-1260"),
      [],
      `${number} must not match across the block boundary`
    );
  }

  assert.equal(
    analyzePhoneNumber("010-3721-1260").detectedPatternTypes.includes("meaning_number"),
    false,
    "3721|1260 has no readable meaning number"
  );
});

test("soft patterns still give ordinary numbers something to show", () => {
  const result = analyzePhoneNumber("010-5511-9032");
  assert.ok(result.detections.length >= 2, "expected more than one detection");
  assert.ok(!result.detectedPatternTypes.includes("natural"));
  includesAll(result, ["double"]);
});

test("estimated value and masked outputs are deterministic and privacy-safe", () => {
  const first = analyzePhoneNumber("010-8282-8282");
  const second = analyzePhoneNumber("010-8282-8282");

  assert.equal(first.estimatedValue, second.estimatedValue);
  assert.equal(first.score, second.score);
  assert.equal(first.estimatedValueLabel, second.estimatedValueLabel);
  assert.equal(maskPhoneNumber("010-1234-5678", "result"), "010-12••-5678");
  assert.equal(maskPhoneNumber("010-1234-5678", "share"), "010-••••-••78");
  assert.equal(maskPhoneNumber("not-a-number"), "010-••••-••••");
});

test("percentile and score describe the same rank", () => {
  for (const number of ["010-7777-7777", "010-1234-5678", "010-5831-7264", "010-1122-3344"]) {
    const result = analyzePhoneNumber(number);
    assert.ok(
      Math.abs(result.score + result.percentile - 100) <= 1,
      `${number}: score ${result.score} + percentile ${result.percentile} should be ~100`
    );
  }
});

test("estimated value stays inside its grade band", () => {
  const bands = {
    NORMAL: [1000, 30000],
    SILVER: [30000, 150000],
    GOLD: [150000, 800000],
    PLATINUM: [800000, 5000000],
    DIAMOND: [5000000, 30000000],
    LEGEND: [30000000, 90000000]
  };

  for (const number of ["010-7777-7777", "010-1234-5678", "010-1122-3344", "010-5831-7264", "010-8282-8282"]) {
    const result = analyzePhoneNumber(number);
    const [min, max] = bands[result.grade];
    assert.ok(
      result.estimatedValue >= min && result.estimatedValue <= max,
      `${number}: ${result.estimatedValue} outside ${result.grade} band ${min}-${max}`
    );
  }
});
