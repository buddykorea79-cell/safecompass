import { NextResponse } from "next/server";
import { GUIDE_TYPES } from "@/lib/guideData";

export async function GET() {
  return NextResponse.json({
    types: GUIDE_TYPES.map((g) => ({ id: g.id, category: g.category, name: g.name })),
  });
}
