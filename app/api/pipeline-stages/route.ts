import { NextResponse } from "next/server"
import { fetchAllPages, getBaseUrl, PIPELINE_ID } from "@/lib/relatia"

const CACHE_TTL = 20 * 60 * 1000
let _cache: { data: { stageCounts: Record<string, number>; stageDeals: Record<string, any[]> }; ts: number } | null = null

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data)
  }
  try {
    const base = getBaseUrl()
    console.log("[pipeline-stages] env check", {
      hasBaseUrl: !!process.env.RELATIA_BASE_URL,
      baseLen: (process.env.RELATIA_BASE_URL ?? "").length,
      hasToken: !!process.env.RELATIA_TOKEN,
      tokenLen: (process.env.RELATIA_TOKEN ?? "").length,
      computedBase: base,
    })
    const deals = await fetchAllPages<any>(
      `${base}/api/deals/?pipeline_id=${PIPELINE_ID}&page_size=100`
    )

    const stageCounts: Record<string, number> = {}
    const stageDeals: Record<string, any[]> = {}

    for (const deal of deals) {
      if (deal.pipeline_name && deal.pipeline_name !== "Richieste Franchising") continue

      const stageId: string | null = deal.current_stage ?? null
      if (!stageId) continue

      stageCounts[stageId] = (stageCounts[stageId] ?? 0) + 1

      if (!stageDeals[stageId]) stageDeals[stageId] = []
      const c = deal.contact ?? {}
      stageDeals[stageId].push({
        dealId: deal.id,
        contactId: c.id ?? null,
        full_name:
          (c.full_name ??
          ((c.first_name ?? "") + " " + (c.last_name ?? "")).trim()) ||
          "—",
        email: c.email ?? null,
        phone: c.phone ?? null,
        dealCreatedAt: deal.created_at,
      })
    }

    const result = { stageCounts, stageDeals }
    _cache = { data: result, ts: Date.now() }
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[pipeline-stages] failed", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
