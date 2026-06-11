import { NextResponse } from "next/server"
import { fetchAllPages, getBaseUrl, PIPELINE_ID } from "@/lib/relatia"

// Su Vercel Hobby il default e' 10s: troppo poco per scaricare tutti i deal dal CRM.
export const maxDuration = 60

export async function GET() {
  try {
    const base = getBaseUrl()
    const deals = await fetchAllPages<any>(
      `${base}/api/deals/?pipeline_id=${PIPELINE_ID}&page_size=300`
    )
    return NextResponse.json({ deals })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
