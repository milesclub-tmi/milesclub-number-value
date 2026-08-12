/*
 * 실제 Chrome을 띄워 화면을 조작하는 스모크 테스트.
 * 의존성을 늘리지 않으려고 정적 서버(node:http)와 DevTools Protocol 드라이버를 직접 붙였다.
 * Chrome이 없는 환경에서는 전체를 건너뛴다.
 */
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { readFile, access, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
];

async function findChrome() {
  for (const path of [process.env.CHROME_PATH, ...CHROME_CANDIDATES].filter(Boolean)) {
    try {
      await access(path);
      return path;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

function startServer() {
  const server = http.createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const file = join(ROOT, path === "/" ? "index.html" : path.replace(/^\/+/, ""));

    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const problems = [];
  const analytics = [];
  let nextId = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      problems.push(details.exception?.description ?? details.text);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP 연결 실패")), { once: true });
  });

  return { socket, send, evaluate, ready, problems, analytics };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = await findChrome();

test("브라우저 스모크", { skip: chrome ? false : "Chrome을 찾지 못해 건너뜁니다 (CHROME_PATH로 지정 가능)" }, async (t) => {
  const { server, port } = await startServer();
  const origin = `http://127.0.0.1:${port}`;
  // 실행마다 새 프로파일을 쓴다. 고정 경로를 쓰면 이전 Chrome이 살아 있을 때 잠겨서 기동에 실패한다.
  const profile = await mkdtemp(join(tmpdir(), "miles-club-e2e-"));

  const browser = spawn(chrome, [
    "--headless=new",
    "--remote-debugging-port=0",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "about:blank"
  ]);

  // Chrome이 stderr로 알려주는 실제 디버깅 포트를 받아 쓴다.
  const debugPort = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome 기동 시간 초과")), 30000);
    browser.stderr.on("data", (chunk) => {
      const match = /ws:\/\/127\.0\.0\.1:(\d+)\//.exec(String(chunk));
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    browser.on("error", reject);
    browser.on("exit", (code) => reject(new Error(`Chrome이 기동 중 종료됐습니다 (code ${code})`)));
  });

  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  const page = targets.find((target) => target.type === "page");
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;

  t.after(async () => {
    cdp.socket.close();

    // Chrome이 완전히 죽은 뒤에 지워야 한다. 살아 있는 동안은 프로파일에 계속 쓰고 있다.
    const exited = new Promise((resolve) => browser.once("exit", resolve));
    browser.kill();
    await Promise.race([exited, wait(5000)]);

    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {
      // 임시 디렉터리 정리 실패로 테스트를 떨어뜨리지 않는다.
    });
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 932,
    deviceScaleFactor: 1,
    mobile: true
  });

  const open = async (path = "/") => {
    await cdp.send("Page.navigate", { url: origin + path });
    await wait(700);
    await cdp.evaluate(`
      window.__events = [];
      window.addEventListener("miles_analytics", (e) => window.__events.push(e.detail));
      window.__nav = [];
      window.addEventListener("miles_navigate", (e) => window.__nav.push(e.detail));
      true;
    `);
  };

  const submit = (first, second) =>
    cdp.evaluate(`
      (() => {
        const a = document.querySelector("[data-first]");
        const b = document.querySelector("[data-second]");
        a.value = ${JSON.stringify(first)};
        a.dispatchEvent(new Event("input", { bubbles: true }));
        b.value = ${JSON.stringify(second)};
        b.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("[data-number-form]").requestSubmit();
        return true;
      })()
    `);

  await t.test("입력 → 분석 → 결과가 렌더된다", async () => {
    await open();
    assert.equal(await cdp.evaluate('document.querySelector("[data-app]").dataset.state'), "input");

    await submit("8282", "8282");
    await wait(400);
    assert.equal(await cdp.evaluate('document.querySelector("[data-app]").dataset.state'), "analysis");

    await wait(2600);
    assert.equal(await cdp.evaluate('document.querySelector("[data-app]").dataset.state'), "result");
    assert.equal(await cdp.evaluate('document.querySelector("[data-grade]").textContent'), "LEGEND");
    assert.match(await cdp.evaluate('document.querySelector("[data-value]").textContent'), /^[\d,]+원$/);
    assert.ok(await cdp.evaluate('document.querySelectorAll("[data-patterns] .chip").length > 0'));
    assert.equal(await cdp.evaluate('document.querySelectorAll(".stat").length'), 4);
  });

  await t.test("결과가 과하게 길지 않고 가로로 넘치지 않는다", async () => {
    const height = await cdp.evaluate('Math.round(document.querySelector(".app").getBoundingClientRect().height)');
    assert.ok(height <= 1250, `결과 화면이 너무 깁니다: ${height}px (뷰포트 932)`);
    assert.equal(await cdp.evaluate("document.documentElement.scrollWidth > 430"), false);
    assert.equal(
      await cdp.evaluate(
        'Math.round(document.querySelector("[data-value]").getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector("[data-value]")).lineHeight))'
      ),
      1
    );
  });

  await t.test("자산 환산 섹션이 렌더된다", async () => {
    const rows = await cdp.evaluate('document.querySelectorAll(".asset").length');
    assert.ok(rows >= 3, `환산 행이 부족합니다: ${rows}`);

    const values = await cdp.evaluate('[...document.querySelectorAll(".asset__value")].map(el => el.textContent)');
    assert.ok(values.every((text) => /\d/.test(text)), "수량이 비어 있는 행이 있습니다");
    assert.ok(!values.some((text) => /^0[가-힣]/.test(text)), "0으로 뭉개진 행이 있습니다");
    const label = await cdp.evaluate('document.querySelector("[data-asset-asof]").textContent');
    assert.match(label, /^(실시간 |기준 \d{4}\.\d{2}\.\d{2})/, `시세 라벨이 이상합니다: ${label}`);
  });

  await t.test("시세 서버가 죽어도 스냅샷으로 버틴다", async () => {
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", {
      urls: ["*open.er-api.com*", "*api.upbit.com*", "*api.coingecko.com*"]
    });

    // 시세 fetch는 페이지 로드 시점에 돈다. 캐시를 비운 뒤 새로 열어야 차단 효과가 나타난다.
    await cdp.evaluate("sessionStorage.clear()");
    await open();
    await submit("8282", "8282");
    await wait(3400);

    const label = await cdp.evaluate('document.querySelector("[data-asset-asof]").textContent');
    assert.match(label, /기준 \d{4}\.\d{2}\.\d{2}/, "실시간이 막히면 기준일로 떨어져야 합니다");

    const values = await cdp.evaluate('[...document.querySelectorAll(".asset__value")].map(el => el.textContent)');
    assert.equal(values.length, 5, "시세가 없어도 모든 행이 보여야 합니다");
    assert.ok(values.every((text) => /\d/.test(text)));

    await cdp.send("Network.setBlockedURLs", { urls: [] });
  });

  await t.test("아이콘이 전부 그려진다", async () => {
    const empty = await cdp.evaluate('[...document.querySelectorAll("[data-icon]")].filter(el => !el.querySelector("svg")).length');
    assert.equal(empty, 0, "채워지지 않은 data-icon 자리가 있습니다");
    assert.ok(await cdp.evaluate('document.querySelectorAll(".chip .icon").length > 0'));
  });

  await t.test("하단 CTA 바가 고정되고 맨 아래까지 내리면 아무것도 가리지 않는다", async () => {
    await cdp.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
    await wait(300);

    const bar = JSON.parse(
      await cdp.evaluate(`(() => {
        const el = document.querySelector("[data-actions]");
        const rect = el.getBoundingClientRect();
        const plan = document.querySelector(".plan").getBoundingClientRect();
        return JSON.stringify({
          position: getComputedStyle(el).position,
          bottom: Math.round(rect.bottom),
          coversPlan: plan.bottom > rect.top
        });
      })()`)
    );
    assert.equal(bar.position, "fixed");
    assert.equal(bar.bottom, 932);
    assert.equal(bar.coversPlan, false);
  });

  await t.test("잘못된 입력은 화면에 보이는 에러를 남긴다", async () => {
    await open();
    await submit("12", "");
    await wait(200);

    assert.equal(await cdp.evaluate('document.querySelector("[data-app]").dataset.state'), "input");
    assert.ok(
      await cdp.evaluate(
        'document.querySelector("[data-error]").offsetParent !== null && document.querySelector("[data-error]").textContent.length > 0'
      ),
      "에러 문구가 실제로 보여야 합니다"
    );
    const events = await cdp.evaluate("window.__events.map(e => e.event)");
    assert.ok(events.includes("number_value_input_error"));
  });

  await t.test("다시하기가 입력 화면으로 되돌린다", async () => {
    await open();
    await submit("5831", "7264");
    await wait(2600);
    await cdp.evaluate('document.querySelector("[data-retry]").click()');
    await wait(300);

    assert.equal(await cdp.evaluate('document.querySelector("[data-app]").dataset.state'), "input");
    assert.equal(await cdp.evaluate('document.querySelector("[data-first]").value'), "");
    assert.ok(await cdp.evaluate('getComputedStyle(document.querySelector(".intro")).display !== "none"'));
    assert.equal(await cdp.evaluate('document.querySelector("[data-actions]").getBoundingClientRect().height > 0'), false);
  });

  await t.test("공유하면 OG 라우트를 가리키는 링크 하나만 나간다", async () => {
    await open();
    await submit("8282", "8282");
    await wait(2600);

    // Web Share를 가로채 실제로 어떤 페이로드가 나가는지 본다.
    const payload = JSON.parse(
      await cdp.evaluate(`(async () => {
        let captured = null;
        navigator.share = (data) => { captured = data; return Promise.resolve(); };
        document.querySelector("[data-share]").click();
        await new Promise(r => setTimeout(r, 300));
        return JSON.stringify(captured);
      })()`)
    );

    assert.ok(payload, "공유가 호출되지 않았습니다");
    assert.deepEqual(Object.keys(payload).sort(), ["text", "title", "url"], "파일이 함께 실리면 URL이 떨어집니다");

    const shared = new URL(payload.url);
    assert.match(shared.pathname, /\/s$/, "공유 링크는 OG 라우트를 가리켜야 합니다");
    assert.deepEqual([...shared.searchParams.keys()].sort(), ["g", "t", "v"]);
    assert.equal(shared.searchParams.get("g"), "LEGEND");
    assert.ok(!payload.url.includes("8282"), "공유 링크에 번호 흔적이 있습니다");
  });

  await t.test("요금제 성향 테스트 CTA가 올바른 링크를 건다", async () => {
    const link = JSON.parse(
      await cdp.evaluate(`(() => {
        const el = document.querySelector("[data-plan-cta]");
        const url = new URL(el.href);
        return JSON.stringify({
          tag: el.tagName,
          origin: url.origin,
          path: url.pathname,
          utmSource: url.searchParams.get("utm_source"),
          utmMedium: url.searchParams.get("utm_medium"),
          label: el.textContent.replace(/\\s+/g, " ").trim()
        });
      })()`)
    );

    assert.equal(link.tag, "A", "실제 링크여야 새 탭 열기·길게 누르기가 동작합니다");
    assert.equal(link.origin, "https://milesclub.co.kr");
    assert.equal(link.path, "/apps/plan-type-test");
    assert.equal(link.utmSource, "miniapp");
    assert.equal(link.utmMedium, "number_value");
    assert.ok(link.label.length > 0, "CTA 문구가 비어 있습니다");
  });

  await t.test("호스트 앱이 CTA 이동을 가로챌 수 있다", async () => {
    const before = await cdp.evaluate("location.href");

    // 호스트가 preventDefault를 걸면 기본 이동이 막혀야 한다.
    await cdp.evaluate('window.addEventListener("miles_navigate", (e) => e.preventDefault(), { once: true })');
    await cdp.evaluate('document.querySelector("[data-plan-cta]").click()');
    await wait(300);

    assert.deepEqual(await cdp.evaluate("window.__nav.at(-1)"), {
      target: "plan_type_test",
      url: "https://milesclub.co.kr/apps/plan-type-test?utm_source=miniapp&utm_medium=number_value"
    });
    assert.equal(await cdp.evaluate("location.href"), before, "가로챘는데도 이동했습니다");

    const events = await cdp.evaluate("window.__events.map(e => e.event)");
    assert.ok(events.includes("number_value_plan_cta_click"));
  });

  await t.test("분석 이벤트에 전화번호가 실리지 않는다", async () => {
    const dump = await cdp.evaluate("JSON.stringify(window.__events)");
    assert.ok(!dump.includes("8282"), "이벤트에 번호 흔적이 있습니다");
    assert.ok(!dump.includes("01082828282"));

    const url = await cdp.evaluate("(() => document.querySelector('[data-share]') && window.location.origin)()");
    assert.ok(url, "페이지가 살아 있어야 합니다");
  });

  await t.test("공유로 들어오면 친구의 등급과 금액이 안내된다", async () => {
    await open("/?from=share&g=LEGEND&v=32470000&t=legend");
    assert.equal(await cdp.evaluate('document.querySelector("[data-invite]").hidden'), false);

    const invite = await cdp.evaluate('document.querySelector("[data-invite]").textContent');
    assert.match(invite, /LEGEND/);
    assert.match(invite, /32,470,000원/, "금액까지 보여야 훅이 삽니다");

    // 금액이 빠진 링크도 등급만으로 말이 돼야 한다.
    await open("/?from=share&g=GOLD");
    assert.match(await cdp.evaluate('document.querySelector("[data-invite]").textContent'), /GOLD/);

    await open("/?from=share&g=%3Cscript%3E");
    assert.equal(await cdp.evaluate('document.querySelector("[data-invite]").hidden'), true, "알 수 없는 등급은 무시해야 합니다");

    // 조작된 금액은 등급만 남기고 버린다.
    await open("/?from=share&g=NORMAL&v=999999999999");
    assert.equal(await cdp.evaluate('document.querySelector("[data-invite]").textContent'), "친구는 NORMAL 번호였어요. 내 번호는?");
  });

  await t.test("전 과정에서 콘솔 예외가 없다", () => {
    assert.deepEqual(cdp.problems, []);
  });
});
