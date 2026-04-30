import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(request: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const formData = await request.formData()
    const audio = formData.get("audio") as File | null

    if (!audio || audio.size === 0) {
      return NextResponse.json({ error: "Nenhum áudio recebido." }, { status: 400 })
    }

    // Strip codec parameters — OpenAI rejects "audio/webm;codecs=opus"
    const cleanType = (audio.type.split(";")[0] ?? "audio/webm").trim()
    const ext = cleanType.split("/")[1] ?? "webm"
    const file = new File([audio], `recording.${ext}`, { type: cleanType })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    })

    return NextResponse.json({ text: transcription.text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
