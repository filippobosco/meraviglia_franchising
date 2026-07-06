import { NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { readDataset } from "@/lib/kv-cache"
import { warmTick, REFRESH_AFTER_MS } from "@/lib/warm"

// Serve la cache KV (sempre istantaneo, mai 504). Se la cache e' stantia o
// assente, innesca un tick di warming in background con waitUntil.
export const maxDuration = 60

const MEM_TTL = 60 * 1000
type PipelineData = { stageCounts: Record<string, number>; stageDeals: Record<string, any[]> }
let _mem: { data: PipelineData; ts: number } | null = null

export async function GET() {
  if (_mem && Date.now() - _mem.ts < MEM_TTL) {
    return NextResponse.json(_mem.data)
  }
  try {
    const cached = await readDataset<PipelineData>("pipeline-stages")

    if (!cached?.data || Date.now() - cached.ts > REFRESH_AFTER_MS) {
      waitUntil(warmTick().catch(e => console.error("[pipeline-stages] warm failed", e)))
    }

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
