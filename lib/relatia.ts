export const PIPELINE_ID = "56f4ade2-75ca-490f-80b5-3c6963b65e5a"

const BASE_URL = process.env.RELATIA_BASE_URL!
const TOKEN = process.env.RELATIA_TOKEN!

function headers() {
  return { Authorization: `Bearer ${TOKEN}` }
}

type PageResponse<T> = { count: number; next: string | null; results: T[] }

async function fetchPage<T>(url: string): Promise<PageResponse<T>> {
  const res: Response = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`Relatia ${res.status}: ${url}`)
  return res.json() as Promise<PageResponse<T>>
}

async function fetchPageWithRetry<T>(url: string, retries = 3): Promise<PageResponse<T>> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchPage<T>(url)
    } catch (e) {
      if (attempt === retries - 1) throw e
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new Error("unreachable")
}

// Fetches all pages in sequential batches to avoid overwhelming the API
export async function fetchAllPages<T>(baseUrl: string, concurrency = 15): Promise<T[]> {
  const first = await fetchPageWithRetry<T>(baseUrl)
  const results: T[] = [...first.results]
  if (!first.next || first.count <= first.results.length) return results

  const pageSize = first.results.length
  const totalPages = Math.ceil(first.count / pageSize)

  const pageUrls: string[] = []
  for (let page = 2; page <= totalPages; page++) {
    const u = new URL(baseUrl)
    u.searchParams.set("page", String(page))
    pageUrls.push(u.toString())
  }

  for (let i = 0; i < pageUrls.length; i += concurrency) {
    const batch = pageUrls.slice(i, i + concurrency)
    const pages = await Promise.all(batch.map(u => fetchPageWithRetry<T>(u)))
    for (const p of pages) results.push(...p.results)
  }

  return results
}

export function getBaseUrl() {
  return BASE_URL
}

export function getCustomValue(custom_values: any[], key: string): string | null {
  const found = custom_values?.find((cv: any) => cv.custom_field?.key === key)
  return found?.value_text ?? null
}

const CANONICAL_REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
] as const

function clean(text: string): string {
  const lowered = text.toLowerCase().trim()
  const nfkd = lowered.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  const noPunct = nfkd.replace(/[^a-z0-9\s]/g, " ")
  return noPunct.replace(/\s+/g, " ").trim()
}

const CANONICAL_BY_CLEAN: Record<string, string> = Object.fromEntries(
  CANONICAL_REGIONS.map(r => [clean(r), r])
)
const CANONICAL_KEYS = Object.keys(CANONICAL_BY_CLEAN)
const CANONICAL_SET = new Set<string>(CANONICAL_REGIONS)

const ALIAS: Record<string, string> = {
  er: "Emilia-Romagna",
  fvg: "Friuli-Venezia Giulia",
  vda: "Valle d'Aosta",
  taa: "Trentino-Alto Adige",
}

const PROVINCIA_REGIONE: Record<string, string> = {
  agrigento: "Sicilia", alessandria: "Piemonte", ancona: "Marche",
  aosta: "Valle d'Aosta", arezzo: "Toscana", "ascoli piceno": "Marche",
  asti: "Piemonte", avellino: "Campania", bari: "Puglia",
  barletta: "Puglia", andria: "Puglia", trani: "Puglia",
  belluno: "Veneto", benevento: "Campania", bergamo: "Lombardia",
  biella: "Piemonte", bologna: "Emilia-Romagna", bolzano: "Trentino-Alto Adige",
  brescia: "Lombardia", brindisi: "Puglia", cagliari: "Sardegna",
  caltanissetta: "Sicilia", campobasso: "Molise", caserta: "Campania",
  catania: "Sicilia", catanzaro: "Calabria", chieti: "Abruzzo",
  como: "Lombardia", cosenza: "Calabria", cremona: "Lombardia",
  crotone: "Calabria", cuneo: "Piemonte", enna: "Sicilia",
  fermo: "Marche", ferrara: "Emilia-Romagna", firenze: "Toscana",
  foggia: "Puglia", forli: "Emilia-Romagna", cesena: "Emilia-Romagna",
  frosinone: "Lazio", genova: "Liguria", gorizia: "Friuli-Venezia Giulia",
  grosseto: "Toscana", imperia: "Liguria", isernia: "Molise",
  "la aquila": "Abruzzo", aquila: "Abruzzo", "la spezia": "Liguria",
  latina: "Lazio", lecce: "Puglia", lecco: "Lombardia",
  livorno: "Toscana", lodi: "Lombardia", lucca: "Toscana",
  macerata: "Marche", mantova: "Lombardia", massa: "Toscana",
  carrara: "Toscana", "massa carrara": "Toscana", matera: "Basilicata",
  messina: "Sicilia", milano: "Lombardia", modena: "Emilia-Romagna",
  monza: "Lombardia", napoli: "Campania", novara: "Piemonte",
  nuoro: "Sardegna", oristano: "Sardegna", padova: "Veneto",
  palermo: "Sicilia", parma: "Emilia-Romagna", pavia: "Lombardia",
  perugia: "Umbria", pesaro: "Marche", urbino: "Marche",
  pescara: "Abruzzo", piacenza: "Emilia-Romagna", pisa: "Toscana",
  pistoia: "Toscana", pordenone: "Friuli-Venezia Giulia",
  potenza: "Basilicata", prato: "Toscana", ragusa: "Sicilia",
  ravenna: "Emilia-Romagna", "reggio calabria": "Calabria",
  "reggio emilia": "Emilia-Romagna", rieti: "Lazio", rimini: "Emilia-Romagna",
  roma: "Lazio", rovigo: "Veneto", salerno: "Campania",
  sassari: "Sardegna", savona: "Liguria", siena: "Toscana",
  siracusa: "Sicilia", sondrio: "Lombardia", "sud sardegna": "Sardegna",
  carbonia: "Sardegna", iglesias: "Sardegna", taranto: "Puglia",
  teramo: "Abruzzo", terni: "Umbria", torino: "Piemonte",
  trapani: "Sicilia", trento: "Trentino-Alto Adige", treviso: "Veneto",
  trieste: "Friuli-Venezia Giulia", udine: "Friuli-Venezia Giulia",
  varese: "Lombardia", venezia: "Veneto", verbania: "Piemonte",
  vercelli: "Piemonte", verona: "Veneto", "vibo valentia": "Calabria",
  vicenza: "Veneto", viterbo: "Lazio",
  scafati: "Campania", crema: "Lombardia", legnano: "Lombardia",
  "toscolano maderno": "Lombardia",
}

