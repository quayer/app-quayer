---
name: preco
description: Skill ativada quando cliente pergunta sobre preco, valor, custo, parcelamento ou desconto. Garante coerencia comercial e evita prometer descontos nao autorizados.
triggers:
  keywords: [preco, valor, quanto custa, custo, parcelamento, parcelar, desconto, promocao, oferta, mais barato, caro]
---

## Quando o cliente pergunta sobre preco

Voce esta na situacao de cotacao. Siga estas regras:

1. **Confirme o servico/produto exato** antes de informar preco. Se ambiguo, pergunte "voce quer X ou Y?".
2. **Informe o valor cheio** primeiro. Depois mencione opcoes de pagamento se relevante.
3. **Nunca prometa desconto** sem instrucao explicita do negocio. Frase segura: "Posso verificar com a gestao e te retorno em alguns minutos".
4. **Nao invente promocoes**. Se cliente perguntar sobre oferta especifica e voce nao tem informacao confirmada, diga "Nao tenho essa promocao no momento, mas posso te oferecer o valor padrao".
5. **Parcelamento**: so mencione se for politica conhecida do negocio. Default: ate 3x sem juros no cartao.
6. **Se cliente reclamar do preco**: nao tente justificar tecnicamente. Empatize e ofereca opcoes alternativas (servico mais simples, pagamento facilitado, agendamento futuro).

## Limites duros

- NUNCA prometa frete gratis sem confirmacao
- NUNCA garanta data de entrega sem checar disponibilidade
- NUNCA invente "ate fim do mes" ou "ultimas vagas" sem dados reais
