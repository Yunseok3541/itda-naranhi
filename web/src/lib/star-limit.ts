export const DAILY_STAR_LIMIT = 10;

export const DAILY_STAR_LIMIT_MESSAGE =
  `오늘은 별을 ${DAILY_STAR_LIMIT}개까지 땄어요.\n새 별은 내일 다시 딸 수 있어요.\n내일 다시 만나요 ⭐`;

const kstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', dateStyle: 'short' });

type StarHistory = { memories: readonly { date: string; status?: string }[] };

export function hasReachedDailyStarLimit(stars: readonly StarHistory[], now = new Date()): boolean {
  const today = kstDay.format(now);
  const collectedToday = stars.filter(({ memories }) => {
    const firstBright = memories.reduce((earliest, memory) => {
      if (memory.status !== 'bright') return earliest;
      const timestamp = Date.parse(memory.date);
      return Number.isFinite(timestamp) ? Math.min(earliest, timestamp) : earliest;
    }, Infinity);
    return Number.isFinite(firstBright) && kstDay.format(firstBright) === today;
  }).length;
  return collectedToday >= DAILY_STAR_LIMIT;
}
