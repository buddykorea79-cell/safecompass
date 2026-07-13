import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGuideById } from "@/lib/guideData";
import GuideDetailBody from "@/components/GuideDetailBody";

export default async function GuideDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const guide = getGuideById(decodeURIComponent(code));
  if (!guide) notFound();

  return (
    <main className="min-h-screen px-5 pb-8">
      <div className="flex items-center gap-3 pt-5 pb-3">
        <Link href="/guide" className="rounded-full p-1.5 hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" />
        </Link>
        <div>
          <p className="text-[11px] font-semibold text-brand-600">
            {guide.category === "natural" ? "자연재난" : "사회재난"}
          </p>
          <h1 className="text-lg font-bold text-slate-800">{guide.name}</h1>
        </div>
      </div>

      <GuideDetailBody guide={guide} />
    </main>
  );
}
