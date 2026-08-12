/*
 * 결과별 OG 이미지(1200×630 PNG)를 요청 시점에 그린다.
 *
 * 크롤러는 JS를 실행하지 않아 앱 화면을 캡처할 방법이 없다. 그래서 공유 링크가 실어 온
 * 등급·금액·타입만으로 카드를 서버에서 새로 그린다. 색·아이콘·문구는 화면과 같은 정의를
 * share-card.js / icons.js에서 가져오므로 한쪽만 바뀌는 일이 없다.
 *
 * 파라미터가 없으면(앱 주소를 그냥 붙여넣은 경우) 기본 카드가 나온다.
 */
import { ImageResponse } from "@vercel/og";

import { iconDataUri } from "../src/icons.js";
import { DISCLAIMER, parseShareParams, shareCopy } from "../src/share-card.js";

export const config = { runtime: "edge" };

const WIDTH = 1200;
const HEIGHT = 630;

// 화면과 같은 서체다. index.html이 pin해 둔 커밋과 같은 것을 쓴다 — 폰트를 갱신할 때 함께 바꿀 것.
const FONT_BASE = "https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound@a36996c";

// styles.css의 :root 토큰과 같은 값.
const INK = "#17181c";
const INK_2 = "#454c56";
const INK_3 = "#697079";
const LINE = "#ebedf0";
const BG = "#f2f3f6";
const SURFACE = "#ffffff";
const ACCENT = "#eeff00";

// DIAMOND·LEGEND는 화면과 마찬가지로 카드를 먹색으로 뒤집는다.
const RARE_PALETTE = {
  card: INK,
  title: "rgba(255, 255, 255, 0.72)",
  value: ACCENT,
  muted: "rgba(255, 255, 255, 0.46)",
  line: "rgba(255, 255, 255, 0.16)",
  emblem: "#ffffff",
  pillText: INK
};

const BASE_PALETTE = {
  card: SURFACE,
  title: INK_2,
  value: INK,
  muted: INK_3,
  line: LINE,
  emblem: INK,
  pillText: INK
};

// 폰트는 콜드 스타트마다 한 번만 받는다. 실패하면 다음 요청이 다시 시도하도록 캐시를 비운다.
let fontsPromise = null;

function loadFonts() {
  fontsPromise ??= Promise.all([
    fetch(`${FONT_BASE}/NanumSquareRoundB.otf`).then(readFont),
    fetch(`${FONT_BASE}/NanumSquareRoundEB.otf`).then(readFont)
  ])
    .then(([bold, extraBold]) => [
      { name: "NanumSquareRound", data: bold, weight: 700, style: "normal" },
      { name: "NanumSquareRound", data: extraBold, weight: 800, style: "normal" }
    ])
    .catch((error) => {
      fontsPromise = null;
      throw error;
    });

  return fontsPromise;
}

async function readFont(response) {
  if (!response.ok) throw new Error(`폰트를 받지 못했습니다: ${response.status}`);
  return response.arrayBuffer();
}

// satori는 React 엘리먼트 모양의 객체를 그대로 받는다. JSX 빌드 단계를 넣지 않으려고 직접 만든다.
function h(type, style, ...children) {
  return { type, props: { style, children: children.length > 1 ? children : children[0] } };
}

// 아이콘은 src/icons.js의 도형 정의를 SVG data URI로 바꿔 넣는다. 화면과 같은 그림이 나온다.
function icon(name, size, color, strokeWidth = 2) {
  return {
    type: "img",
    props: { width: size, height: size, src: iconDataUri(name, { color, strokeWidth, size }) }
  };
}

// 금액 자릿수에 반비례해 줄인다. 텍스트 단은 760px이고 가장 긴 "90,000,000원"까지 한 줄에 들어간다.
function headlineSize(text) {
  if (text.length <= 8) return 112;
  if (text.length <= 11) return 96;
  return 82;
}

