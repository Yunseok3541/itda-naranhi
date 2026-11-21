'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * 화면이 숨겨질 때(다른 화면으로 이동) 그 안의 펼친 <details>를 모두 접는다.
 *
 * cacheComponents로 이전 화면은 숨긴 채 남아서, 펼쳐 둔 접기 칸(정책 신청 정보, 아직 만나지 않은 배지 등)이
 * 다시 돌아왔을 때도 펼쳐진 채 보였다. 잠깐 펼쳐 보는 것이라 돌아오면 접혀 있는 게 자연스럽다.
 * 접기만 하고 안의 입력값은 그대로 둔다. 펼침 상태를 React 상태로 기억하는 곳은 각 컴포넌트에서 따로 되돌린다.
 * 참고: node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md
 */
export function useCollapseOnHide(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => () => {
    ref.current?.querySelectorAll('details[open]').forEach(details => { (details as HTMLDetailsElement).open = false; });
  }, [ref]);
}
