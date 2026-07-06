import { NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { readDataset } from "@/lib/kv-cache"
import { warmTick, REFRESH_AFTER_MS } from "@/lib/warm"

// Serve la cache KV (sempre istantaneo, mai 504). Se la cache e' stantia o
// assente, innesca un tick di warming in background con waitUntil: l'utente
// non aspetta, e il dato si aggiorna per le visite successive.
export const maxDuration = 60

const MEM_TTL = 60 * 1000
type ContactsData = { contacts: any[] }
let _mem: { data: ContactsData; ts: number } | null = null

export async function GET() {
  if (_mem && Date.now() - _mem.ts < MEM_TTL) {
    return NextResponse.json(_mem.data)
  }
  try {
    const cached = await readDataset<ContactsData>("contacts")

    if (!cached?.data || Date.now() - cached.ts > REFRESH_AFTER_MS) {
      waitUntil(warmTick().catch(e => console.error("[contacts] warm failed", e)))
    }

    if (cached?.data) {
      _mem = { data: cached.data, ts: Date.now() }
      return NextResponse.json({ ...cached.data, cachedAt: cached.ts })
    }
    // Primo avvio assoluto: cache mai popolata, il warming e' appena partito.
    return NextResponse.json({ contacts: [], warming: true })
  } catch (err: any) {
    console.error("[contacts] failed", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
