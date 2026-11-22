'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * 화면이 숨겨질 때(다른 화면으로 이동) showModal()로 연 창을 닫는다.
 *
 * cacheComponents(next.config.ts)를 켜 두어서 다른 화면으로 가도 이전 화면은 지워지지 않고 숨겨진 채 남는다(React Activity).
 * 숨겨진 화면에서 모달 창이 열린 채로 남으면 문서 전체가 inert가 되어 새 화면의 단추가 하나도 눌리지 않는다.
 * 예: 밤하늘 별 상세 창의 [이 별과 만나 보기] → /stars/:id 에서 아무것도 안 눌림.
 * 숨겨질 때 레이아웃 효과의 정리 함수가 먼저 돌므로 여기서 닫는다 (node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md).
 * 창의 onClose가 자기 상태(선택한 별 등)를 정리하므로 다시 돌아와도 닫힌 상태로 보인다.
 */
export function useCloseDialogOnHide(ref: RefObject<HTMLDialogElement | null>) {
  useLayoutEffect(() => () => {
    if (ref.current?.open) ref.current.close();
  }, [ref]);
}
