import { NextRequest, NextResponse } from "next/server"
import {
  PIPELINE_ID,
  fetchFirstPage,
  fetchPagesRange,
  getBaseUrl,
  getCustomValue,
  normalizeRegione,
} from "@/lib/relatia"
import {
  clearWarmState,
  readDataset,
  readWarmState,
  writeDataset,
  writeWarmState,
} from "@/lib/kv-cache"

export const maxDuration = 60

// Budget per tick: ci fermiamo ben prima dei 60s per lasciare margine alla
// scrittura su KV. Il CRM serve ~1 pagina/s, quindi ~35 pagine a concorrenza 12
// stanno comodamente sotto il budget.
const TICK_BUDGET_MS = 45_000
const PAGES_PER_BATCH = 12
const CONCURRENCY = 12
// Se un ciclo di warming resta appeso oltre questo tempo, lo ricominciamo.
const STALE_MS = 30 * 60 * 1000

const CONTACTS_KEY = "contacts"
const STAGES_KEY = "pipeline-stages-raw" // staging: deal grezzi trimmati
const STAGES_FINAL_KEY = "pipeline-stages"

// ─── Trasformazioni (identiche alle route originali) ───────────────────────────

function trimContact(c: any) {
  return {
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
  }
}

type RawDeal = {
  dealId: string
  contactId: string | null
  full_name: string
  email: string | null
  phone: string | null
  dealCreatedAt: string
  stageId: string
}

function trimDeal(deal: any): RawDeal | null {
  if (deal.pipeline_name && deal.pipeline_name !== "Richieste Franchising") return null
  const stageId: string | null = deal.current_stage ?? null
  if (!stageId) return null
  const c = deal.contact ?? {}
  return {
    dealId: deal.id,
    contactId: c.id ?? null,
    full_name:
      (c.full_name ?? ((c.first_name ?? "") + " " + (c.last_name ?? "")).trim()) || "—",
    email: c.email ?? null,
    phone: c.phone ?? null,
    dealCreatedAt: deal.created_at,
    stageId,
  }
}

// A warming completato, aggrega i deal grezzi in stageCounts/stageDeals.
function buildStages(raw: RawDeal[]) {
  const stageCounts: Record<string, number> = {}
  const stageDeals: Record<string, any[]> = {}
  for (const d of raw) {
    stageCounts[d.stageId] = (stageCounts[d.stageId] ?? 0) + 1
    if (!stageDeals[d.stageId]) stageDeals[d.stageId] = []
    stageDeals[d.stageId].push({
      dealId: d.dealId,
      contactId: d.contactId,
      full_name: d.full_name,
      email: d.email,
      phone: d.phone,
      dealCreatedAt: d.dealCreatedAt,
    })
  }
  return { stageCounts, stageDeals }
}

// ─── Warming incrementale di un dataset paginato ───────────────────────────────
// Ritorna true se il warming di questo dataset e' completo, false se resta lavoro
// per il prossimo tick. `deadline` e' il timestamp entro cui fermarsi.

async function warmDataset<T>(
  key: string,
  baseUrl: string,
  trim: (raw: any) => T | null,
  deadline: number,
): Promise<{ done: boolean; page: number; totalPages: number }> {
  let state = await readWarmState(key)

  // (Ri)avvio del ciclo: nessuno stato, o stato troppo vecchio.
  if (!state || Date.now() - state.startedTs > STALE_MS) {
    const first = await fetchFirstPage<any>(baseUrl)
    const firstTrimmed = first.results.map(trim).filter((x): x is T => x != null)
    await writeDataset(`${key}:staging`, firstTrimmed)
    state = { nextPage: 2, totalPages: first.totalPages, startedTs: Date.now() }
    await writeWarmState(key, state)
    if (state.nextPage > state.totalPages) {
      await finalize(key, firstTrimmed)
      await clearWarmState(key)
      return { done: true, page: state.totalPages, totalPages: state.totalPages }
    }
  }

  const staged = await readDataset<T[]>(`${key}:staging`)
  const acc: T[] = staged?.data ?? []

  while (state.nextPage <= state.totalPages && Date.now() < deadline) {
    const to = Math.min(state.nextPage + PAGES_PER_BATCH - 1, state.totalPages)
    const batch = await fetchPagesRange<any>(baseUrl, state.nextPage, to, CONCURRENCY)
    for (const raw of batch) {
      const t = trim(raw)
      if (t != null) acc.push(t)
    }
    state.nextPage = to + 1
    await writeDataset(`${key}:staging`, acc)
    await writeWarmState(key, state)
  }

  if (state.nextPage > state.totalPages) {
    await finalize(key, acc)
    await clearWarmState(key)
    return { done: true, page: state.totalPages, totalPages: state.totalPages }
  }
  return { done: false, page: state.nextPage - 1, totalPages: state.totalPages }
}

// Scrive il dataset finale a partire dai record trimmati accumulati.
async function finalize<T>(key: string, acc: T[]): Promise<void> {
  if (key === CONTACTS_KEY) {
    await writeDataset(CONTACTS_KEY, { contacts: acc })
  } else if (key === STAGES_KEY) {
    const result = buildStages(acc as unknown as RawDeal[])
    await writeDataset(STAGES_FINAL_KEY, result)
  }
}

export async function GET(req: NextRequest) {
  // Vercel invia automaticamente Authorization: Bearer <CRON_SECRET> ai cron.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  const base = getBaseUrl()
  const deadline = Date.now() + TICK_BUDGET_MS
  const report: Record<string, any> = {}

  try {
    // Prima i contatti (dataset piu' grande). Se avanza tempo, i deal.
    const contacts = await warmDataset(
      CONTACTS_KEY,
      `${base}/api/contacts/?page_size=300`,
      trimContact,
      deadline,
    )
    report.contacts = contacts

    if (Date.now() < deadline) {
      const stages = await warmDataset<RawDeal>(
        STAGES_KEY,
        `${base}/api/deals/?pipeline_id=${PIPELINE_ID}&page_size=300`,
        trimDeal,
        deadline,
      )
      report.stages = stages
    } else {
      report.stages = { skipped: "no time budget left this tick" }
    }

    return NextResponse.json({ ok: true, ...report })
  } catch (err: any) {
    console.error("[cron/warm] failed", err)
    return NextResponse.json({ ok: false, error: err.message, ...report }, { status: 500 })
  }
}
