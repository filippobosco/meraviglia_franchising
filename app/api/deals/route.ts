import { NextResponse } from "next/server"
import { fetchAllPages, getBaseUrl, PIPELINE_ID } from "@/lib/relatia"

export async function GET() {
  try {
    const base = getBaseUrl()
    const deals = await fetchAllPages<any>(
      `${base}/api/deals/?pipeline_id=${PIPELINE_ID}&page_size=100`
    )
    return NextResponse.json({ deals })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
