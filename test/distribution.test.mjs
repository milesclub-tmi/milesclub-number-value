import assert from "node:assert/strict";
import test from "node:test";

import { analyzePhoneNumber, computePatternScore } from "../src/number-value.js";
import { CALIBRATION_META, SCORE_CDF } from "../src/score-calibration.js";

const SAMPLE_SIZE = 120000;

const TARGET_SHARES = {
  NORMAL: 0.45,
  SILVER: 0.27,
  GOLD: 0.17,
  PLATINUM: 0.09,
  DIAMOND: 0.018,
  LEGEND: 0.002
};

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sample(size, seed) {
  const random = makeRandom(seed);
  const results = [];

  for (let index = 0; index < size; index += 1) {
    results.push(analyzePhoneNumber(`010${String(Math.floor(random() * 1e8)).padStart(8, "0")}`));
  }

  return results;
}

test("calibration table is well formed and generated from a full sweep", () => {
  assert.equal(SCORE_CDF.length, 101);
  assert.equal(CALIBRATION_META.method, "exhaustive");
  assert.equal(CALIBRATION_META.sampleSize, 100_000_000);
  assert.equal(SCORE_CDF.at(-1), 1);

  for (let index = 1; index < SCORE_CDF.length; index += 1) {
    assert.ok(SCORE_CDF[index] >= SCORE_CDF[index - 1], `CDF must be non-decreasing at ${index}`);
  }
});

test("calibration table still matches the current scorer", () => {
  const random = makeRandom(20260812);
  const counts = new Array(101).fill(0);
  const size = 60000;

  for (let index = 0; index < size; index += 1) {
    counts[computePatternScore(String(Math.floor(random() * 1e8)).padStart(8, "0"))] += 1;
  }

  let cumulative = 0;
  for (let score = 0; score < counts.length; score += 1) {
    cumulative += counts[score];
    const observed = cumulative / size;
    assert.ok(
      Math.abs(observed - SCORE_CDF[score]) < 0.012,
      `score ${score}: sampled CDF ${observed.toFixed(4)} drifted from table ${SCORE_CDF[score].toFixed(4)}. ` +
        "Run `npm run calibrate` after changing the scorer."
    );
  }
});

test("grade distribution matches the intended shares", () => {
  const results = sample(SAMPLE_SIZE, 987654321);
  const counts = {};
  for (const result of results) counts[result.grade] = (counts[result.grade] ?? 0) + 1;

  for (const [grade, target] of Object.entries(TARGET_SHARES)) {
    const observed = (counts[grade] ?? 0) / SAMPLE_SIZE;
    const tolerance = Math.max(0.008, target * 0.25);
    assert.ok(
      Math.abs(observed - target) <= tolerance,
      `${grade}: expected ~${(target * 100).toFixed(1)}%, got ${(observed * 100).toFixed(2)}%`
    );
  }
});

test("displayed score spreads across the whole 0-100 range", () => {
  const scores = sample(SAMPLE_SIZE, 13572468)
    .map((result) => result.score)
    .sort((a, b) => a - b);

  const quantile = (position) => scores[Math.floor(scores.length * position)];

  assert.ok(Math.abs(quantile(0.5) - 50) <= 4, `median score should sit near 50; got ${quantile(0.5)}`);
  assert.ok(Math.abs(quantile(0.1) - 10) <= 5, `p10 score should sit near 10; got ${quantile(0.1)}`);
  assert.ok(Math.abs(quantile(0.9) - 90) <= 5, `p90 score should sit near 90; got ${quantile(0.9)}`);

  const distinct = new Set(scores).size;
  assert.ok(distinct >= 95, `expected a near-continuous score range; got ${distinct} distinct values`);
});

test("rank never decreases as the pattern score rises", () => {
  const results = sample(20000, 4242);
  const bestByScore = new Map();
  const worstByScore = new Map();

  for (const result of results) {
    const { patternScore, trace } = result;
    bestByScore.set(patternScore, Math.max(bestByScore.get(patternScore) ?? 0, trace.rank));
    worstByScore.set(patternScore, Math.min(worstByScore.get(patternScore) ?? 1, trace.rank));
  }

  const patternScores = [...bestByScore.keys()].sort((a, b) => a - b);
  for (let index = 1; index < patternScores.length; index += 1) {
    const previousMax = bestByScore.get(patternScores[index - 1]);
    const currentMin = worstByScore.get(patternScores[index]);
    assert.ok(
      currentMin >= previousMax - 1e-9,
      `pattern score ${patternScores[index]} ranked below ${patternScores[index - 1]}`
    );
  }
});

test("a stronger pattern is never worth less money", () => {
  const highest = new Map();
  const lowest = new Map();

  for (const { patternScore, estimatedValue } of sample(30000, 31415)) {
    highest.set(patternScore, Math.max(highest.get(patternScore) ?? 0, estimatedValue));
    lowest.set(patternScore, Math.min(lowest.get(patternScore) ?? Infinity, estimatedValue));
  }

  const patternScores = [...highest.keys()].sort((a, b) => a - b);
  for (let index = 1; index < patternScores.length; index += 1) {
    const weaker = patternScores[index - 1];
    const stronger = patternScores[index];
    assert.ok(
      lowest.get(stronger) >= highest.get(weaker),
      `raw ${stronger} bottoms out at ${lowest.get(stronger)}, below raw ${weaker}'s top of ${highest.get(weaker)}`
    );
  }
});

test("the top grade does not collapse into a single headline number", () => {
  const numbers = ["010-7777-7777", "010-8282-8282", "010-1234-4321", "010-1234-1234", "010-1122-3344"];
  const results = numbers.map((number) => analyzePhoneNumber(number));

  for (const result of results) {
    assert.equal(result.grade, "LEGEND", `${result.normalized} should be LEGEND`);
  }

  const values = results.map((result) => result.estimatedValue);
  assert.ok(
    Math.max(...values) / Math.min(...values) >= 1.5,
    `LEGEND values are compressed into one number: ${values.join(", ")}`
  );
  assert.ok(
    analyzePhoneNumber("010-7777-7777").estimatedValue > analyzePhoneNumber("010-1122-3344").estimatedValue,
    "eight sevens must outrank a plain pair chain"
  );
});

test("the median number is worth more than a rounding error", () => {
  const values = sample(SAMPLE_SIZE, 555)
    .map((result) => result.estimatedValue)
    .sort((a, b) => a - b);

  const median = values[Math.floor(values.length / 2)];
  assert.ok(median >= 5000, `median value should feel like a real number; got ${median}`);
  assert.ok(median <= 60000, `median value should stay believable; got ${median}`);
});
