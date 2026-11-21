export function starDisplayTitle(title: string): string {
  return title === '가까운 카페에서 음료 한 잔 사 마시기'
    ? '가까운 카페에서\n음료 한 잔 사 마시기'
    : title;
}

export function starDisplayDescription(description: string): string {
  return description.replace(/([.!?]) +/g, '$1\n');
}
