/*
 * 공유 링크(/s?g=..&v=..&t=..)가 도착하는 곳.
 *
 * 크롤러는 JS를 실행하지 않으므로 앱 URL을 그대로 공유하면 미리보기가 비어 버린다.
 * 이 라우트는 결과별 OG 태그만 박힌 얇은 HTML을 돌려주고, 사람이 열면 즉시 앱으로 넘긴다.
 *   - 크롤러 → <meta property="og:*"> 를 읽고 카드로 펼친다
 *   - 사람   → location.replace 로 앱 화면으로 이동 (JS가 막혀 있으면 meta refresh, 그것도 막히면 링크)
 */
import { parseShareParams, shareCopy } from "../src/share-card.js";

export const config = { runtime: "edge" };

const FALLBACK_COPY = {
  ogTitle: "내 번호, 얼마일까?",
  ogDescription: "휴대폰 뒤 8자리로 보는 내 번호의 값어치. 재미로 보는 결과예요."
};

export default function handler(request) {
  const requestUrl = new URL(request.url);
  const share = parseShareParams(requestUrl.searchParams);
  const copy = share ? shareCopy(share) : FALLBACK_COPY;

  // 검증을 통과한 값만 다시 싣는다. 손댄 파라미터가 앱이나 이미지로 흘러가지 않는다.
  const params = new URLSearchParams();
  if (share) {
    params.set("g", share.grade);
    if (share.value) params.set("v", String(share.value));
    if (share.typeKey) params.set("t", share.typeKey);
  }

  const imageUrl = new URL("/api/og", requestUrl.origin);
  imageUrl.search = params.toString();

  const appUrl = new URL("/", requestUrl.origin);
  appUrl.search = new URLSearchParams([["from", "share"], ...params]).toString();

  // og:url은 요청 URL을 되비추지 않는다. 손댄 파라미터가 그대로 메타태그에 남지 않도록
  // 검증을 통과한 값만으로 정규 주소를 다시 만든다.
  const canonicalUrl = new URL(requestUrl.pathname, requestUrl.origin);
  canonicalUrl.search = params.toString();

  const html = renderHtml({
    copy,
    imageUrl: imageUrl.toString(),
    appUrl: appUrl.toString(),
    canonical: canonicalUrl.toString()
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // 같은 파라미터면 항상 같은 결과다. 크롤러가 다시 긁어도 부담이 없다.
      "cache-control": "public, max-age=3600"
    }
  });
}

function renderHtml({ copy, imageUrl, appUrl, canonical }) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.ogTitle)}</title>
    <meta name="description" content="${escapeHtml(copy.ogDescription)}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="MILES CLUB" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(copy.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(copy.ogDescription)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(copy.ogTitle)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(copy.ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(copy.ogDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

    <meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}" />
    <script>location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <a href="${escapeHtml(appUrl)}">내 번호 가치 보러 가기</a>
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}
