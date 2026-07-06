import { NextRequest, NextResponse } from "next/server"
import { warmTick } from "@/lib/warm"

// Trigger manuale del warming (il refresh normale avviene in background dalle
// route utente). Utile per il primo popolamento della cache o per forzare un
// aggiornamento: GET con Authorization: Bearer <CRON_SECRET>.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  try {
    const report = await warmTick()
    return NextResponse.json({ ok: true, ...report })
  } catch (err: any) {
    console.error("[cron/warm] failed", err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
