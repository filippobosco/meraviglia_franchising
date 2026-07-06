// ─── Cache persistente su Vercel KV ───────────────────────────────────────────
// La cache su /tmp non e' condivisa tra invocazioni serverless su Vercel, quindi
// il primo utente dopo ogni cold start beccava il 504. Vercel KV (Upstash Redis)
// e' persistente e condiviso tra tutte le invocazioni.
//
// I dataset (contatti ~7.6 MB, deal) superano il limite ~1 MB/valore di KV,
// quindi vengono gzippati e spezzati in chunk salvati su piu' chiavi:
//   <key>:meta        → { chunks, ts } (JSON)
//   <key>:chunk:<n>   → chunk gzip in base64
//
// Lo stato incrementale del cron di warming vive invece in una singola chiave:
//   <key>:warm        → WarmState (JSON)

import { kv } from "@vercel/kv"
import { gzipSync, gunzipSync } from "zlib"

// ~700 KB per chunk: sotto il limite ~1 MB di KV con margine per l'overhead base64.
const CHUNK_BYTES = 700 * 1024

type DatasetMeta = { chunks: number; ts: number }

export async function writeDataset<T>(key: string, data: T): Promise<void> {
  const gz = gzipSync(Buffer.from(JSON.stringify(data)))
  const chunks: string[] = []
  for (let i = 0; i < gz.length; i += CHUNK_BYTES) {
    chunks.push(gz.subarray(i, i + CHUNK_BYTES).toString("base64"))
  }

  // Scrive prima i chunk, poi il meta: se qualcosa fallisce a meta' il meta
  // vecchio continua a puntare a dati coerenti.
  await Promise.all(chunks.map((c, i) => kv.set(`${key}:chunk:${i}`, c)))
  const meta: DatasetMeta = { chunks: chunks.length, ts: Date.now() }
  await kv.set(`${key}:meta`, meta)
}

export async function readDataset<T>(
  key: string,
  ttlMs?: number,
): Promise<{ data: T; ts: number } | null> {
  const meta = await kv.get<DatasetMeta>(`${key}:meta`)
  if (!meta || !meta.chunks) return null
  if (ttlMs != null && Date.now() - meta.ts >= ttlMs) return null

  const parts = await Promise.all(
    Array.from({ length: meta.chunks }, (_, i) => kv.get<string>(`${key}:chunk:${i}`)),
  )
  if (parts.some(p => p == null)) return null

  const gz = Buffer.concat(parts.map(p => Buffer.from(p as string, "base64")))
  const json = gunzipSync(gz).toString()
  return { data: JSON.parse(json) as T, ts: meta.ts }
}

// ─── Stato incrementale del cron di warming ────────────────────────────────────
// L'accumulatore dei record (che cresce fino a diversi MB) NON sta nello stato:
// verrebbe rifiutato dal limite ~1 MB/chiave. Viene salvato via writeDataset in
// una chiave di staging "<key>:staging", chunkata e gzippata come il dataset
// finale. Lo stato tiene solo i puntatori.

export type WarmState = {
  nextPage: number        // prossima pagina da scaricare (1-indexed)
  totalPages: number      // pagine totali attese
  startedTs: number       // quando e' iniziato questo ciclo di warming
}

export async function readWarmState(key: string): Promise<WarmState | null> {
  return (await kv.get<WarmState>(`${key}:warm`)) ?? null
}

export async function writeWarmState(key: string, state: WarmState): Promise<void> {
  await kv.set(`${key}:warm`, state)
}

export async function clearWarmState(key: string): Promise<void> {
  await kv.del(`${key}:warm`)
}
