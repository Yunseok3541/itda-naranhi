const recordDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric',
});

export function formatRecordDate(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00+09:00' : value);
  return Number.isNaN(date.getTime()) ? '' : recordDate.format(date);
}
