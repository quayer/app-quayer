# PRÓXIMAS AÇÕES - QUAYER VALIDAÇÃO DE DOR

**Status**: Pesquisa de mercado concluída - Dor VALIDADA  
**Data**: Abril 2026  
**Decisão**: AVANÇAR para Fase 1 de Validação Primária

---

## RESUMO EXECUTIVO - O QUE FOI CONFIRMADO

### Hipótese Original
"Existe um problema significativo de atendimento ao cliente em setores como delivery, e-commerce e telefonia que WhatsApp + IA pode resolver"

### Resultado da Validação
✅ **CONFIRMADO COM ALTA CONFIANÇA**

**Evidências Primárias:**
- 80% dos consumidores deixam marcas por atendimento ruim
- R$ 401 bilhões perdidos/ano (economia significante)
- 58,6% reclamam especificamente de DEMORA (problema que IA resolve)
- Telefonia tem NPS 21 (pior setor Brasil)
- Delivery tem 348k reclamações/ano (volume massivo)
- E-commerce é 22,6% de todas reclamações (oportunidade gigante)

**Fit de Solução**: ✅ Alto
- WhatsApp é canal natural onde problema ocorre
- IA pode triagear 60-80% dos problemas
- Tempo resposta: 28 dias (atual) → <5 minutos (com Quayer)

**Tamanho de Mercado**: ✅ Grande
- Delivery: R$ 2-3M ARR por player
- E-commerce: R$ 8-15M ARR total
- Telefonia: R$ 5-10M ARR por player

---

## FASE 1 - VALIDAÇÃO PRIMÁRIA (PRÓXIMAS 2-4 SEMANAS)

### Objetivo
Confirmar com clientes reais que:
1. Problema que Quayer está resolvendo é urgente para eles
2. Dispostos a testar solução
3. Pode haver fit entre oferta e demanda

### Atividades Específicas

#### ATIVIDADE 1.1: Outreach para Delivery (Semana 1-2)

**Target**: 5 gerentes/líderes de atendimento em delivery

**Empresas prioritárias:**
1. **iFood** (maior - 273k reclamações/ano)
   - LinkedIn: Buscar "atendimento ao cliente iFood São Paulo"
   - Email: Contato via site de carreira + contato geral
   - Pitch: "Tenho ideia para reduzir tempo resposta de 24h para 5 min"

2. **Rappi** (segunda - 41k reclamações/ano)
   - Similar approach

3. **Uber Eats** (terceira - 24k reclamações/ano)

4. **99Food** (crescente - 10k reclamações/ano)

5. **Zé Delivery** (alternativa regional)

**Roteiro de Pitch (3 min):**
```
"Oi [nome], sou [seu nome] da Quayer.

Vi que você lidera atendimento no [empresa].
Encontrei que [empresa] recebe ~[número] reclamações por ano 
sobre demora de resposta e erros de pedido.

A maioria dos clientes espera resposta em <5 minutos.
Vocês conseguem responder em quanto tempo hoje?"

[Escutar resposta]

"Tenho uma ideia que pode reduzir isso drasticamente usando IA + WhatsApp.
Gostaria de conversar 15 minutos?
Posso oferecer um piloto de 1 semana grátis com 100 reclamações reais.

Qual seria melhor para você: [opção A] ou [opção B]?"
```

**Métrica de Sucesso:**
- ✅ 2-3 positivos = avançar
- ⚠️ 1 positivo = iterar pitch
- ❌ 0 positivos = revalidar hipótese

#### ATIVIDADE 1.2: Análise Profunda de Top Problemas (Semana 1-3)

**Objetivo**: Mapear os 20 principais problemas em Reclame Aqui

**Processo:**

```
Para cada setor:

1. Entrar em Reclame Aqui
   └─> [Setor] > [Empresa] > [Reclamações]

2. Analisar top 20 reclamações mais recentes
   ├─ Problema: O quê exatamente está errado?
   ├─ Estrutura: É estruturado ou amorfous?
   ├─ Resolução IA: % estimado que IA poderia resolver
   ├─ Escalation: Quem precisa resolver quando IA não consegue?
   └─ Impacto: Tempo + dinheiro = quanto custaria resolver?

3. Tabular resultados
   └─> Usar template abaixo
```

