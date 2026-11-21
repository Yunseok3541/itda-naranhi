// 배지(마일스톤) 규칙 — 프로필 화면에서 씀. 서버(api/milestones)와 예시 모드가 같은 규칙을 씀
// 원칙 (고민기록 #1·#3·#12와 같은 방향)
// - 횟수 경쟁이 아니라 "처음 해 본 순간"을 기념. 연속 기록 배지는 없음 (끊기면 자책하게 만들어 "실패에 불이익 없음"과 충돌)
// - 시도(손 뻗어 보기)·쉬어 가기도 배지 → 해낸 것만 세지 않음
// - "바깥으로"·"연결" 배지가 핵심: 앱 밖의 실제 행동을 기념 ("필요 없어지기를 바라는 앱")
// - 아직 못 받은 배지는 흐리게, 부담 없는 문장(hint)으로만 안내

/** 배지 판정에 쓰는 사실들 (모두 "한 번이라도 했는지"만) */
export type MilestoneFacts = {
  firstAttempt: boolean; // 별을 처음 기록 (따든 손을 뻗든)
  checkin: boolean; // 한 줄 체크인
  reflection: boolean; // 회고 한 줄
  dim: boolean; // 손 뻗어 보기
  retried: boolean; // 손을 뻗었던 별을 나중에 땀
  rested: boolean; // 체크인에서 "쉬어 가기"
  nearTried: boolean; // 집 앞(2단계 이상) 별 시도
  outsideTried: boolean; // 바깥 별 시도
  centerBright: boolean; // 청년센터 바깥 별을 땀 (앞까지 가 봄)
  policyClicked: boolean; // 추천 정책 원문 열어 봄
  inquiryDrafted: boolean; // 청년센터 문의 문장 준비
  inquirySent: boolean; // "문의해 봤어요" 기록
  joined: boolean; // 프로그램 참여 기록
};

export const NO_FACTS: MilestoneFacts = {
  firstAttempt: false, checkin: false, reflection: false, dim: false, retried: false, rested: false,
  nearTried: false, outsideTried: false, centerBright: false, policyClicked: false, inquiryDrafted: false, inquirySent: false, joined: false,
};

export type MilestoneGroup = '시작' | '시도' | '바깥으로' | '연결';

export type Milestone = {
  id: keyof MilestoneFacts;
  group: MilestoneGroup;
  name: string;
  icon: string;
  /** 받았을 때 */
  done: string;
  /** 아직일 때: 부담 없는 안내 (권유·압박 표현 금지) */
  hint: string;
};

export const MILESTONES: Milestone[] = [
  { id: 'firstAttempt', group: '시작', name: '첫 별빛', icon: '✦', done: '처음으로 별을 기록했어요', hint: '언젠가 작은 별 하나를 기록하면 켜져요' },
  { id: 'checkin', group: '시작', name: '마음 날씨', icon: '☁', done: '처음으로 오늘의 마음을 적었어요', hint: '한 줄 체크인을 남기면 켜져요' },
  { id: 'reflection', group: '시작', name: '한 줄의 기억', icon: '✎', done: '그날의 기억을 한 줄 남겼어요', hint: '별을 기록할 때 한 줄을 남기면 켜져요' },
  { id: 'dim', group: '시도', name: '손을 뻗은 날', icon: '✧', done: '끝까지 못 해도 손을 뻗었어요', hint: '손 뻗어 보기도 소중한 기록이에요' },
  { id: 'retried', group: '시도', name: '다시 한 번', icon: '↻', done: '손을 뻗었던 별을 다시 만나 땄어요', hint: '언젠가 다시 만나도 괜찮아요' },
  { id: 'rested', group: '시도', name: '쉬어 가는 용기', icon: '☾', done: '쉬어 가는 날을 스스로 골랐어요', hint: '쉬어 가기를 골라도 괜찮아요' },
  { id: 'nearTried', group: '바깥으로', name: '문 앞까지', icon: '⌂', done: '집 앞으로 한 걸음 나가 봤어요', hint: '집 앞 별을 만나면 켜져요' },
  { id: 'outsideTried', group: '바깥으로', name: '혼자 외출', icon: '⤴', done: '혼자 바깥으로 나가 봤어요', hint: '바깥 별을 만나면 켜져요' },
  { id: 'centerBright', group: '바깥으로', name: '청년센터 문 앞', icon: '⌖', done: '청년센터 앞까지 가 봤어요', hint: '들어가지 않아도, 앞까지만 가도 켜져요' },
  { id: 'policyClicked', group: '연결', name: '길 찾는 사람', icon: '☷', done: '나에게 맞는 정책을 살펴봤어요', hint: '추천 정책 원문을 열어 보면 켜져요' },
  { id: 'inquiryDrafted', group: '연결', name: '말 걸 준비', icon: '✉', done: '물어볼 말을 준비해 봤어요', hint: '청년센터에 물어볼 문장을 준비하면 켜져요' },
  { id: 'inquirySent', group: '연결', name: '첫 문의', icon: '☎', done: '직접 물어봤어요', hint: '문의해 봤다고 기록하면 켜져요' },
  { id: 'joined', group: '연결', name: '함께하는 자리', icon: '♡', done: '사람들과 함께하는 자리에 가 봤어요', hint: '프로그램에 참여했다고 기록하면 켜져요' },
];

export function evaluate(facts: MilestoneFacts) {
  return MILESTONES.map(m => ({ ...m, earned: !!facts[m.id] }));
}

/** 서버 응답(믿을 수 없는 JSON) → MilestoneFacts. 모르는 칸은 false */
export function readFacts(v: unknown): MilestoneFacts {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.keys(NO_FACTS).map(k => [k, o[k] === true])) as MilestoneFacts;
}
