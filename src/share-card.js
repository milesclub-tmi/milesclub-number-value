/*
 * 공유 카드의 공용 정의.
 *
 * 브라우저(app.js)와 엣지 OG 생성기(api/og.js, api/share.js)가 이 파일을 함께 import해서
 * 등급 연출·문구·공유 파라미터를 한 곳에서만 정의한다. 한쪽만 바뀌는 일이 없도록 하기 위함이다.
 * DOM·네트워크를 쓰지 않는 순수 모듈이라 엣지 런타임에서도 그대로 돈다.
 */
import { TYPE_RULES, formatKRW } from "./number-value.js";

/*
 * 공유 링크가 가리키는 경로. 크롤러는 JS를 실행하지 않으므로 앱 URL을 그대로 보내면
 * 미리보기가 비어 버린다. OG 태그를 서버에서 찍어주는 /s 라우트로 보낸다.
 */
export const SHARE_PATH = "s";

/*
 * 공유 링크의 절대 origin. 비워 두면 현재 페이지 기준 상대 경로가 된다.
 * 앱을 호스트 웹뷰나 다른 도메인에 임베드해서 /s 라우트가 같은 origin에 없을 때만 채운다.
 */
export const SHARE_BASE = "";

// 공유 URL이 실어 나르는 파라미터. 번호에서 유도되는 값은 절대 여기 들어가지 않는다.
export const SHARE_PARAM_KEYS = Object.freeze(["g", "v", "t"]);

export const GRADE_ICON = Object.freeze({
  NORMAL: "face",
  SILVER: "medal",
  GOLD: "trophy",
  PLATINUM: "shield",
  DIAMOND: "gem",
  LEGEND: "crown"
});

// DIAMOND·LEGEND는 어두운 카드로 뒤집어 "뽑았다"는 느낌을 준다. GOLD부터 반짝임을 켠다.
export const GRADE_TIER = Object.freeze({
  NORMAL: "base",
  SILVER: "base",
  GOLD: "shiny",
  PLATINUM: "shiny",
  DIAMOND: "rare",
  LEGEND: "rare"
});

export const TYPE_ICON = Object.freeze({
  legend: "crown",
  numeric_noble: "hat",
  repeat_king: "repeat",
  mirror_maniac: "mirror",
  sequence_hunter: "target",
  gold_collector: "clover",
  date_keeper: "calendar",
  flawless: "sparkle",
  quiet_power: "sprout",
  citizen: "face"
});

// 엔진 최상단 밴드의 상한. 이보다 큰 v는 조작된 링크로 보고 버린다.
const MAX_SHARE_VALUE = 90000000;

const GRADES = Object.freeze(Object.keys(GRADE_ICON));

export const DISCLAIMER = "재미로 보는 결과예요. 실제 시장 가치가 아니에요.";

export function buildShareParams(result) {
  return { g: result.grade, v: String(result.estimatedValue), t: result.type.key };
}

/*
 * 공유 링크의 쿼리를 검증한다. 남이 손으로 고친 링크가 그대로 카드에 찍히면 안 되므로
 * 등급·타입은 화이트리스트로, 금액은 엔진이 낼 수 있는 범위로 좁힌다.
 * 등급이 성립하지 않으면 공유 맥락 자체를 버린다(null).
 */
export function parseShareParams(params) {
  const grade = params.get("g");
  if (!GRADES.includes(grade)) return null;

  const value = Number(params.get("v"));
  const typeKey = params.get("t");

  return {
    grade,
    value: Number.isInteger(value) && value > 0 && value <= MAX_SHARE_VALUE ? value : null,
    typeKey: Object.hasOwn(TYPE_RULES, typeKey ?? "") ? typeKey : null
  };
}

/*
 * 카드·OG 태그·유입 안내에 쓰는 문구를 한 번에 만든다.
 * 금액이나 타입이 빠진 링크(구버전·손댄 링크)도 등급만으로 말이 되게 떨어진다.
 */
export function shareCopy(share) {
  const amount = share.value ? formatKRW(share.value) : null;
  const typeTitle = share.typeKey ? TYPE_RULES[share.typeKey].title : null;

  return {
    amount,
    typeTitle,
    grade: share.grade,
    tier: GRADE_TIER[share.grade],
    gradeIcon: GRADE_ICON[share.grade],
    typeIcon: share.typeKey ? TYPE_ICON[share.typeKey] : GRADE_ICON[share.grade],
    headline: amount ?? `${share.grade} 번호`,
    ogTitle: amount ? `내 번호는 ${amount}, ${share.grade}래요` : `내 번호는 ${share.grade}래요`,
    ogDescription: `${typeTitle ? `${typeTitle} · ` : ""}${DISCLAIMER} 너 번호는 얼마?`,
    invite: amount
      ? `친구는 ${amount}짜리 ${share.grade} 번호였어요. 내 번호는?`
      : `친구는 ${share.grade} 번호였어요. 내 번호는?`
  };
}
