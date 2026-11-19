// 청년센터 목록·상세 (docs/API명세.md "5. 청년센터")
import { type ApiResult, fail, ok, toId } from "./http";
import { CENTERS, type Center } from "./centers-data";

export function findCenter(id: number): Center | undefined {
  return CENTERS.find((c) => c.id === id);
}

function detail(c: Center) {
  const { id, ...rest } = c;
  return { centerId: id, ...rest };
}

export function listCenters(region: string | null): ApiResult {
  if (region !== null && !/^\d{5}$/.test(region)) return fail(400, "INVALID", "region은 시군구 코드 5자리예요.");
  const centers = CENTERS.filter((c) => region === null || c.regionCode === region).map((c) => ({
    centerId: c.id,
    name: c.name,
    address: c.address,
    regionCode: c.regionCode,
    isSample: c.isSample,
    source: c.source,
  }));
  return ok({ centers });
}

export function getCenter(rawId: string): ApiResult {
  const id = toId(rawId);
  if (id === null) return fail(400, "INVALID", "centerId가 올바르지 않아요.");
  const center = findCenter(id);
  if (!center) return fail(404, "NOT_FOUND", "센터를 찾을 수 없어요.");
  return ok({ center: detail(center) });
}
