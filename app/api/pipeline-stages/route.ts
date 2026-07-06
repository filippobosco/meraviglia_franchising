import { NextResponse } from "next/server"
import { readDataset } from "@/lib/kv-cache"

// Legge solo da Vercel KV (popolata dal cron /api/cron/warm). Nessuna chiamata
// live al CRM: risposta sempre <1s, mai 504. Vedi lib/kv-cache.ts.
export const maxDuration = 10

const MEM_TTL = 60 * 1000
type PipelineData = { stageCounts: Record<string, number>; stageDeals: Record<string, any[]> }
let _mem: { data: PipelineData; ts: number } | null = null

export async function GET() {
  if (_mem && Date.now() - _mem.ts < MEM_TTL) {
    return NextResponse.json(_mem.data)
  }
  try {
    const cached = await readDataset<PipelineData>("pipeline-stages")
    if (cached?.data) {
      _mem = { data: cached.data, ts: Date.now() }
      return NextResponse.json({ ...cached.data, cachedAt: cached.ts })
    }
    return NextResponse.json({ stageCounts: {}, stageDeals: {}, warming: true })
  } catch (err: any) {
    console.error("[pipeline-stages] failed", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
