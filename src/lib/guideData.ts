// 행동요령 마스터데이터(정적 JSON) 로더 + 검색
// - bizrouter 키가 있으면 임베딩 기반 유사도 검색, 없으면 키워드 스코어링으로 동일한 인터페이스를 제공한다.
// - 인메모리 캐시는 서버리스 인스턴스 생명주기 동안만 유지된다(DB 없음, 재시작 시 초기화).

import raw from "@/data/disasterGuide.json";
import { bizrouterAvailable, cosineSimilarity, embedTexts } from "./bizrouter";
import type { GuideType } from "@/types";

interface RawSection {
  heading: string;
  text: string | null;
  items: string[] | null;
}
interface RawItem {
  id: string;
  name: string;
  source?: string;
  sections?: RawSection[];
}
interface RawCategory {
  id: string;
  name: string;
  items: RawItem[];
}

const rawData = raw as unknown as { categories: RawCategory[] };

export const GUIDE_TYPES: GuideType[] = rawData.categories
  .filter((c) => c.id === "natural" || c.id === "social")
  .flatMap((c) =>
    c.items
      .filter((item) => item.sections && item.sections.length > 0)
      .map((item) => ({
        id: item.id,
        category: c.id as "natural" | "social",
        name: item.name,
        source: item.source,
        sections: item.sections!,
      }))
  );

export function getGuideById(id: string): GuideType | undefined {
  return GUIDE_TYPES.find((g) => g.id === id);
}

export function guideText(guide: GuideType): string {
  const sectionText = guide.sections
    .map((s) => [s.heading, s.text, ...(s.items ?? [])].filter(Boolean).join(" "))
    .join(" ");
  return `${guide.name} ${sectionText}`;
}

export interface GuideSearchResult {
  guide: GuideType;
  score: number;
}

function keywordSearch(query: string, limit: number): GuideSearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [];

  return GUIDE_TYPES.map((guide) => {
    const haystack = guideText(guide).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (guide.name.toLowerCase().includes(term)) score += 5;
      const occurrences = haystack.split(term).length - 1;
      score += occurrences;
    }
    return { guide, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// 임베딩 캐시(인스턴스 생명주기 동안만 유효)
let embeddingCache: { ids: string[]; vectors: number[][] } | null = null;

async function ensureEmbeddings(): Promise<{ ids: string[]; vectors: number[][] } | null> {
  if (embeddingCache) return embeddingCache;
  const texts = GUIDE_TYPES.map((g) => guideText(g).slice(0, 2000));
  const { vectors, fallback } = await embedTexts(texts);
  if (fallback || vectors.length !== GUIDE_TYPES.length) return null;
  embeddingCache = { ids: GUIDE_TYPES.map((g) => g.id), vectors };
  return embeddingCache;
}

export async function searchGuides(query: string, limit = 6): Promise<GuideSearchResult[]> {
  if (!query.trim()) return [];

  if (bizrouterAvailable()) {
    const cache = await ensureEmbeddings();
    if (cache) {
      const { vectors: queryVec, fallback } = await embedTexts([query]);
      if (!fallback && queryVec.length === 1) {
        const scored = cache.ids
          .map((id, idx) => ({
            guide: getGuideById(id)!,
            score: cosineSimilarity(queryVec[0], cache.vectors[idx]),
          }))
          .filter((r) => r.score > 0.15)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        if (scored.length > 0) return scored;
      }
    }
  }

  return keywordSearch(query, limit);
}

export async function similarGuidesForTypes(disasterTypes: string[], limit = 3): Promise<GuideType[]> {
  if (disasterTypes.length === 0) return [];
  const results = await searchGuides(disasterTypes.join(" "), limit);
  if (results.length > 0) return results.map((r) => r.guide);

  // 완전 폴백: 이름에 직접 포함되는 항목
  return GUIDE_TYPES.filter((g) => disasterTypes.some((t) => g.name.includes(t) || t.includes(g.name))).slice(0, limit);
}
