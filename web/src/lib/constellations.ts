export const activityConstellations = {
  1: { name: '카시오페이아자리', theme: '하루를 여는 작은 습관' },
  2: { name: '돌고래자리', theme: '나를 돌보는 시간' },
  3: { name: '거문고자리', theme: '현관 너머 한 걸음' },
} satisfies Record<number, { name: string; theme: string }>;

export function getActivityConstellation(id: number) {
  return Object.hasOwn(activityConstellations, id)
    ? activityConstellations[id as keyof typeof activityConstellations]
    : undefined;
}