**Template para Análise:**

```csv
SETOR,EMPRESA,PROBLEMA,FREQUENCIA,ESTRUTURADO?,RESOLVE_IA_%,ESCALATION_PARA,IMPACTO_TEMPO,IMPACTO_$
Delivery,iFood,Pedido chega errado,Frequente,SIM,85%,Reembolso automático,<5min,R$50-100
Delivery,iFood,Demora entrega,Frequente,SIM,70%,Tracking + reembolso,<5min,R$20-50
Delivery,iFood,Falta de contato,Frequente,SIM,90%,Chat automático,<2min,R$0
E-commerce,Mercado Livre,Produto não chega,Frequente,SIM,80%,Portal + rastreamento,<10min,R$100-200
E-commerce,Mercado Livre,Reembolso atrasado,Frequente,SIM,75%,Triagem automática,<5min,R$200-500
Telefonica,Claro,Cobrança indevida,Muito frequente,SIM,60%,Auditoria + reembolso,<15min,R$100-300
Telefonica,Claro,Internet lenta,Frequente,NÃO,20%,Técnico especializado,30min+,R$0 (diagnóstico)
```

**Deliverable:**
- Planilha com 20+ problemas mapeados
- % de resolução esperado por IA
- Padrões identificados (tipos de problema que IA resolve bem)

**Métrica de Sucesso:**
- ✅ 60%+ dos problemas são estruturados e resolvíveis por IA = go
- ⚠️ 40-60% = considerar iterar modelo
- ❌ <40% = problema maior do que pensado

#### ATIVIDADE 1.3: Desenhando Arquitetura Técnica Mínima (Semana 2-3)

**Objetivo**: Validar que solução é tecnicamente viável em 6-8 semanas

**Decisões a Tomar:**

1. **Integração Reclame Aqui**
   - [ ] API oficial existe? (pesquisar)
   - [ ] Qual complexidade?
   - [ ] Qual tempo desenvolvimento?

2. **Integração WhatsApp Business**
   - [ ] Usar Twilio/Zendesk/outra plataforma?
   - [ ] Ou integração direta API WhatsApp?
   - [ ] Qual tempo setup?

3. **IA Component**
   - [ ] LLM: Claude? GPT? Open source?
   - [ ] Fine-tuning necessário?
   - [ ] Qual % de acurácia esperado?

4. **Fluxo de Escalation**
   - [ ] Como saber quando humano precisa?
   - [ ] Dashboard para atendentes?
   - [ ] Integração com sistema cliente?

5. **Casos de Uso Mínimos (MVP)**
   - Caso 1: Rastreamento de pedido (delivery)
   - Caso 2: Status de reembolso (e-commerce)
   - Caso 3: Status de cobrança (telefonia)

**Deliverable:**
- Diagrama de arquitetura (simples)
- Estimativa de tempo desenvolvimento por componente
- Lista de dependencies externas
- Riscos técnicos identificados

**Métrica de Sucesso:**
- ✅ Arquitetura é simples (6-8 semanas realizável) = go
- ⚠️ Moderadamente complexa (10-12 semanas) = ainda viável
- ❌ Muito complexa (>16 semanas) = revalidar abordagem

---

## FASE 2 - PROTOTIPAGEM (SEMANAS 3-6)

### Objetivo
Construir MVP funcional e demonstrar que solução funciona na prática

### Pré-requisitos (do Final Phase 1)
- [ ] 2-3 contatos interessados em testar
- [ ] 20+ problemas mapeados com % resolução
- [ ] Arquitetura técnica aprovada

### Atividades

#### ATIVIDADE 2.1: MVP Development (Semana 3-5)

**Escopo Mínimo:**
```
Frontend:
  - Chat interface (WhatsApp-like)
  - 3-5 intents principais (rastreamento, reembolso, status)
  - Botão de escalation ("falar com humano")

Backend:
  - API para receber mensagens
  - LLM prompt estruturado
  - Integração com cliente (webhook)

Infrastructure:
  - Deploy simples (Heroku/Railway/AWS)
  - Logging para análise
  - Métricas básicas (taxa resolução, tempo)

Não fazer:
  - UI complexa
  - Integração profunda com sistemas client
  - Multiple languages
  - Mobile app
```

