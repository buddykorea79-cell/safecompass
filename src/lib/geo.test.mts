import { describe, expect, it } from "vitest";
import { lonLatToGrid } from "./geo";

describe("기상청 동네예보 Lambert 5km 격자", () => {
  it("서울 좌표를 공식 동네예보 격자 60,127로 변환한다", () => {
    expect(lonLatToGrid(126.978, 37.5665)).toEqual({ nx: 60, ny: 127 });
  });

  it("첨부 격자영역 네 모서리를 149×253 경계로 변환한다", () => {
    expect(lonLatToGrid(123.3102, 43.3935)).toEqual({ nx: 1, ny: 253 });
    expect(lonLatToGrid(123.7613, 31.7944)).toEqual({ nx: 1, ny: 1 });
    expect(lonLatToGrid(132.775, 43.2175)).toEqual({ nx: 149, ny: 253 });
    expect(lonLatToGrid(131.6423, 31.6518)).toEqual({ nx: 149, ny: 1 });
  });
});
