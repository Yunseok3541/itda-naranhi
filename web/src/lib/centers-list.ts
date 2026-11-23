// 청년센터 목록 불러오기 (GET /api/centers). 한 번 받은 목록은 이 탭이 열려 있는 동안 다시 씀
// - 목록은 코드에 있는 고정 데이터(app/api/_lib/centers-data.ts)라 중간에 바뀌지 않음
// - 정책 화면에서 미리 불러 두면 "청년센터 살펴보기"를 눌렀을 때 대기 문구 없이 바로 보임 (policies-screen.tsx)
// - 화면을 다시 열 때도 다시 받지 않음 (예전엔 돌아올 때마다 "불러오고 있어요"가 잠깐 보였다가 목록이 밀려 들어옴)
import type { Center } from '@/app/api/_lib/centers-data';
import { request } from './mobile-data';

export type CenterSummary = Pick<Center, 'name' | 'address' | 'isSample'> & { centerId: number };
/** 데모 지역 (서울 마포구, 새 사용자의 users.region_code와 같음) */
export const CENTER_REGION = '11440';

const loaded = new Map<string, CenterSummary[]>();
const pending = new Map<string, Promise<CenterSummary[]>>();

/** 이미 받아 둔 목록 (없으면 undefined) */
export function cachedCenters(region = CENTER_REGION) {
  return loaded.get(region);
}

/** 목록 불러오기. 같은 지역을 동시에 여러 번 불러도 요청은 한 번. 실패하면 기억하지 않아 다음에 다시 시도 */
export function loadCenters(region = CENTER_REGION): Promise<CenterSummary[]> {
  const done = loaded.get(region);
  if (done) return Promise.resolve(done);
  let next = pending.get(region);
  if (!next) {
    next = request<{ centers: CenterSummary[] }>(`centers?region=${region}`)
      .then(data => { loaded.set(region, data.centers); return data.centers; })
      .finally(() => pending.delete(region));
    pending.set(region, next);
  }
  return next;
}

/** 미리 불러 두기 (실패해도 조용히 넘어감: 화면을 열 때 다시 불러오고 그때 안내함) */
export function prefetchCenters(region = CENTER_REGION) {
  loadCenters(region).catch(() => {});
}
