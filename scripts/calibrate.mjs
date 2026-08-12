import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { computePatternScore } from "../src/number-value.js";

const TOTAL = 100_000_000;
const BUCKETS = 101;
const OUTPUT = new URL("../src/score-calibration.js", import.meta.url);

function tallyRange(start, end) {
  const counts = new Uint32Array(BUCKETS);

  for (let value = start; value < end; value += 1) {
    counts[computePatternScore(String(value).padStart(8, "0"))] += 1;
  }

  return counts;
}

if (!isMainThread) {
  parentPort.postMessage(tallyRange(workerData.start, workerData.end));
} else {
  const workerCount = Math.max(1, Math.min(cpus().length - 1, 16));
  const chunk = Math.ceil(TOTAL / workerCount);
  const self = fileURLToPath(import.meta.url);
  const startedAt = Date.now();

  console.log(`전수 계산 시작: ${TOTAL.toLocaleString()}개 번호, 워커 ${workerCount}개`);

  const totals = await Promise.all(
    Array.from({ length: workerCount }, (_, index) => {
      const start = index * chunk;
      const end = Math.min(TOTAL, start + chunk);

      return new Promise((resolve, reject) => {
        const worker = new Worker(self, { workerData: { start, end } });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`worker ${index} exited with ${code}`));
        });
      });
    })
  );

  const counts = new Float64Array(BUCKETS);
  for (const partial of totals) {
    for (let index = 0; index < BUCKETS; index += 1) counts[index] += partial[index];
  }

  const observed = counts.reduce((sum, count) => sum + count, 0);
  if (observed !== TOTAL) throw new Error(`집계 누락: ${observed} !== ${TOTAL}`);

  const cdf = [];
  let cumulative = 0;
  for (let index = 0; index < BUCKETS; index += 1) {
    cumulative += counts[index];
    cdf.push(index === BUCKETS - 1 ? 1 : Number((cumulative / TOTAL).toFixed(9)));
  }

  const body = `// 이 파일은 \`npm run calibrate\`로 생성됩니다. 직접 수정하지 마세요.
// SCORE_CDF[i] = 패턴 점수가 i 이하인 010 번호의 비율(0~1).
// 010-0000-0000 ~ 010-9999-9999 전체 ${TOTAL.toLocaleString("ko-KR")}개를 전수 계산한 결과입니다.

export const CALIBRATION_META = Object.freeze({
  method: "exhaustive",
  sampleSize: ${TOTAL}
});

export const SCORE_CDF = Object.freeze([
${cdf.map((value) => `  ${value}`).join(",\n")}
]);
`;

  await writeFile(OUTPUT, body, "utf8");

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`완료 (${elapsed}s) → ${fileURLToPath(OUTPUT)}`);
  console.log("점수 구간별 비율 상위 12개:");
  [...counts]
    .map((count, score) => ({ score, share: count / TOTAL }))
    .filter((row) => row.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 12)
    .forEach((row) => console.log(`  ${String(row.score).padStart(3)}점: ${(row.share * 100).toFixed(4)}%`));
}