**Sprints:**
- Sprint 1 (Dia 1-3): Core chat + LLM integration
- Sprint 2 (Dia 4-7): Três intents principais
- Sprint 3 (Dia 8-10): Logging + dashboard simples
- Sprint 4 (Dia 11-14): Bugfix + otimização

#### ATIVIDADE 2.2: Integration Testing com Reclame Aqui (Semana 5-6)

**Processo:**
```
1. Obter 100-200 reclamações reais de Reclame Aqui
   └─> Download via API ou scraping (se não tiver API)

2. Feed às reclamações no MVP
   ├─ Testar resposta IA
   ├─ Validar resolução
   ├─ Medir tempo processamento
   └─ Identificar failure modes

3. Classificar resultados:
   ├─ SUCESSO: IA resolveu e cliente ficaria satisfeito
   ├─ PARCIAL: IA resolveu partes, precisa escalation
   ├─ FALHA: IA não conseguiu resolver (humano precisa)
   └─ ERRO: IA respondeu algo errado ou não fez sentido

4. Tabular taxa de sucesso
```

**Métrica de Sucesso:**
- ✅ >65% SUCESSO + PARCIAL = prototipo validado, seguir para piloto
- ⚠️ 50-65% = precisa iterar, mas viável
- ❌ <50% = volta a revisão de abordagem

---

## FASE 3 - PILOTO COM CLIENTE (SEMANAS 7-8)

### Objetivo
Obter validação de cliente real e métricas reais

### Pré-requisitos
- [ ] MVP funcionando
- [ ] Taxa de sucesso >60%
- [ ] Cliente interessado confirmado

### Atividades

#### ATIVIDADE 3.1: Onboarding do Cliente (Dia 1-2)

**O que fazer:**
1. Reunião kickoff com líder atendimento
   - Apresentar MVP
   - Definir escopo piloto (100 reclamações, 1 semana)
   - Explicar como será medido

2. Setup técnico
   - Integrar com sistema cliente (se necessário)
   - Treinar 2-3 atendentes no dashboard
   - Setup de logging

3. Go-live
   - Ativar IA no canal
   - Monitorar primeiras horas
   - Feedback imediato

#### ATIVIDADE 3.2: Execução Piloto (Dia 3-7)

**Monitoramento diário:**
```
Métrica                | Alvo    | Dia 1 | Dia 2 | Dia 3 | ... | Dia 7
Taxa Resolução IA      | 60%+    |       |       |       |     |
Taxa Escalation        | <20%    |       |       |       |     |
Tempo Resposta Média   | <5min   |       |       |       |     |
Customer Satisfaction  | >75%    |       |       |       |     |
Bugs encontrados       | <2/dia  |       |       |       |     |
```

**Iterar rápido:**
- Daily standup com cliente
- Fix bugs no mesmo dia
- Ajustar prompts se necessário

#### ATIVIDADE 3.3: Coleta de Feedback (Dia 7)

**Reunião de encerramento:**
```
Perguntas para cliente:

1. Quantas reclamações foram processadas?
2. Qual % o sistema resolveu sozinho?
3. Quais foram os erros mais comuns?
4. Seus atendentes acharam útil?
5. Você pagaria por isso? Quanto?
6. Gostaria de continuar o piloto?
7. Qual seria o próximo passo para você?
```

**Métrica de Sucesso:**
- ✅ Cliente quer continuar/expandir = IR PARA GO-TO-MARKET
- ⚠️ Cliente quer iterar mas não vai pagar = volta ao drawing board
- ❌ Cliente não quer mais = documentar por quê + voltar

---

## DECISÃO GATE - APÓS FASE 3

### Cenário A: Piloto Bem-Sucedido ✅

**Evidência:**
- Customer feedback positivo
- Métricas acima de alvo (>65% resolução)
- Cliente aberto a pagamento/expansão

