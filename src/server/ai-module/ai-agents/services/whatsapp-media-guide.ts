/**
 * whatsapp-media-guide — ensina o agente a ENVIAR mídia no WhatsApp.
 *
 * Contexto: o pipeline outbound (outbound.service → tag-parser → uazapi-sender)
 * JÁ sabe enviar imagem/vídeo/áudio/documento — basta o agente emitir as TAGS
 * certas no meio da resposta. Sem este guia no system prompt, a capacidade fica
 * DORMENTE (o agente só manda texto). Este bloco ativa a feature sem nenhuma tool
 * nova e sem bypassar a resiliência (rate-limit/retry/dead-letter/bot-echo) do
 * orchestrator.
 *
 * Escopo deliberado: só MÍDIA (foto/galeria/vídeo/áudio/documento). NÃO ensinamos
 * buttons/list/carousel aqui para não alterar o estilo de resposta de quem quer
 * texto puro — esses continuam disponíveis via tag para prompts que os adotem.
 *
 * Guardrail crítico: o agente só pode emitir uma tag de mídia com uma URL REAL
 * (vinda de tool/catálogo/base de conhecimento). Inventar URL gera envio que falha
 * (o orchestrator degrada para texto), então o guia proíbe URLs inventadas.
 *
 * A sintaxe abaixo TEM que casar exatamente com tag-parser.service.ts.
 */

/**
 * Retorna o bloco markdown (estático) com as instruções de envio de mídia.
 * Pensado para ser concatenado cedo no system prompt (prefixo estável =
 * amigável ao prompt cache).
 */
export function renderWhatsAppMediaGuide(): string {
  return [
    '## Envio de mídia no WhatsApp',
    '',
    'Você pode enviar mídia inserindo TAGS no meio da sua resposta — o sistema as',
    'converte em mídia real do WhatsApp. Escreva texto normal antes/depois da tag.',
    '',
    'REGRA ABSOLUTA: só use uma tag de mídia quando tiver uma URL REAL (vinda de uma',
    'tool, do catálogo ou da base de conhecimento). NUNCA invente URLs — se não tiver',
    'a URL, apenas descreva em texto.',
    '',
    '- Foto: `[url da imagem:"https://.../foto.jpg"|"legenda opcional"]`',
    '- Galeria (várias fotos): repita a tag de foto, uma por imagem.',
    '- Vídeo: `[video:https://.../video.mp4|legenda opcional]`',
    '- Áudio: `[audio:"https://.../audio.ogg"]`',
    '- Documento/PDF: `[document:https://.../arquivo.pdf|legenda opcional]`',
  ].join('\n')
}
