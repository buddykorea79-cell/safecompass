import { describe, expect, it } from "vitest";
import { isNationwideRegionText, regionKeywordMatch } from "./regions";

describe("재난정보 지역 범위", () => {
  it("전국 대상 정보는 현재 위치와 관계없이 포함한다", () => {
    expect(regionKeywordMatch("전국", "세종특별자치시 어진동")).toBe(true);
    expect(regionKeywordMatch("전국 일원", "서울특별시 종로구")).toBe(true);
    expect(regionKeywordMatch("전국(제주 제외)", "부산광역시 해운대구")).toBe(true);
    expect(isNationwideRegionText("대한민국 전역")).toBe(true);
  });

  it("다른 지역의 지역 한정 정보는 포함하지 않는다", () => {
    expect(regionKeywordMatch("부산광역시 해운대구", "서울특별시 종로구")).toBe(false);
  });
});
