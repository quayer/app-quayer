# Skill: Metricas Financeiras (Modulo 7 — Capsula One)

---
dominio: financeiro, metricas, unit economics, CAC, LTV
modulo: 7
fonte: Capsula One — Thomaz Martins
---

## Quando usar
- Quando o usuario precisa calcular CAC (Custo de Aquisicao de Clientes)
- Quando precisa calcular LTV (Lifetime Value)
- Quando quer avaliar se LTV/CAC >= 3 (regra de ouro)
- Quando discute cash burn, runway ou fluxo de caixa
- Quando precisa montar planilha de Unit Economics
- Quando quer entender se o modelo de negocio para de pe financeiramente
- Quando esta preparando metricas para apresentar a investidores

## Framework Core

### CAC — Custo de Aquisicao de Clientes

**Formula:**
```
CAC = Total de custos de Marketing + Vendas (no periodo) / Novos clientes adquiridos (no periodo)
```

**O que entra no calculo (de cima para baixo):**
- Salarios da equipe de marketing e vendas (SDR, Closer, CMO)
- Ferramentas (CRM, Google/Face Ads, automacao)
- Custo de representantes, viagens, telefone
- Sites, landing pages, campanhas
- Unidades de demonstracao
- Suporte tecnico de venda
- Custo de oportunidade dos founders
- Comissoes de parceiros de canal

**O que NAO entra:**
- Custos operacionais (administrativo, contabilidade, local)
- Custos de produto/infraestrutura
- Customer Success (separar se possivel — entra no LTV, nao no CAC)

**Regras:**
- Calcular de cima para baixo (total de custos / clientes), NAO de baixo para cima (rastrear cada cliente)
- Incluir leads que nao converteram — fazem parte do funil
- Dividir por clientes NOVOS, nao base total
- Periodicidade ideal: mensal. Se instavel, usar trimestral

**Exemplo:**
```
Marketing direto (SEO, blog, social): R$50.000
Marketing de saida (ads, busca paga):  R$100.000
Design/campanhas:                       R$100.000
Parceria de marketing:                  R$50.000
Equipe de vendas:                       R$90.000
---
Total Marketing + Vendas:               R$390.000/ano
Clientes novos no ano:                  5.000
CAC = R$390.000 / 5.000 = R$78 por cliente
```

### LTV — Lifetime Value

#### Modelo Venda Unica
```
LTV = Lucro Bruto do periodo / Total de clientes do periodo
Lucro Bruto = Receita - Impostos - Custos variaveis de producao
```

**Exemplo:**
```
Receita mensal: R$10.000
Impostos: R$1.000 | Producao: R$2.000
Lucro bruto: R$7.000
Clientes: 70
LTV = R$7.000 / 70 = R$100
```

#### Modelo Assinatura (Recorrencia)
```
LTV = (Lucro unitario/mes) x (Meses de contrato) x (1 - Churn)
```

**Exemplo:**
```
Lucro unitario/mes: R$100
Contrato: 24 meses
Churn: 10%
LTV nominal = R$100 x 24 x 0.9 = R$2.160
```

#### Ajuste a Valor Presente (obrigatorio para assinatura)
```
LTV ajustado = LTV nominal / (1 + taxa de custo de capital)^anos
```

**Taxa de custo de capital para startups:** 25% a 50% ao ano (risco alto)

**Exemplo:**
```
LTV nominal: R$2.160
Taxa: 25% ao ano | Periodo: 2 anos
LTV ajustado = R$2.160 / (1.25)^2 = R$2.160 / 1.5625 = R$1.382
```

**Por que ajustar?** O CAC e pago HOJE. O LTV e recebido ao longo de meses. Se o valor futuro nao for muito maior que o custo presente, melhor colocar o dinheiro num investimento tradicional.

### Regra de Ouro: LTV/CAC >= 3

```
LTV / CAC >= 3  →  Modelo saudavel, escalavel
LTV / CAC < 3   →  Margem insuficiente para cobrir custos operacionais
LTV / CAC < 1   →  Pagando para ter cliente (insustentavel)
```

**Por que 3x e nao 1x?**
- CAC so contempla marketing + vendas
- Custos operacionais (administrativo, infra, equipe) nao estao na conta
- Descasamento temporal: CAC e pago hoje, LTV entra ao longo de meses
- Precisa de margem para fluxo de caixa saudavel

**Anti-exemplo:** Pets.com — gastou milhoes em propaganda no Super Bowl (CAC altissimo) sem ter comprovado LTV. A conta nao fechou e a empresa quebrou.

### Cash Burn & Runway

**Cash Burn (Queima de Caixa):**
```
Cash Burn Mensal = Total de saidas - Total de entradas (no mes)
```

**Runway (Pista de Decolagem):**
```
Runway = Caixa disponivel / Cash Burn mensal
Ex: R$300.000 caixa / R$50.000 burn = 6 meses de runway
```

### Unit Economics — Planilha Integrada

**Estrutura recomendada:**

1. **Fluxo de Caixa** (base):
   - Receita mensal
   - Impostos sobre faturamento
   - Custos administrativos (salarios, infra)
   - Custos de produto (dev, nuvem)
   - Despesas de marketing (pessoas + ferramentas + ads)
   - Despesas de vendas (SDR, Closer, CRM)
   - Despesas de Customer Success (separar!)
   - = Cash Burn mensal

2. **Calculo LTV** (derivado do fluxo):
   - Receita total / clientes = receita unitaria
   - Tirar impostos e custos variaveis
   - Multiplicar por tempo de contrato
   - Descontar churn e trazer a valor presente

3. **Calculo CAC** (derivado do fluxo):
   - Somar todas despesas de marketing + vendas
   - Excluir Customer Success se nao separado
   - Dividir por clientes novos do periodo

4. **LTV/CAC evolucao mensal:**
   - Acompanhar tendencia: CAC deve cair, LTV deve subir
   - Meta: atingir e sustentar >= 3

### Evolucao Saudavel da Startup

```
Mes 1-6:   LTV/CAC < 1 (normal, testando)
Mes 6-12:  LTV/CAC 1-2 (melhorando, otimizando)
Mes 12-18: LTV/CAC 2-3 (proximo do PMF)
Mes 18+:   LTV/CAC >= 3 (PMF comprovado, pronto para growth)
```

**Alavancas para melhorar:**
- Reduzir churn → aumenta LTV
- Aumentar tempo de retencao → aumenta LTV
- Otimizar canais de aquisicao → reduz CAC
- Automatizar processos de venda → reduz CAC
- Referral no produto → reduz CAC
- Cross-sell/upsell → aumenta LTV

## Aplicacao ao Quayer
- **Modelo de receita:** Assinatura mensal (SaaS), planos escalonados por numero de atendentes/conexoes WhatsApp
- **CAC estimado:** Marketing (Instagram Ads + parceria influencers) + tempo do founder em demos = calcular mensalmente
- **LTV estimado:** Ticket medio mensal x meses de retencao (proxy: 12 meses contrato) x (1 - churn) ajustado a valor presente (taxa 25-50%)
- **Meta LTV/CAC:** Comecar medindo desde o primeiro cliente pagante. Target: atingir 3x em 12-18 meses
- **Cash burn:** Manter planilha mensal — infra (Supabase, VPS), ferramentas, tempo do founder
- **Runway:** Sem capital externo, runway = receita de clientes + reservas pessoais. Critico: validar LTV/CAC antes de queimar
- **Alavanca principal:** Churn baixo (barbearia que adota = dificil trocar) + referral organico (barbeiros se conhecem)
