// ─── Warming incrementale della cache KV ──────────────────────────────────────
// Scarica dal CRM solo la finestra degli ultimi WINDOW_DAYS giorni e la salva
// su Vercel KV a blocchi di pagine, sempre entro il budget di tempo di una
// singola invocazione serverless. Non serve un cron: le route utente servono
// la cache e, se e' stantia, fanno ripartire un tick di warming in background
// (waitUntil). Se un tick non completa il ciclo, il successivo riprende dallo
// stato salvato in KV.

import { kv } from "@vercel/kv"
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

// La dashboard copre solo questa finestra: i contatti piu' vecchi non vengono
// scaricati (24.7k contatti totali non stanno in nessun budget serverless).
export const WINDOW_DAYS = 90

// Budget di un tick: margine sui 60s di maxDuration.
const TICK_BUDGET_MS = 50_000
// Piu' pagine per iterazione = meno scritture di staging su KV per tick.
const PAGES_PER_BATCH = 36
const CONCURRENCY = 12
// Un ciclo appeso da troppo tempo viene ricominciato da capo.
const STALE_CYCLE_MS = 30 * 60 * 1000
// Eta' della cache oltre la quale le route innescano un refresh in background.
export const REFRESH_AFTER_MS = 20 * 60 * 1000

const CONTACTS_KEY = "contacts"
const STAGES_KEY = "pipeline-stages-raw"
const STAGES_FINAL_KEY = "pipeline-stages"
const LOCK_KEY = "warm:lock"

function windowStartIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - WINDOW_DAYS)
  return d.toISOString().split("T")[0]
}

// ─── Trasformazioni ────────────────────────────────────────────────────────────

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

// cutoff: i deal piu' vecchi della finestra vengono scartati.
function trimDeal(deal: any, cutoffIso: string): RawDeal | null {
  if (deal.pipeline_name && deal.pipeline_name !== "Richieste Franchising") return null
  const stageId: string | null = deal.current_stage ?? null
  if (!stageId) return null
  if (deal.created_at && deal.created_at.slice(0, 10) < cutoffIso) return null
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
// `stopAfterBatch`: con risultati ordinati dal piu' recente, permette di fermarsi
// appena un batch esce dalla finestra temporale (early-stop per i deal, il cui
// endpoint non supporta created_after).

async function warmDataset<T>(
  key: string,
  baseUrl: string,
  trim: (raw: any) => T | null,
  deadline: number,
  stopAfterBatch?: (batch: any[]) => boolean,
): Promise<{ done: boolean; page: number; totalPages: number }> {
  let state = await readWarmState(key)

  if (!state || Date.now() - state.startedTs > STALE_CYCLE_MS) {
    const first = await fetchFirstPage<any>(baseUrl)
    const firstTrimmed = first.results.map(trim).filter((x): x is T => x != null)
    await writeDataset(`${key}:staging`, firstTrimmed)
    const earlyStop = stopAfterBatch?.(first.results) ?? false
    state = {
      nextPage: earlyStop ? first.totalPages + 1 : 2,
      totalPages: first.totalPages,
      startedTs: Date.now(),
    }
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
    if (stopAfterBatch?.(batch)) {
      state.nextPage = state.totalPages + 1 // early-stop: fuori finestra
    }
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

async function finalize<T>(key: string, acc: T[]): Promise<void> {
  if (key === CONTACTS_KEY) {
    await writeDataset(CONTACTS_KEY, { contacts: acc })
  } else if (key === STAGES_KEY) {
    const result = buildStages(acc as unknown as RawDeal[])
    await writeDataset(STAGES_FINAL_KEY, result)
  }
}

// ─── Tick di warming ───────────────────────────────────────────────────────────
// Un solo tick alla volta: lock su KV con scadenza automatica (NX + EX), cosi'
// visite concorrenti non fanno partire warming doppi.

export async function warmTick(): Promise<Record<string, any>> {
  const acquired = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: 58 })
  if (acquired !== "OK") return { skipped: "warming gia' in corso" }

  const base = getBaseUrl()
  const cutoff = windowStartIso()
  const deadline = Date.now() + TICK_BUDGET_MS
  const report: Record<string, any> = { window_days: WINDOW_DAYS, cutoff }

  try {
    report.contacts = await warmDataset(
      CONTACTS_KEY,
      `${base}/api/contacts/?page_size=300&created_after=${cutoff}`,
      trimContact,
      deadline,
    )

    if (Date.now() < deadline) {
      report.stages = await warmDataset<RawDeal>(
        STAGES_KEY,
        `${base}/api/deals/?pipeline_id=${PIPELINE_ID}&page_size=300&ordering=-created_at`,
        raw => trimDeal(raw, cutoff),
        deadline,
        // Risultati dal piu' recente: appena l'ultimo del batch esce dalla
        // finestra, le pagine successive sono tutte piu' vecchie.
        batch => {
          const last = batch[batch.length - 1]
          return Boolean(last?.created_at && last.created_at.slice(0, 10) < cutoff)
        },
      )
    } else {
      report.stages = { skipped: "budget esaurito in questo tick" }
    }
    return report
  } finally {
    await kv.del(LOCK_KEY).catch(() => {})
  }
}
