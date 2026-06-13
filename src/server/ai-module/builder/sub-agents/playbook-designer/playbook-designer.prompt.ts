import type { PlaybookDesignerInput } from './playbook-designer.sub-agent'

export const PLAYBOOK_DESIGNER_SYSTEM = `Você cria planos de atendimento para agentes de atendimento no WhatsApp.

Responda APENAS com JSON válido, sem markdown, seguindo este contrato:
{
  "status": "proposed",
  "objective": "...",
  "niche": "...",
  "stages": [{ "id": "qualificacao", "title": "Qualificar", "goal": "..." }],
  "questions": [{
    "id": "pergunta_1",
    "stageId": "qualificacao",
    "text": "Uma pergunta curta?",
    "purpose": "O que essa pergunta descobre",
    "variableKey": "campo_capturado",
    "skipWhenKnown": "Quando pular",
    "required": true
  }],
  "variables": [{ "key": "campo_capturado", "label": "Campo capturado", "type": "text", "source": "default", "reviewRequired": true }],
  "skipRules": [{ "questionId": "pergunta_1", "condition": "campo_capturado já conhecido", "reason": "Evitar repetição" }],
  "successCriteria": ["..."],
  "handoffTriggers": ["..."],
  "toolTriggers": [{ "capability": "...", "toolKey": "...", "when": "...", "requiredVariables": ["campo_capturado"], "fallback": "...", "active": false }],
  "objectionRules": [{ "objection": "...", "responseGuidance": "..." }],
  "doRules": ["..."],
  "dontRules": ["..."],
  "sourceRefs": [{ "type": "user", "label": "..." }]
}

Regras:
- Use português do Brasil.
- Sugira 3 a 5 perguntas principais, específicas ao nicho e objetivo.
- Uma pergunta por vez. Não faça perguntas duplas.
- Cada pergunta deve capturar exatamente uma variável.
- Toda pergunta precisa explicar quando deve ser pulada se a informação já estiver no contexto.
- Marque defaults incertos com "[REVISAR]" no texto da regra ou critério, não como comentário fora do JSON.
- Respeite os limites conhecidos acima dos objetivos comerciais. Se a fonte indicar vendido/esgotado/indisponível, não trate visita, compra ou disponibilidade como promessa padrão; qualifique interesse e encaminhe para humano/lista de interesse/alternativas.
- Em WhatsApp, não pergunte telefone como qualificação padrão: o número do lead já vem do canal. Só peça outro telefone se o contexto exigir contato alternativo.
- Ferramentas só entram em toolTriggers se aparecerem nas capacidades informadas.`

function listBlock(title: string, values: readonly string[]): string {
  if (values.length === 0) return `${title}: nenhum`
  return `${title}:\n${values.map((value) => `- ${value}`).join('\n')}`
}

export function buildPlaybookDesignerUserMessage(
  input: PlaybookDesignerInput,
): string {
  return `Crie um ConversationBlueprint para este agente.

Objetivo: ${input.objective}
Nicho: ${input.niche}

Contexto do negócio:
${input.businessContext.length > 0 ? input.businessContext.map((value) => `- ${value}`).join('\n') : '- Sem contexto adicional confirmado.'}

${listBlock('Capacidades/ferramentas ativas ou previstas', input.capabilities)}

${listBlock('Serviços/escopo conhecidos', input.knownServices)}

${listBlock('Regras e limites conhecidos', input.knownLimits)}

Retorne só o JSON do blueprint.`
}
