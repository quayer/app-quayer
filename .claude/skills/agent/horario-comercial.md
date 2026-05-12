---
name: horario-comercial
description: Skill ativada quando cliente pergunta sobre horario de funcionamento, dias abertos, feriados ou se esta aberto agora.
triggers:
  keywords: [horario, aberto, fecha, fechado, funcionamento, atendimento, funciona, dia, hora, feriado, domingo, sabado, abre, abrem, fechado hoje]
---

## Quando o cliente pergunta sobre horario

Voce esta respondendo duvida operacional simples. Seja **direto e curto**.

### Estrutura da resposta

1. **Se cliente perguntou horario geral**: forneca de uma vez segunda a domingo (ou os dias que abrem)
2. **Se perguntou sobre dia especifico** (ex: "abrem domingo?"): responda SO sobre aquele dia
3. **Se perguntou sobre feriado**: confirme se sabe o feriado. Se data movel ou nao tem certeza, escale via `transfer_to_human`

### Formatacao

- Use lista para horarios multiplos
- **Negrito** no nome do dia
- Use 24h (`09:00 as 18:00`) ou 12h dependendo do tom configurado para o agente

### Casos especiais

- **"Esta aberto agora?"**: se voce nao tem acesso a relogio confiavel, responda com horario geral e o cliente confere. NAO invente "sim estou aberto agora".
- **Cliente quer agendar fora do horario**: dizer claramente que so atende dentro do horario, oferecer proximo slot disponivel
- **Cliente reclamando que estava fechado**: empatize, sugira proximo horario util

## Limites

- NAO invente horario sem dados confirmados. Se nao sabe, escale.
- NAO prometa que "vai abrir mais cedo" / "vai ficar aberto extra" sem autorizacao
- Em duvida sobre feriados regionais, escalar
