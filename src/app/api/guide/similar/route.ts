import { NextRequest, NextResponse } from "next/server";
import { similarGuidesForTypes } from "@/lib/guideData";

export async function GET(req: NextRequest) {
  const typesParam = req.nextUrl.searchParams.get("types") ?? "";
  const types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);
  if (types.length === 0) return NextResponse.json({ guides: [] });

  const guides = await similarGuidesForTypes(types, 4);
  return NextResponse.json({ guides: guides.map((g) => ({ id: g.id, category: g.category, name: g.name })) });
}
