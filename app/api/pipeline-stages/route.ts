import { NextResponse } from "next/server"
import { fetchAllPages, getBaseUrl, PIPELINE_ID, readDiskCache, writeDiskCache } from "@/lib/relatia"

// Su Vercel Hobby il default e' 10s: troppo poco per scaricare tutti i deal dal CRM.
// 60s e' il massimo consentito dal piano.
export const maxDuration = 60

const CACHE_TTL = 20 * 60 * 1000
const CACHE_KEY = "pipeline-stages"
type PipelineData = { stageCounts: Record<string, number>; stageDeals: Record<string, any[]> }
let _cache: { data: PipelineData; ts: number } | null = null

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data)
  }
  const disk = await readDiskCache<PipelineData>(CACHE_KEY, CACHE_TTL)
  if (disk) {
    _cache = { data: disk, ts: Date.now() }
    return NextResponse.json(disk)
  }
  try {
    const base = getBaseUrl()
    const deals = await fetchAllPages<any>(
      `${base}/api/deals/?pipeline_id=${PIPELINE_ID}&page_size=300`
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
    await writeDiskCache(CACHE_KEY, result)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[pipeline-stages] failed", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
