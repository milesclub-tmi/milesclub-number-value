/*
 * 24×24 그리드에 그린 아이콘 세트. 도형을 원시 형태(path/circle/rect/line)로 두고
 * DOM(SVG)과 공유 이미지(Canvas Path2D)가 같은 정의를 함께 쓴다.
 * 색은 전부 currentColor라 어두운 히어로 카드에서도 자동으로 뒤집힌다.
 *
 *   { p: "M..." }        선으로 그리는 path
 *   { p: "M...", fill }  채우는 path
 *   { c: [cx, cy, r] }   원
 *   { r: [x, y, w, h, radius] }  둥근 사각형
 *   { l: [x1, y1, x2, y2] }      선분
 */
export const ICONS = Object.freeze({
  // 반복 — 도는 화살표
  repeat: [
    { p: "M5 11V9.5A4.5 4.5 0 0 1 9.5 5H17" },
    { p: "M14.5 2.5 17.5 5l-3 2.5" },
    { p: "M19 13v1.5a4.5 4.5 0 0 1-4.5 4.5H7" },
    { p: "M9.5 21.5 6.5 19l3-2.5" }
  ],

  // 페어 — 같은 알약 두 개
  pair: [
    { r: [3, 8, 7.5, 8, 3.75] },
    { r: [13.5, 8, 7.5, 8, 3.75] }
  ],

  // 메아리 — 퍼져 나가는 호
  wave: [
    { c: [6.5, 12, 1.7], fill: true },
    { p: "M11 8.5a5 5 0 0 1 0 7" },
    { p: "M15.5 5.5a10 10 0 0 1 0 13" }
  ],

  // 연속 — 올라가는 꺾은선
  sequence: [
    { p: "M4 16.5 9 11l3.5 3.5L20 7" },
    { p: "M15 7h5v5" }
  ],

  // 등차 — 사다리
  ladder: [
    { l: [7.5, 3, 7.5, 21] },
    { l: [16.5, 3, 16.5, 21] },
    { l: [7.5, 8, 16.5, 8] },
    { l: [7.5, 12, 16.5, 12] },
    { l: [7.5, 16, 16.5, 16] }
  ],

  // 대칭 — 축을 사이에 둔 두 삼각형
  mirror: [
    { l: [12, 3, 12, 21] },
    { p: "M8.5 7 4 12l4.5 5Z", fill: true },
    { p: "M15.5 7 20 12l-4.5 5Z" }
  ],

  // 의미 숫자 — 말풍선
  speech: [
    { r: [3, 4, 18, 12, 4] },
    { p: "M8 16v5l5-5Z", fill: true }
  ],

  // 날짜 — 달력
  calendar: [
    { r: [3, 5, 18, 16, 3.5] },
    { l: [3, 10, 21, 10] },
    { l: [8, 2.5, 8, 7] },
    { l: [16, 2.5, 16, 7] }
  ],

  // 라운드 넘버 — 과녁
  target: [
    { c: [12, 12, 8.5] },
    { c: [12, 12, 4.5] },
    { c: [12, 12, 1.5], fill: true }
  ],

  // 올짝수·올홀수 — 저울
  scales: [
    { l: [12, 4, 12, 20] },
    { l: [6.5, 20.5, 17.5, 20.5] },
    { l: [4, 8, 20, 8] },
    { p: "M4 8 1.6 13.5h4.8Z" },
    { p: "M20 8l-2.4 5.5h4.8Z" }
  ],

  // 무중복·희소 — 반짝임
  sparkle: [
    { p: "M10.5 3 12.2 8.3 17.5 10l-5.3 1.7L10.5 17 8.8 11.7 3.5 10l5.3-1.7Z", fill: true },
    { p: "M18 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9Z", fill: true }
  ],

  // 수미상관 — 사슬
  link: [
    { p: "M10 14a4 4 0 0 1 0-5.7l2-2a4 4 0 0 1 5.7 5.7l-1 1" },
    { p: "M14 10a4 4 0 0 1 0 5.7l-2 2A4 4 0 0 1 6.3 12l1-1" }
  ],

  // 자연 번호 — 잎사귀
  leaf: [
    { p: "M20 4c0 8.8-5.4 14-14 14 0-8.8 5.4-14 14-14Z" },
    { l: [6, 18, 15, 9] }
  ],

  // LEGEND — 왕관 (윤곽을 한 바퀴 돌아 닫아야 대각선 획이 생기지 않는다)
  crown: [
    { p: "M3 8 5 18h14l2-10-4.5 3.5L12 4 7.5 11.5Z" },
    { l: [6, 21, 18, 21] }
  ],

  // 숫자 귀족 — 실크햇
  hat: [
    { p: "M8 12.5V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5v8" },
    { p: "M3.5 13.5c0-1.4 3.8-2.5 8.5-2.5s8.5 1.1 8.5 2.5S16.7 16 12 16s-8.5-1.1-8.5-2.5Z" },
    { l: [8.5, 8.5, 15.5, 8.5] }
  ],

  // 골드 수집가 — 네잎클로버
  clover: [
    { c: [8.6, 8.6, 3.7] },
    { c: [15.4, 8.6, 3.7] },
    { c: [8.6, 15.4, 3.7] },
    { c: [15.4, 15.4, 3.7] }
  ],

  // 은근한 실력자 — 새싹
  sprout: [
    { l: [12, 21, 12, 12] },
    { p: "M12 12C12 8.7 9.3 6 6 6c0 3.3 2.7 6 6 6Z" },
    { p: "M12 12c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6Z" }
  ],

  // NORMAL·평범 — 웃는 얼굴
  face: [
    { c: [12, 12, 9] },
    { c: [9, 10, 1.15], fill: true },
    { c: [15, 10, 1.15], fill: true },
    { p: "M8 14.3a4.7 4.7 0 0 0 8 0" }
  ],

  // SILVER — 메달
  medal: [
    { c: [12, 15, 6] },
    { p: "M9.2 9.6 6 3h12l-3.2 6.6" }
  ],

  // GOLD — 트로피
  trophy: [
    { p: "M7 3.5h10V9a5 5 0 0 1-10 0Z" },
    { p: "M7 5H4.5A2.5 2.5 0 0 0 7 9.5" },
    { p: "M17 5h2.5A2.5 2.5 0 0 1 17 9.5" },
    { l: [12, 14, 12, 17.5] },
    { l: [9.5, 17.5, 14.5, 17.5] },
    { l: [8, 20.5, 16, 20.5] }
  ],

  // PLATINUM — 방패
  shield: [
    { p: "M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6Z" },
    { p: "M9 12.2l2.2 2.2 4.3-4.4" }
  ],

  // DIAMOND·희소성 — 보석
  gem: [
    { p: "M6.5 3h11l3.5 6-9 12L3 9Z" },
    { l: [3, 9, 21, 9] },
    { p: "M9.5 3 8 9l4 12" },
    { p: "M14.5 3 16 9l-4 12" }
  ],

  // 기억력 — 전구
  bulb: [
    { p: "M8.5 16A6.5 6.5 0 1 1 15.5 16" },
    { l: [8.5, 16, 15.5, 16] },
    { l: [9.5, 19, 14.5, 19] },
    { l: [10.5, 22, 13.5, 22] }
  ],

  // 리듬감 — 음표
  music: [
    { p: "M9 18V5l11-2.2V16" },
    { c: [6.4, 18, 2.6] },
    { c: [17.4, 16, 2.6] }
  ],

  // 능력치 — 막대 그래프
  chart: [
    { r: [3.5, 13, 4.5, 7.5, 2] },
    { r: [9.75, 8, 4.5, 12.5, 2] },
    { r: [16, 3.5, 4.5, 17, 2] }
  ],

  // 발견된 패턴 — 돋보기
  search: [
    { c: [10.5, 10.5, 7] },
    { l: [15.6, 15.6, 21, 21] }
  ],

  // 자세히 보기 — 정보
  info: [
    { c: [12, 12, 9] },
    { l: [12, 11, 12, 16.5] },
    { c: [12, 7.8, 1.15], fill: true }
  ],

  // 환산 — 맞바꾸는 화살표
  exchange: [
    { p: "M3.5 8.5H17" },
    { p: "M13.5 5 17 8.5 13.5 12" },
    { p: "M20.5 15.5H7" },
    { p: "M10.5 12 7 15.5 10.5 19" }
  ],

  // 달러
  dollar: [
    { l: [12, 2.5, 12, 21.5] },
    { p: "M16.5 6.5H9.75a3.25 3.25 0 0 0 0 6.5h4.5a3.25 3.25 0 0 1 0 6.5H7" }
  ],

  // 비트코인
  bitcoin: [
    { p: "M6.5 4.5h7a4 4 0 0 1 0 8h-7Z" },
    { p: "M6.5 12.5h8a4 4 0 0 1 0 8h-8Z" },
    { l: [6.5, 4.5, 6.5, 20.5] },
    { l: [10, 1.5, 10, 4.5] },
    { l: [14, 1.5, 14, 4.5] },
    { l: [10, 20.5, 10, 23] },
    { l: [14, 20.5, 14, 23] }
  ],

  // 주식 — 캔들 차트
  stock: [
    { l: [7, 3, 7, 21] },
    { r: [4.5, 7, 5, 9, 1.5] },
    { l: [17, 3, 17, 21] },
    { r: [14.5, 5, 5, 12, 1.5] }
  ],

  // 요금제 성향 테스트 — 체크리스트
  quiz: [
    { r: [4, 4, 16, 17, 3] },
    { p: "M9 3h6v3H9Z" },
    { p: "M8.5 12.2l2 2 4.5-4.5" }
  ],

  // 통신비 — 휴대폰
  phone: [
    { r: [6, 2, 12, 20, 3] },
    { l: [10, 18.5, 14, 18.5] }
  ]
});

