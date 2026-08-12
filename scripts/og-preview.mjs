/*
 * OG 카드를 로컬에서 PNG로 뽑아 본다.
 *
 * 공유 카드는 배포한 뒤에야 눈으로 볼 수 있는 산출물이라, 디자인을 건드렸으면 여기서 먼저 확인한다.
 * api/og.js를 그대로 호출하므로 실제 카드와 같은 그림이 나온다.
 *
 *   npm run og:preview            기본 4장
 *   npm run og:preview -- LEGEND  등급 하나만
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import handler from "../api/og.js";

const OUTPUT = new URL("../tmp/og/", import.meta.url);

// 등급별 대표값 — 금액 자릿수가 가장 긴 경우와 짧은 경우를 함께 본다.
const SAMPLES = {
  LEGEND: "g=LEGEND&v=90000000&t=legend",
  DIAMOND: "g=DIAMOND&v=8400000&t=numeric_noble",
  GOLD: "g=GOLD&v=470000&t=repeat_king",
  NORMAL: "g=NORMAL&v=8000&t=citizen",
  DEFAULT: ""
};

const wanted = process.argv.slice(2).map((name) => name.toUpperCase());
const targets = Object.entries(SAMPLES).filter(([name]) => wanted.length === 0 || wanted.includes(name));

await mkdir(OUTPUT, { recursive: true });

for (const [name, query] of targets) {
  const response = await handler(new Request(`https://milesclub.local/api/og?${query}`));

  if (!response.ok) {
    console.error(`${name}: ${response.status} ${await response.text()}`);
    continue;
  }

  const file = new URL(`${name.toLowerCase()}.png`, OUTPUT);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  console.log(`${name} → ${fileURLToPath(file)}`);
}