const ESTERO = new Set([
  "svizzera", "san marino", "malta", "uk", "regno unito", "romania",
  "estero", "inghilterra", "francia", "germania", "spagna", "olanda",
  "paesi bassi",
])

const TOKEN_RE = /[a-z0-9]+/g

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function provinceMatch(cleaned: string): string | null {
  for (const city of Object.keys(PROVINCIA_REGIONE)) {
    if (city.includes(" ") && new RegExp(`\\b${escapeRe(city)}\\b`).test(cleaned)) {
      return PROVINCIA_REGIONE[city]
    }
  }
  const tokens = cleaned.match(TOKEN_RE) ?? []
  for (const tok of tokens) {
    if (tok in PROVINCIA_REGIONE) return PROVINCIA_REGIONE[tok]
  }
  return null
}

function esteroMatch(cleaned: string): boolean {
  if (ESTERO.has(cleaned)) return true
  for (const voce of ESTERO) {
    if (voce.includes(" ") && new RegExp(`\\b${escapeRe(voce)}\\b`).test(cleaned)) {
      return true
    }
  }
  return false
}

function splitMultiRegion(value: string): string[] {
  return value.split(/\s*(?:,|\/|\se\s)\s*/).map(p => p.trim()).filter(Boolean)
}

function lcsLength(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  let prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(curr[j - 1], prev[j])
    }
    prev = curr
  }
  return prev[b.length]
}

// Mirrors rapidfuzz fuzz.ratio: indel-based similarity (no substitutions).
function fuzzyRatio(a: string, b: string): number {
  const total = a.length + b.length
  if (!total) return 100
  const indel = total - 2 * lcsLength(a, b)
  return (1 - indel / total) * 100
}

function fuzzyMatch(cleaned: string, cutoff = 80): string | null {
  let best: { key: string; score: number } | null = null
  for (const key of CANONICAL_KEYS) {
    const score = fuzzyRatio(cleaned, key)
    if (score >= cutoff && (!best || score > best.score)) {
      best = { key, score }
    }
  }
  return best ? CANONICAL_BY_CLEAN[best.key] : null
}

export type RegioneLayer =
  | "diretto" | "alias" | "provincia_regione" | "estero"
  | "multi_regione" | "fuzzy" | "fallback"

export function normalizzaRegione(
  valore: string | null | undefined,
  depth = 0,
): { canonica: string | null; strato: RegioneLayer } {
  if (valore == null) return { canonica: null, strato: "fallback" }
  const raw = String(valore).trim()
  if (!raw) return { canonica: null, strato: "fallback" }

  const cleaned = clean(raw)
  if (!cleaned) return { canonica: null, strato: "fallback" }

  if (CANONICAL_BY_CLEAN[cleaned]) {
    return { canonica: CANONICAL_BY_CLEAN[cleaned], strato: "diretto" }
  }
  if (ALIAS[cleaned]) {
    return { canonica: ALIAS[cleaned], strato: "alias" }
  }
  const prov = provinceMatch(cleaned)
  if (prov) return { canonica: prov, strato: "provincia_regione" }

  if (esteroMatch(cleaned)) return { canonica: null, strato: "estero" }

  if (depth === 0) {
    const parts = splitMultiRegion(raw)
    if (parts.length > 1) {
      for (const part of parts) {
        const sub = normalizzaRegione(part, 1)
        if (sub.canonica && CANONICAL_SET.has(sub.canonica)) {
          return { canonica: sub.canonica, strato: "multi_regione" }
        }
      }
    }
  }

  const fuzzy = fuzzyMatch(cleaned)
  if (fuzzy) return { canonica: fuzzy, strato: "fuzzy" }

  return { canonica: null, strato: "fallback" }
}

export function normalizeRegione(raw: string | null): string {
  return normalizzaRegione(raw).canonica ?? "Non specificata"
}
