// 청년센터 데이터 목록 (docs/API명세.md "5. 청년센터")
// youth_centers 테이블에 출처·기준일·예시 여부 칸이 생기기 전까지 쓰는 임시 저장소다.
//
// 규칙
// - 실데이터는 source(제공처·URL·기준일)를 반드시 채운다. 확인하지 못한 값(운영시간 등)은 null로 둔다.
// - 예시 데이터는 isSample: true, source: null. 이름·주소에 가상임을 드러내고 전화번호·운영시간을 꾸며내지 않는다.
// - id는 inquiry_drafts.center_id에 저장된다. 예시 센터는 9000번대를 쓴다.
//
// 실데이터 출처 후보: 한국고용정보원_온통청년_청년센터 (https://www.data.go.kr/data/15171410/openapi.do)
//   이용허락 제한 없음, 등록·수정 2026-10-14 (2026-11-19 확인). 인증키 발급 후 수집 예정.

export type CenterSource = { name: string; url: string; basisDate: string };

export type Center = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  url: string | null;
  regionCode: string | null;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  programs: { title: string; summary: string }[];
  isSample: boolean;
  source: CenterSource | null;
};

export const CENTERS: Center[] = [
  {
    id: 9001,
    name: "예시 청년센터",
    address: "예시 주소 (실제 장소가 아니에요)",
    phone: null,
    url: null,
    regionCode: "11440",
    lat: null,
    lng: null,
    hours: null,
    programs: [{ title: "예시 프로그램", summary: "시연을 위한 가상의 프로그램이에요." }],
    isSample: true,
    source: null,
  },
];
