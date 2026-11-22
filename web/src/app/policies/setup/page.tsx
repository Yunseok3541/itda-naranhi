import MobileFlow from '@/components/mobile-flow';

// 추천 기준 정하기: 정책 탭에서 맞춤 추천을 위해 정보를 처음 알려 줄 때 (질문 하나씩, policy-setup.tsx)
export default function PolicySetupPage() {
  return <MobileFlow screen="policy-setup" />;
}