**Ação:**
```
1. Preparar Case Study
   - Números do piloto
   - Depoimento do cliente
   - Screenshots da solução

2. Estruturar Modelo de Cobrança
   - % da economia (ex: 20% de R$ 10M = R$ 2M)
   - Ou valor fixo mensal
   - Ou por ticket resolvido

3. Onboard 2-3 novos clientes em paralelo
   - Documentação de setup
   - Suporte pós-venda
   - Iterações rápidas

4. Planejar Fase de Escala
   - Contratação de time
   - Suporte 24/7
   - Integração com mais plataformas
```

**Próximo: IR PARA GO-TO-MARKET**

---

### Cenário B: Piloto Parcialmente Bem-Sucedido ⚠️

**Evidência:**
- Cliente viu valor mas necessita mudanças
- Taxa de resolução 50-65% (precisa melhorar)
- Cliente quer continuar com iterações

**Ação:**
```
1. Documentar feedback detalhadamente
2. Priorizar top 3 melhorias
3. Iterar em 2-3 semanas
4. Teste novamente
5. Decisão final
```

**Próximo: ITERAR + RETRY PILOTO**

---

### Cenário C: Piloto Fracassado ❌

**Evidência:**
- Taxa de resolução <50%
- Cliente não vê valor
- Problemas técnicos não resolvidos

**Ação:**
```
1. Análise post-mortem
   - Por que falhou?
   - Era hipótese errada?
   - Ou execução inadequada?

2. Decisão:
   - Pivotar para outro setor (e-commerce)?
   - Pivotar para outro approach (não IA)?
   - Pivotar para outro problema?

3. Documentar learnings
```

**Próximo: PIVOTAR OU PARAR**

---

## GO-TO-MARKET (SE PILOTO SUCESSO)

### Semanas 9-12: Estruturação

#### Atividade 4.1: Time & Operações
```
Contratar:
- 1 Sales Engineer (conhecer clientes)
- 1 Support/Success (pós-venda)
- 1 Product Manager (roadmap)

Preparar:
- Processo de onboarding documentado
- SLA de suporte
- Pricing e contrato padrão
```

#### Atividade 4.2: Marketing & Vendas
```
Preparar:
- Case study publicado
- Landing page
- Pitch deck
- Demo video (2-3 min)

Iniciar:
- Outreach para próximos 10-20 prospects
- Webinar/demo session
- Partnerships (consultores, agências)
```

#### Atividade 4.3: Roadmap Técnico
```
Prioridades Próximas:
1. Mais intents de IA (top 10 problemas)
2. Analytics dashboard melhorado
3. Integração com mais plataformas (além Reclame)
4. Suporte a múltiplos idiomas (futuro)
```

---

## PLANO TÁTICO RESUMIDO - 12 SEMANAS

```
SEMANA 1-2    | FASE 1a: Outreach Delivery                    | Objetivo: 2-3 interessados
SEMANA 1-3    | FASE 1b: Análise Problemas Reclame            | Objetivo: Mapa de 20+ problemas
SEMANA 2-3    | FASE 1c: Design Arquitetura Técnica           | Objetivo: Viabilidade confirmada
              |
SEMANA 3-6    | FASE 2: MVP Development                       | Objetivo: Taxa sucesso >60%
SEMANA 5-6    | Testing com 100-200 reclamações reais         |
              |
SEMANA 7-8    | FASE 3: Piloto com Cliente Real               | Objetivo: Feedback + ROI
SEMANA 8      | Decision Gate (Go / Iterate / Pivot)          |
              |
SEMANA 9-12   | FASE 4: Go-to-Market (SE APROVADO)            | Objetivo: 3+ clientes pagantes
```

---

## CHECKPOINTS - O QUE VERIFICAR REGULARMENTE

### Weekly (Todo vencimento de semana)
- [ ] Outreach pipeline: quantas conversas agendadas?
- [ ] MVP: qual % do planejado foi entregue?
- [ ] Blockers técnicos: quais? Foram resolvidos?
- [ ] Feedback do cliente piloto: satisfação?

### Bi-weekly (A cada 2 semanas)
- [ ] Taxa de sucesso do MVP: melhorou?
- [ ] Top 3 bugs: foram consertados?
- [ ] Competidores: algo novo no mercado?
- [ ] Pivots necessários: sim/não?

### Monthly
- [ ] Você ainda acredita que vai funcionar?
- [ ] Os números ainda fazem sentido?
- [ ] Contexto do mercado mudou?
- [ ] Mudança de estratégia necessária?