function card(copy) {
  const palette = copy.tier === "rare" ? RARE_PALETTE : BASE_PALETTE;

  return h(
    "div",
    {
      display: "flex",
      width: "100%",
      height: "100%",
      padding: 48,
      background: BG,
      fontFamily: "NanumSquareRound"
    },
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        padding: "52px 60px",
        borderRadius: 40,
        background: palette.card
      },

      // 텍스트 단과 엠블럼 단을 갈라 둔다. 금액이 아무리 길어도 엠블럼을 침범할 수 없다.
      h(
        "div",
        { display: "flex", flex: 1, alignItems: "center", gap: 40 },
        h(
          "div",
          { display: "flex", flexDirection: "column", justifyContent: "space-between", width: 760, height: "100%" },

          h(
            "div",
            { display: "flex", alignItems: "center", gap: 14 },
            h("div", { display: "flex", width: 18, height: 18, borderRadius: 9, background: ACCENT }),
            h("div", { display: "flex", fontSize: 28, fontWeight: 700, color: palette.muted }, "MILES CLUB")
          ),

          h(
            "div",
            { display: "flex", flexDirection: "column", gap: 12 },
            h(
              "div",
              { display: "flex", alignItems: "center", gap: 14 },
              icon(copy.typeIcon, 40, palette.title, 2.2),
              h(
                "div",
                { display: "flex", fontSize: 38, fontWeight: 700, color: palette.title },
                copy.typeTitle ?? "MILES CLUB 미니앱"
              )
            ),
            h(
              "div",
              {
                display: "flex",
                fontSize: headlineSize(copy.headline),
                fontWeight: 800,
                color: palette.value,
                lineHeight: 1.15
              },
              copy.headline
            ),
            h(
              "div",
              { display: "flex", alignItems: "center", gap: 18, marginTop: 4 },
              ...(copy.gradePill
                ? [
                    h(
                      "div",
                      {
                        display: "flex",
                        padding: "8px 22px",
                        borderRadius: 14,
                        background: ACCENT,
                        fontSize: 32,
                        fontWeight: 800,
                        color: palette.pillText
                      },
                      copy.gradePill
                    )
                  ]
                : []),
              h("div", { display: "flex", fontSize: 30, fontWeight: 700, color: palette.title }, copy.cta)
            )
          )
        ),

        h(
          "div",
          {
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            opacity: copy.tier === "rare" ? 0.32 : 0.16
          },
          icon(copy.gradeIcon, 240, palette.emblem, 1.6)
        )
      ),

      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 16, marginTop: 28 },
        h("div", { display: "flex", width: "100%", height: 2, background: palette.line }),
        h("div", { display: "flex", fontSize: 24, fontWeight: 700, color: palette.muted }, DISCLAIMER)
      )
    )
  );
}

export default async function handler(request) {
  const share = parseShareParams(new URL(request.url).searchParams);

  // 파라미터가 없거나 손댄 링크면 등급 배지 없는 기본 카드로 떨어진다.
  const copy = share
    ? { ...shareCopy(share), gradePill: share.grade, cta: "너 번호는 얼마?" }
    : {
        tier: "base",
        gradePill: null,
        gradeIcon: "sparkle",
        typeIcon: "search",
        typeTitle: null,
        headline: "내 번호, 얼마일까?",
        cta: "휴대폰 뒤 8자리만 넣으면 끝나요"
      };

  try {
    return new ImageResponse(card(copy), {
      width: WIDTH,
      height: HEIGHT,
      fonts: await loadFonts(),
      headers: {
        // 같은 결과는 계속 같은 그림이다. 카카오·페북이 오래 물고 있어도 문제없다.
        "cache-control": "public, immutable, max-age=31536000"
      }
    });
  } catch (error) {
    return new Response(`OG 이미지를 만들지 못했습니다: ${error.message}`, { status: 500 });
  }
}
