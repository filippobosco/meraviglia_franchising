import { NextResponse } from "next/server"
import { fetchAllPages, getBaseUrl, getCustomValue, normalizeRegione } from "@/lib/relatia"

const CACHE_TTL = 20 * 60 * 1000
let _cache: { data: { contacts: any[] }; ts: number } | null = null

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data)
  }
  try {
    const base = getBaseUrl()
    console.log("[contacts] env check", {
      hasBaseUrl: !!process.env.RELATIA_BASE_URL,
      baseLen: (process.env.RELATIA_BASE_URL ?? "").length,
      hasToken: !!process.env.RELATIA_TOKEN,
      tokenLen: (process.env.RELATIA_TOKEN ?? "").length,
      computedBase: base,
    })
    const allContacts = await fetchAllPages<any>(`${base}/api/contacts/?page_size=100`)

    const contacts = allContacts.map((c: any) => ({
      id: c.id,
      full_name: c.full_name ?? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
      email: c.email ?? null,
      phone: c.phone ?? null,
      created_at: c.created_at,
      regione: normalizeRegione(getCustomValue(c.custom_values ?? [], "in_quale_regione_risiedi")),
      professione: getCustomValue(c.custom_values ?? [], "qual_è_la_tua_attuale_professione"),
      budget: getCustomValue(c.custom_values ?? [], "quanto_puoi_investire_nel_progetto"),
      azienda: getCustomValue(c.custom_values ?? [], "qual_è_il_nome_della_tua_aziendaattività"),
      tipo_attivita: getCustomValue(c.custom_values ?? [], "meta_che_tipo_di_attività_hai"),
      meta_campaign_name: c.meta_campaign_name ?? null,
      meta_platform: c.meta_platform ?? null,
    }))

    const result = { contacts }
    _cache = { data: result, ts: Date.now() }
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[contacts] failed", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