const SVG_NS = "http://www.w3.org/2000/svg";

export function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.append(...(ICONS[name] ?? ICONS.sparkle).map(toSvgShape));

  return svg;
}

function toSvgShape(shape) {
  let element;

  if (shape.p) {
    element = document.createElementNS(SVG_NS, "path");
    element.setAttribute("d", shape.p);
  } else if (shape.c) {
    element = document.createElementNS(SVG_NS, "circle");
    element.setAttribute("cx", shape.c[0]);
    element.setAttribute("cy", shape.c[1]);
    element.setAttribute("r", shape.c[2]);
  } else if (shape.r) {
    element = document.createElementNS(SVG_NS, "rect");
    element.setAttribute("x", shape.r[0]);
    element.setAttribute("y", shape.r[1]);
    element.setAttribute("width", shape.r[2]);
    element.setAttribute("height", shape.r[3]);
    element.setAttribute("rx", shape.r[4]);
  } else {
    element = document.createElementNS(SVG_NS, "line");
    element.setAttribute("x1", shape.l[0]);
    element.setAttribute("y1", shape.l[1]);
    element.setAttribute("x2", shape.l[2]);
    element.setAttribute("y2", shape.l[3]);
  }

  element.setAttribute("fill", shape.fill ? "currentColor" : "none");
  if (!shape.fill) element.setAttribute("stroke", "currentColor");

  return element;
}

