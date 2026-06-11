"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
  regione: string
  professione: string | null
  budget: string | null
  azienda: string | null
  tipo_attivita: string | null
  meta_campaign_name: string | null
  meta_platform: string | null
}

type DrawerState = {
  open: boolean
  title: string
  contacts: Contact[]
}

type StageDeal = {
  dealId: string
  contactId: string | null
  full_name: string
  email: string | null
  phone: string | null
  dealCreatedAt: string
}

type StageDrawerState = {
  open: boolean
  stageName: string
  deals: StageDeal[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  })
}

function defaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 1)
  return {
    from: start.toISOString().split("T")[0],
    to: end.toISOString().split("T")[0],
  }
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item) || "Non specificata"
    ;(acc[k] = acc[k] ?? []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ─── Pipeline stages config ───────────────────────────────────────────────────

const STAGES = [
  { id: "9d5809f6-b247-43fd-bc4e-75450bf4f523", name: "Nuovo contatto",          color: "#3B6FE8" },
  { id: "0c2442be-b683-4bef-be3c-33522713a604", name: "Calendly",                color: "#3B6FE8" },
  { id: "ded144c7-fac6-493d-aec7-60c1aa9e21ea", name: "NR1",                     color: "#6B7280" },
  { id: "e57b9c89-28b2-4e8b-b6a9-950376d512be", name: "NR2",                     color: "#6B7280" },
  { id: "a6fb6f49-7122-48d7-9f92-a82b0ce7d88a", name: "Mandato spoki",           color: "#3B6FE8" },
  { id: "f3fba568-9dfd-4e23-b322-44e5bb738aa0", name: "In gestione",             color: "#F59E0B" },
  { id: "3a37c0ba-331d-46e0-a2f7-630dae05a9aa", name: "Avvisa lui",              color: "#F59E0B" },
  { id: "ae7fb45e-9e75-4227-b77a-6c187c7cc783", name: "Perso (post avvisa lui)", color: "#EF4444" },
  { id: "b122f93c-c0b7-4f0b-b9ed-f28060723256", name: "Numero errato",           color: "#6B7280" },
  { id: "6f98bb1e-ba84-496a-847f-b56f1ee95415", name: "Fuori target",            color: "#EF4444" },
  { id: "31f6b9af-3415-492b-8bf4-38c632dc43a9", name: "Fissato",                 color: "#F59E0B" },
  { id: "1453672f-f0bb-471e-b211-c955f7924be1", name: "Perso",                   color: "#EF4444" },
  { id: "57cfe0e0-f6bd-487a-8287-dd97ff107ffd", name: "Perso dopo one-to-one",   color: "#EF4444" },
  { id: "d19a4f6c-dec5-48d8-8410-d043d724aabe", name: "Affiliati",               color: "#4CAF7D" },
]

const CLICKABLE_STAGE_IDS = new Set([
  "9d5809f6-b247-43fd-bc4e-75450bf4f523",
  "f3fba568-9dfd-4e23-b322-44e5bb738aa0",
  "3a37c0ba-331d-46e0-a2f7-630dae05a9aa",
  "31f6b9af-3415-492b-8bf4-38c632dc43a9",
  "d19a4f6c-dec5-48d8-8410-d043d724aabe",
  "ded144c7-fac6-493d-aec7-60c1aa9e21ea",
  "e57b9c89-28b2-4e8b-b6a9-950376d512be",
])

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E8EAF0",
      borderRadius: 8,
      padding: "20px 24px",
    }}>
      <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 8 }}>{label}</p>
      <p style={{ color: "#1A1A2E", fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
  total,
  onClickCount,
}: {
  title: string
  rows: { label: string; contacts: Contact[] }[]
  total: number
  onClickCount: (label: string, contacts: Contact[]) => void
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E8EAF0",
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8EAF0" }}>
        <h2 style={{ color: "#1A1A2E", fontWeight: 600, fontSize: 15 }}>{title}</h2>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F8F9FB" }}>
            <th style={{ padding: "10px 20px", textAlign: "left", color: "#6B7280", fontSize: 12, fontWeight: 600 }}>Nome</th>
            <th style={{ padding: "10px 20px", textAlign: "right", color: "#6B7280", fontSize: 12, fontWeight: 600 }}>Lead</th>
            <th style={{ padding: "10px 20px", textAlign: "right", color: "#6B7280", fontSize: 12, fontWeight: 600 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.label} style={{ borderTop: "1px solid #E8EAF0", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
              <td style={{ padding: "10px 20px", color: "#1A1A2E", fontSize: 14 }}>{row.label}</td>
              <td style={{ padding: "10px 20px", textAlign: "right" }}>
                <button
                  onClick={() => onClickCount(row.label, row.contacts)}
                  style={{
                    color: "#3B6FE8", fontWeight: 600, fontSize: 14,
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                  }}
                >
                  {row.contacts.length}
                </button>
              </td>
              <td style={{ padding: "10px 20px", textAlign: "right", color: "#6B7280", fontSize: 14 }}>
                {total > 0 ? ((row.contacts.length / total) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label} </span>
      <span style={{ color: "#1A1A2E", fontSize: 13 }}>{value}</span>
    </div>
  )
}

function LeadDrawer({
  drawer,
  onClose,
  crmBase,
}: {
  drawer: DrawerState
  onClose: () => void
  crmBase: string
}) {
  if (!drawer.open) return null
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40,
        }}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
        background: "#fff", zIndex: 50, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #E8EAF0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <h3 style={{ color: "#1A1A2E", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
              {drawer.title}
            </h3>
            <p style={{ color: "#6B7280", fontSize: 13 }}>{drawer.contacts.length} lead</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6B7280", fontSize: 22, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {drawer.contacts.map((c, i) => (
            <div key={c.id} style={{
              padding: "14px 24px",
              borderBottom: i < drawer.contacts.length - 1 ? "1px solid #F0F0F5" : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <a
                  href={`${crmBase}/contacts/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#3B6FE8", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                >
                  {c.full_name || "—"}
                </a>
                <span style={{ color: "#6B7280", fontSize: 12 }}>{formatDate(c.created_at)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                {c.phone && <InfoLine label="Telefono" value={c.phone} />}
                {c.email && <InfoLine label="Email" value={c.email} />}
                <InfoLine label="Regione" value={c.regione} />
                {c.professione && <InfoLine label="Professione" value={c.professione} />}
                {c.budget && <InfoLine label="Budget" value={c.budget} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function StageLeadDrawer({
  drawer,
  onClose,
  contactMap,
  crmBase,
}: {
  drawer: StageDrawerState
  onClose: () => void
  contactMap: Map<string, Contact>
  crmBase: string
}) {
  if (!drawer.open) return null
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40 }}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
        background: "#fff", zIndex: 50, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
      }}>
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #E8EAF0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <h3 style={{ color: "#1A1A2E", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
              {drawer.stageName}
            </h3>
            <p style={{ color: "#6B7280", fontSize: 13 }}>{drawer.deals.length} deal</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6B7280", fontSize: 22, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {drawer.deals.map((deal, i) => {
            const contact = deal.contactId ? contactMap.get(deal.contactId) : undefined
            return (
              <div key={deal.dealId} style={{
                padding: "14px 24px",
                borderBottom: i < drawer.deals.length - 1 ? "1px solid #F0F0F5" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <a
                    href={deal.contactId ? `${crmBase}/contacts/${deal.contactId}` : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#3B6FE8", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                  >
                    {deal.full_name || "—"}
                  </a>
                  <span style={{ color: "#6B7280", fontSize: 12 }}>{formatDate(deal.dealCreatedAt)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                  {deal.phone && <InfoLine label="Telefono" value={deal.phone} />}
                  {deal.email && <InfoLine label="Email" value={deal.email} />}
                  {contact && <InfoLine label="Regione" value={contact.regione} />}
                  {contact?.professione && <InfoLine label="Professione" value={contact.professione} />}
                  {contact?.budget && <InfoLine label="Budget" value={contact.budget} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const crmBase = "https://meraviglia.relatiacrm.com"

  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [filterRegione, setFilterRegione] = useState("Tutte")
  const [filterProfessione, setFilterProfessione] = useState("Tutte")
  const [filterBudget, setFilterBudget] = useState("Tutti")

  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: "", contacts: [] })
  const [stageDeals, setStageDeals] = useState<Record<string, StageDeal[]>>({})
  const [stageDrawer, setStageDrawer] = useState<StageDrawerState>({ open: false, stageName: "", deals: [] })
  const [stagesLoading, setStagesLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/contacts")
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const data = await res.json()
      setContacts(data.contacts ?? [])
      setLastUpdated(new Date())
    } catch (e: any) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchStages = useCallback(async () => {
    setStagesLoading(true)
    try {
      const res = await fetch("/api/pipeline-stages")
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const data = await res.json()
      setStageDeals(data.stageDeals ?? {})
    } catch {
      // silent — sezione mostra 0 se fallisce
    } finally {
      setStagesLoading(false)
    }
  }, [])

  useEffect(() => { fetchStages() }, [fetchStages])

  const filtered = useMemo(() => {
    const from = new Date(dateRange.from + "T00:00:00")
    const to = new Date(dateRange.to + "T23:59:59")
    return contacts.filter(c => {
      const d = new Date(c.created_at)
      if (d < from || d > to) return false
      if (filterRegione !== "Tutte" && c.regione !== filterRegione) return false
      if (filterProfessione !== "Tutte" && (c.professione ?? "Non specificata") !== filterProfessione) return false
      if (filterBudget !== "Tutti" && (c.budget ?? "Non specificato") !== filterBudget) return false
      return true
    })
  }, [contacts, dateRange, filterRegione, filterProfessione, filterBudget])

  const regioneOptions = useMemo(() => {
    const s = new Set(contacts.map(c => c.regione))
    return Array.from(s).sort()
  }, [contacts])

  const professioneOptions = useMemo(() => {
    const s = new Set(contacts.map(c => c.professione ?? "Non specificata"))
    return Array.from(s).sort()
  }, [contacts])

  const budgetOptions = useMemo(() => {
    const s = new Set(contacts.map(c => c.budget ?? "Non specificato"))
    return Array.from(s).sort()
  }, [contacts])

  const regioneRows = useMemo(() => {
    const g = groupBy(filtered, c => c.regione)
    return Object.entries(g)
      .map(([label, cs]) => ({ label, contacts: cs }))
      .sort((a, b) => b.contacts.length - a.contacts.length)
  }, [filtered])

  const professioneRows = useMemo(() => {
    const g = groupBy(filtered, c => c.professione ?? "Non specificata")
    return Object.entries(g)
      .map(([label, cs]) => ({ label, contacts: cs }))
      .sort((a, b) => b.contacts.length - a.contacts.length)
  }, [filtered])

  const budgetRows = useMemo(() => {
    const g = groupBy(filtered, c => c.budget ?? "Non specificato")
    return Object.entries(g)
      .map(([label, cs]) => ({ label, contacts: cs }))
      .sort((a, b) => b.contacts.length - a.contacts.length)
  }, [filtered])

  const timeSeries = useMemo(() => {
    const g = groupBy(filtered, c => c.created_at.split("T")[0])
    return Object.entries(g)
      .map(([date, cs]) => ({ date, count: cs.length }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filtered])

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>()
    for (const c of contacts) m.set(c.id, c)
    return m
  }, [contacts])

  const filteredContactIds = useMemo(
    () => new Set(filtered.map(c => c.id)),
    [filtered],
  )

  const dealMatchesFilters = useCallback(
    (deal: { contactId: string | null; dealCreatedAt: string }) => {
      const from = new Date(dateRange.from + "T00:00:00")
      const to = new Date(dateRange.to + "T23:59:59")
      const d = new Date(deal.dealCreatedAt)
      if (d < from || d > to) return false
      if (deal.contactId && filteredContactIds.size > 0) {
        return filteredContactIds.has(deal.contactId)
      }
      return filterRegione === "Tutte"
        && filterProfessione === "Tutte"
        && filterBudget === "Tutti"
    },
    [dateRange, filteredContactIds, filterRegione, filterProfessione, filterBudget],
  )

  const filteredStageDeals = useMemo(() => {
    const out: Record<string, StageDeal[]> = {}
    for (const [stageId, deals] of Object.entries(stageDeals)) {
      out[stageId] = deals.filter(dealMatchesFilters)
    }
    return out
  }, [stageDeals, dealMatchesFilters])

  const filteredStageCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const stage of STAGES) {
      const list = filteredStageDeals[stage.id]
      if (list) {
        out[stage.id] = list.length
      } else {
        out[stage.id] = 0
      }
    }
    return out
  }, [filteredStageDeals])

  const openDrawer = (title: string, cs: Contact[]) => {
    setDrawer({ open: true, title, contacts: cs })
  }

  const openStageDrawer = (stageId: string, stageName: string) => {
    setStageDrawer({ open: true, stageName, deals: filteredStageDeals[stageId] ?? [] })
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px",
    height: 36, fontSize: 13, color: "#1A1A2E", background: "#fff",
    outline: "none", width: "100%", boxSizing: "border-box",
  }
  const filterLabelStyle: React.CSSProperties = {
    fontSize: 12, color: "#6B7280", fontWeight: 500, marginBottom: 6,
  }
  const resetFilters = () => {
    setDateRange(defaultDateRange)
    setFilterRegione("Tutte")
    setFilterProfessione("Tutte")
    setFilterBudget("Tutti")
  }
  const updatedLabel = lastUpdated
    ? (() => {
        const sec = Math.round((Date.now() - lastUpdated.getTime()) / 1000)
        if (sec < 60) return "Aggiornato ora"
        const min = Math.round(sec / 60)
        if (min < 60) return `Aggiornato ${min} min fa`
        return `Aggiornato alle ${lastUpdated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
      })()
    : "In aggiornamento…"

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FB" }}>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #E8EAF0",
        padding: "0 32px", height: 56, display: "flex", alignItems: "center",
      }}>
        <h1 style={{ color: "#1A1A2E", fontWeight: 700, fontSize: 18 }}>
          Meraviglialab
        </h1>
      </div>

      {/* Content */}
      <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Filtri */}
        <div style={{
          background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
          padding: "1.25rem 1.5rem", marginBottom: 24,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            paddingBottom: 14, borderBottom: "1px solid #E5E7EB", marginBottom: 16,
          }}>
            <div>
              <h2 style={{ color: "#1A1A2E", fontWeight: 500, fontSize: 18, lineHeight: 1.2 }}>
                Richieste Franchising
              </h2>
              <div style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>
                Meraviglia Lab
              </div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "#6B7280",
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: loading ? "#9CA3AF" : "#22C55E",
                boxShadow: loading ? "none" : "0 0 0 3px rgba(34,197,94,0.15)",
              }} />
              {loading ? "Aggiornamento…" : updatedLabel}
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 14,
          }}>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={filterLabelStyle}>Dal</span>
              <input
                type="date"
                value={dateRange.from}
                onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={filterLabelStyle}>Al</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={filterLabelStyle}>Regione</span>
              <select value={filterRegione} onChange={e => setFilterRegione(e.target.value)} style={inputStyle}>
                <option value="Tutte">Tutte</option>
                {regioneOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={filterLabelStyle}>Professione</span>
              <select value={filterProfessione} onChange={e => setFilterProfessione(e.target.value)} style={inputStyle}>
                <option value="Tutte">Tutte</option>
                {professioneOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span style={filterLabelStyle}>Budget</span>
              <select value={filterBudget} onChange={e => setFilterBudget(e.target.value)} style={inputStyle}>
                <option value="Tutti">Tutti</option>
                {budgetOptions.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 18,
          }}>
            <button
              onClick={resetFilters}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", color: "#374151",
                border: "1px solid #E5E7EB", borderRadius: 8,
                padding: "6px 14px", height: 34, fontSize: 13, fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Reimposta filtri
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                background: "#247DFF", color: "#fff", border: "none", borderRadius: 8,
                padding: "6px 18px", height: 34, fontSize: 13, fontWeight: 500,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Caricamento…" : "Aggiorna"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
            padding: "12px 16px", color: "#DC2626", fontSize: 14, marginBottom: 24,
          }}>
            Errore: {error}
          </div>
        )}

        {loading && contacts.length === 0 ? (
          <div style={{ textAlign: "center", color: "#6B7280", padding: 80, fontSize: 15 }}>
            <p>Caricamento dati…</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Al primo avvio può richiedere 2–3 minuti. I successivi saranno istantanei.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
              <KpiCard label="Totale Lead" value={filtered.length} />
              <KpiCard label="Con regione compilata" value={filtered.filter(c => c.regione !== "Non specificata").length} />
              <KpiCard label="Con professione compilata" value={filtered.filter(c => c.professione).length} />
              <KpiCard label="Con budget compilato" value={filtered.filter(c => c.budget).length} />
            </div>

            {/* Distribuzione Pipeline */}
            <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 8, padding: "20px 24px", marginBottom: 28 }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ color: "#1A1A2E", fontWeight: 600, fontSize: 15 }}>
                  Distribuzione Pipeline Richieste Franchising
                </span>
              </div>
              {stagesLoading ? (
                <p style={{ color: "#6B7280", fontSize: 14 }}>Caricamento pipeline…</p>
              ) : (
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                  {STAGES.map(stage => {
                    const count = filteredStageCounts[stage.id] ?? 0
                    const clickable = CLICKABLE_STAGE_IDS.has(stage.id)
                    return (
                      <div
                        key={stage.id}
                        onClick={clickable ? () => openStageDrawer(stage.id, stage.name) : undefined}
                        style={{
                          background: "#F8F9FB",
                          border: "1px solid #E8EAF0",
                          borderRadius: 8,
                          padding: "14px 12px",
                          minWidth: 90,
                          textAlign: "center",
                          cursor: clickable ? "pointer" : "default",
                          flexShrink: 0,
                        }}
                      >
                        <p style={{ color: stage.color, fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 6 }}>
                          {count}
                        </p>
                        <p style={{ color: "#6B7280", fontSize: 11, lineHeight: 1.4 }}>
                          {clickable ? (
                            <span style={{
                              borderBottom: "1px dashed #9CA3AF",
                              paddingBottom: 1,
                            }}>
                              {stage.name}
                            </span>
                          ) : stage.name}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Breakdowns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 28 }}>
              <BreakdownTable
                title="Lead per Regione"
                rows={regioneRows}
                total={filtered.length}
                onClickCount={(label, cs) => openDrawer(`Regione: ${label}`, cs)}
              />
              <BreakdownTable
                title="Lead per Professione"
                rows={professioneRows}
                total={filtered.length}
                onClickCount={(label, cs) => openDrawer(`Professione: ${label}`, cs)}
              />
              <BreakdownTable
                title="Lead per Budget"
                rows={budgetRows}
                total={filtered.length}
                onClickCount={(label, cs) => openDrawer(`Budget: ${label}`, cs)}
              />
            </div>

            {/* Time series */}
            <div style={{
              background: "#fff", border: "1px solid #E8EAF0", borderRadius: 8,
              padding: "20px 24px",
            }}>
              <h2 style={{ color: "#1A1A2E", fontWeight: 600, fontSize: 15, marginBottom: 20 }}>
                Andamento Lead nel Tempo
              </h2>
              {timeSeries.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: 14, textAlign: "center", padding: 40 }}>
                  Nessun dato nel periodo selezionato
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timeSeries} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F5" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={d => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ border: "1px solid #E8EAF0", borderRadius: 6, fontSize: 13 }}
                      labelFormatter={d => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
                      formatter={(v: any) => [v, "Lead"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#3B6FE8"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </div>

      {/* Drawer */}
      <LeadDrawer
        drawer={drawer}
        onClose={() => setDrawer(p => ({ ...p, open: false }))}
        crmBase={crmBase}
      />
      <StageLeadDrawer
        drawer={stageDrawer}
        onClose={() => setStageDrawer(p => ({ ...p, open: false }))}
        contactMap={contactMap}
        crmBase={crmBase}
      />
    </div>
  )
}