---

## CENÁRIOS DE RISCO - O QUE PODE DAR ERRADO

### Risco 1: Clientes não respondem

**Sintoma**: Ninguém quer conversar/testar

**Mitigation**:
- Ajustar positioning/pitch
- Tentar contatos diferentes (CTO, CFO vs gerente atendimento)
- Reconhecer que talvez não seja problema urgente (pivotar)

**Ação se ocorrer**: PARAR/PIVOTAR (Semana 4)

---

### Risco 2: IA não consegue resolver problemas

**Sintoma**: Taxa de sucesso <50% mesmo após iteração

**Mitigation**:
- Aumentar escopo training data
- Usar modelo mais poderoso (Claude 3.5 vs anterior)
- Híbrido: humano + IA em lugar de IA pura

**Ação se ocorrer**: REDESIGN ABORDAGEM (Semana 6)

---

### Risco 3: Integração técnica muito complexa

**Sintoma**: Cada cliente precisa integração custom (6+ semanas)

**Mitigation**:
- Usar plataformas intermediárias (Zapier, Make.com)
- API wrapper genérico
- Começar com conexão simples (CSV export)

**Ação se ocorrer**: ITERAR ARQUITETURA (Semana 3-4)

---

### Risco 4: Competição/Market Timing

**Sintoma**: Descobrir que Zendesk, Intercom ou outro está fazendo isso

**Mitigation**:
- Diferencial: especialização em delivery/e-commerce
- Velocidade: entregar mais rápido
- Customização: solução feita exatamente para setor

**Ação se ocorrer**: ACELERAR GO-TO-MARKET ou PIVOTAR DIFERENCIAL

---

## MÉTRICAS CRÍTICAS - GUARDAR RELIGIOSAMENTE

```
SEMANA 1: 
- Leads gerados (outreach)
- Taxa de resposta %

SEMANA 3:
- Problemas mapeados (quantidade)
- % que IA consegue resolver (estimado)

SEMANA 6:
- MVP pronto? SIM/NÃO
- Taxa de sucesso com dados reais %

SEMANA 8:
- Cliente piloto: taxa resolução %
- NPS/CSAT score
- Cliente quer pagar? SIM/NÃO

SEMANA 12:
- Clientes pagantes (quantidade)
- ARR total (R$)
- Churn rate (%)
```

---

## PRÓXIMO PASSO IMEDIATO

### THIS WEEK (DIAS 1-5)

```
SEGUNDA:
- [ ] Revisar pesquisa com team
- [ ] Validar números com CEO/Product Lead
- [ ] Confirmar que todos acreditam na oportunidade

TERÇA:
- [ ] Começar outreach para delivery
  └─ Target: iFood, Rappi, Uber Eats
  └─ Buscar: Gerente ou Lead de Atendimento
  └─ Modo: LinkedIn + Email + WhatsApp

QUARTA-SEXTA:
- [ ] Análise paralela: 20 reclamações top Reclame Aqui
- [ ] Start design arquitetura técnica
- [ ] Agendas primeiras conversas (esperando feedback)
```

### NEXT WEEK (DIAS 6-12)

```
- [ ] 3+ conversas agendadas com prospects
- [ ] Mapa de 20+ problemas completo
- [ ] Arquitetura técnica validada
- [ ] Decision: PROSSEGUIR OU PIVOTAR?
```

---

## CONCLUSÃO

A pesquisa validou que existe uma dor real e massiva no mercado brasileiro de atendimento ao cliente. 

**Quayer está no momento certo para atacar este mercado.**

A abordagem proposta (Validação → Prototipagem → Piloto → Go-to-Market) permite **desriscar progressivamente** enquanto mantém velocidade.

**Recomendação final**: AVANÇAR COM CONFIANÇA para Fase 1.

Se em 2-3 semanas conseguir 2-3 conversas positivas com prospects reais em delivery, a confiança aumenta exponencialmente.

---

**Documento preparado para**: Gabriel Rizzatto, Fundador Quayer  
**Data**: Abril 2026  
**Próxima Review**: Semana 2 (Quarta 10 de Abril)