export function drawIcon(ctx, name, x, y, size, color, strokeWidth = 2) {
  const shapes = ICONS[name] ?? ICONS.sparkle;
  const scale = size / 24;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const shape of shapes) {
    const path = shape.p ? new Path2D(shape.p) : new Path2D();

    if (shape.c) path.arc(shape.c[0], shape.c[1], shape.c[2], 0, Math.PI * 2);
    else if (shape.r) roundRectPath(path, shape.r);
    else if (shape.l) {
      path.moveTo(shape.l[0], shape.l[1]);
      path.lineTo(shape.l[2], shape.l[3]);
    }

    if (shape.fill) ctx.fill(path);
    else ctx.stroke(path);
  }

  ctx.restore();
}

// Path2D.roundRect는 비교적 최근 API라 없을 때를 대비해 직접 그린다.
function roundRectPath(path, [x, y, width, height, radius]) {
  if (typeof path.roundRect === "function") {
    path.roundRect(x, y, width, height, radius);
    return;
  }

  path.moveTo(x + radius, y);
  path.arcTo(x + width, y, x + width, y + height, radius);
  path.arcTo(x + width, y + height, x, y + height, radius);
  path.arcTo(x, y + height, x, y, radius);
  path.arcTo(x, y, x + width, y, radius);
  path.closePath();
}
