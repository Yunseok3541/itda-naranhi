// 성향 점수: 퀘스트 후 설문(만족도·성취감) → 성향 태그별 점수 (고민기록 #32, 명세: docs/API명세.md "성향 점수")
// DB 의존 없는 순수 함수. 조회는 api/preferences/service.ts
//
// 계산
//   시도 점수 = (만족도 + 성취감) ÷ 2, 한쪽만 답했으면 그 값 (1~5)
//   그 점수를 그 별의 tags 전부에 더함 → 태그별 평균(score)·개수(count). 같은 별을 여러 번 설문해도 시도마다 셈
//   top = 평균 3점(중간) 이상인 태그 중 점수 → 개수 → TAGS 순서로 최대 2개
//   설문한 시도가 3개 미만이거나 3점 이상인 태그가 없으면 시작 질문으로 top을 정함 (basis "start_answers")
//
// score는 내부 계산용. 화면에 숫자·순위로 보여 주지 않는다 (숫자로 평가하지 않기, 고민기록 #1)
//
// 추천 규칙 (아직 구현하지 않음. 오늘의 별 추천 AI ①·정책 추천 AI ⑤에서 재사용할 때의 기준)
//   1) 현재 단계 범위(시작 단계 + 바로 위)의 별 중
//   2) focusPriority(lib/profile.ts)에서 앞선 focus의 별을 먼저
//   3) 그 안에서 top 태그(성향 점수가 높은 태그)를 가진 별을 먼저
import { TAGS, TAG_KEYS, type Tag } from "./quest-meta";
import type { StartAnswers } from "./profile";

export const MIN_SURVEYS = 3; // 이보다 적으면 설문 대신 시작 질문 기준
export const LIKED_SCORE = 3; // 1~5 중 중간. 이 이상이어야 "좋아하는 성향"으로 봄
export const TOP_COUNT = 2;
/** 시작 질문에도 답이 없을 때 */
export const DEFAULT_TOP: readonly Tag[] = ["rest", "outdoor"];

export type SurveyRow = { satisfaction: number | null; achievement: number | null; tags: readonly string[] };
export type TagScore = { tag: Tag; label: string; score: number | null; count: number };
export type Preference = { tags: TagScore[]; top: Tag[]; basis: "survey" | "start_answers"; surveyedAttempts: number };

const isScore = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

/** 시도 하나의 점수. 둘 다 없으면 null (설문하지 않은 시도) */
export function attemptScore(r: Pick<SurveyRow, "satisfaction" | "achievement">): number | null {
  const vals = [r.satisfaction, r.achievement].filter(isScore);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** 태그 5개 모두, TAGS 순서. 설문이 없는 태그는 score null, count 0 */
export function tagScores(rows: readonly SurveyRow[]): TagScore[] {
  const sum = new Map<Tag, number>();
  const cnt = new Map<Tag, number>();
  for (const r of rows) {
    const s = attemptScore(r);
    if (s === null) continue;
    for (const t of new Set(r.tags)) {
      if (!TAG_KEYS.includes(t as Tag)) continue;
      sum.set(t as Tag, (sum.get(t as Tag) ?? 0) + s);
      cnt.set(t as Tag, (cnt.get(t as Tag) ?? 0) + 1);
    }
  }
  return TAGS.map(([tag, label]) => {
    const count = cnt.get(tag) ?? 0;
    return { tag, label, count, score: count ? Math.round(((sum.get(tag) ?? 0) / count) * 100) / 100 : null };
  });
}

export function topFromSurvey(scores: readonly TagScore[]): Tag[] {
  return scores
    .filter((s) => s.count > 0 && (s.score ?? 0) >= LIKED_SCORE)
    .sort((a, b) => b.score! - a.score! || b.count - a.count || TAG_KEYS.indexOf(a.tag) - TAG_KEYS.indexOf(b.tag))
    .slice(0, TOP_COUNT)
    .map((s) => s.tag);
}

/** 시작 질문 답마다 성향에 한 표 (docs/API명세.md "성향 점수"의 표와 같게 유지) */
export function tagVotesFromStart(a: StartAnswers): Tag[] {
  const votes: Tag[] = [];
  if (a.with === "together") votes.push("social");
  if (a.with === "alone") votes.push("rest");
  if (a.range === "home") votes.push("rest");
  if (a.range === "out" || a.range === "people") votes.push("outdoor");
  if (a.range === "people") votes.push("social");
  for (const n of a.needs ?? []) {
    if (n === "money_job") votes.push("career");
    else if (n === "people") votes.push("social");
    else if (n === "health") votes.push("rest");
  }
  return votes;
}

export function topFromStartAnswers(a: StartAnswers): Tag[] {
  const votes = tagVotesFromStart(a);
  const count = (t: Tag) => votes.filter((v) => v === t).length;
  const ranked = TAG_KEYS.filter((t) => count(t) > 0).sort((x, y) => count(y) - count(x) || TAG_KEYS.indexOf(x) - TAG_KEYS.indexOf(y));
  return ranked.length ? ranked.slice(0, TOP_COUNT) : [...DEFAULT_TOP];
}

export function computePreference(rows: readonly SurveyRow[], start: StartAnswers): Preference {
  const surveyed = rows.filter((r) => attemptScore(r) !== null);
  const tags = tagScores(surveyed);
  const fromSurvey = surveyed.length >= MIN_SURVEYS ? topFromSurvey(tags) : [];
  return fromSurvey.length
    ? { tags, top: fromSurvey, basis: "survey", surveyedAttempts: surveyed.length }
    : { tags, top: topFromStartAnswers(start), basis: "start_answers", surveyedAttempts: surveyed.length };
}
