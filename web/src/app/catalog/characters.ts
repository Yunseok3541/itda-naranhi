import { activityConstellations } from '@/lib/constellations';

export type Character = {
  id: string;
  nickname: string;
  constellation: {
    name: string;
    theme: string;
  };
  color: string;
  story: string;
  constellationId?: number;
};

export const characters: readonly Character[] = [
  {
    id: 'saebit', nickname: '새빛', constellation: activityConstellations[1],
    color: '#ba9ef1', constellationId: 1,
    story: '다섯 별이 모여 새빛의 작은 왕관이 됐어요. 창가에 아침빛이 들면, 새빛도 눈을 뜨고 오늘의 하늘을 바라봐요.',
  },
  {
    id: 'yunseul', nickname: '윤슬', constellation: activityConstellations[2],
    color: '#78d7c8', constellationId: 2,
    story: '윤슬은 물 위로 올라와 가끔 숨을 골라요. 햇살을 머금은 물방울을 띄우고, 잠깐 쉬어 가는 동안 곁에서 헤엄쳐요.',
  },
  {
    id: 'doran', nickname: '도란', constellation: activityConstellations[3],
    color: '#ecaf99', constellationId: 3,
    story: '도란은 작은 리라가 달린 집을 등에 지고 다녀요. 오늘은 문 앞까지만 가 보고 싶다면, 도란도 딱 거기까지 함께 가요.',
  },
  {
    id: 'sobok', nickname: '소복', constellation: { name: '작은곰자리', theme: '고요히 쉬는 저녁' },
    color: '#99bced',
    story: '소복은 목도리를 두르고 웅크려 쉬어요. 목도리에 단 작은 나침반은 내일 다시 길을 찾을 때 쓰려고 챙겼어요.',
  },
  {
    id: 'dalkong', nickname: '달콩', constellation: { name: '토끼자리', theme: '마음에 드는 것 하나' },
    color: '#e9bb9d',
    story: '달콩은 좋아하는 잎사귀를 하나 골라 꼭 안고 있어요. 오늘 마음에 들었던 작은 것도 이렇게 챙겨 둘 수 있어요.',
  },
  {
    id: 'noeul', nickname: '노을', constellation: { name: '여우자리', theme: '눈에 담아 둔 풍경' },
    color: '#eb996e',
    story: '해가 질 무렵이면 노을은 꼬리를 몸에 둘러요. 귓가에 꽂아 둔 잎 하나가 산책길에서 만난 오늘의 풍경이에요.',
  },
  {
    id: 'moa', nickname: '모아', constellation: { name: '카멜레온자리', theme: '오늘의 색 발견하기' },
    color: '#a6cb91',
    story: '모아는 나뭇가지에 앉아 주변의 색을 살펴봐요. 같은 자리에서도 어제와 다른 색을 발견하면 꼬리를 동그랗게 말아요.',
  },
  {
    id: 'yeoul', nickname: '여울', constellation: { name: '백조자리', theme: '내 속도로 흘러가는 시간' },
    color: '#b4b9ed',
    story: '여울은 잔잔한 물 위에서 잠깐 멈춰 있어요. 목을 가만히 돌리면 깃 끝에서 물빛이 은은하게 반짝여요.',
  },
  {
    id: 'baram', nickname: '바람', constellation: { name: '독수리자리', theme: '바람을 잠깐 느껴 보기' },
    color: '#dbaf85',
    story: '바람은 날개 한쪽을 들어 오늘 불어오는 바람을 느껴요. 멀리 날아갈 날도, 그 자리에 앉아 있을 날도 있어요.',
  },
  {
    id: 'mulggam', nickname: '물감', constellation: { name: '화가자리', theme: '하루에 색 한 방울' },
    color: '#dda3c7',
    story: '물감은 색을 세 방울쯤 올린 팔레트에 작은 붓을 들고 다녀요. 오늘을 한 가지 색으로 그린다면 무슨 색일까요?',
  },
];
