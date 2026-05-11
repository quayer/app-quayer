# Skill: Solucao & Produto MVP (Modulo 4 — Capsula One)

## Quando usar
- Quando o usuario esta desenhando o MVP ou primeiro produto
- Quando precisa decidir o que incluir (ou excluir) do MVP
- Quando discute Problem-Solution Fit e como medi-lo
- Quando esta otimizando produto com base em feedback de clientes
- Quando cai na tentacao de construir demais antes de validar

## Framework Core

### Redefinicao da Situacao-Problema

Antes de pensar em produto, reformular a dor como pergunta:

```
"Como podemos [resolver a dor especifica] para [persona] de forma que [cumpra o job melhor]?"
```

**Exemplo EasyTaxi:**
"Como podemos fazer as pessoas esperarem menos tempo para encontrar um taxi, evitando a competicao por carros?"

Essa pergunta guia TODA a construcao do MVP.

### MVP Concierge — O Modelo Mais Simples

**Conceito:** Voce e o algoritmo. Em vez de construir tecnologia, voce executa manualmente o que o produto faria.

**Exemplo EasyTaxi (Thales Gomes):**
1. Landing page no Wix
2. Formulario Google Forms (nome, localizacao, destino)
3. Resposta cai no email do fundador
4. Fundador liga para taxistas da regiao manualmente
5. Faz o match pessoa ↔ taxista

**Aprendizado real:** Percebeu que taxista nao achava a pessoa → adicionou "cor da camisa" no formulario. Isso so foi possivel POR ESTAR OPERANDO MANUALMENTE.

**Exemplo Zappos (1999):**
1. Tirou fotos de calcados em lojas fisicas
2. Colocou online
3. Quando alguem comprava, ia a loja, comprava e enviava
4. Aprendizado: atendimento personalizado e o diferencial → virou o core do negocio

### Principios do MVP

| Principio | Descricao |
|-----------|-----------|
| **Mais simples possivel** | O que posso colocar para rodar amanha/semana que vem? |
| **Foco em aprendizado** | MVP nao e produto — e teste de hipotese |
| **Coisas nao escalaveis** | Fazer na mao no inicio e ESPERADO e NECESSARIO |
| **Acao > Ideia** | "Se voce nao tem vergonha do seu primeiro produto, demorou demais" — Reid Hoffman |
| **Pareto do Pareto** | Foco, foco, foco — 1 dor, 1 solucao, 1 segmento |

### Processo de Design do MVP (Google Ventures / Design Sprint adaptado)

```
Etapa 1: Rabisco Individual (20 min)
→ Cada socio desenha sua solucao separadamente em uma folha
→ Evita conformidade social / vies de grupo

Etapa 2: Crazy Eights (8 min)
→ Folha dobrada em 8 partes
→ 1 minuto por variacao de solucao
→ Sem julgamento — expansao maxima do leque

Etapa 3: Refinamento Individual (20 min)
→ Olhar todo o hall de possibilidades gerado
→ Detalhar a melhor versao do MVP

Etapa 4: Varal de Ideias (coletivo)
→ Expor todas as solucoes na parede
→ NAO julgar — extrair valor, padroes, insights
→ Decidir coletivamente o primeiro teste

Etapa 5: Execucao
→ Operacionalizar com ferramentas simples (Wix, Google Forms, WhatsApp, PDF)
→ Comecar a rodar com clientes reais
```

**Por que NAO comecar com brainstorming:** Conformidade social — o primeiro a falar define a direcao, e todos seguem (experimento do elevador). Comecar individual preserva diversidade de ideias.

### Ciclo de Validacao do MVP

```
Hipotese → Construir Teste → Executar → Colher Aprendizado → Validar ou Refutar
                                                    ↓
                                            [Se refutada: pivotar]
                                            [Se validada: PSF!]
```

**Hipotese bem formulada:**
"Ao oferecer [solucao X], [persona] consegue cumprir [job] com menos [dor Y], e isso se confirma por [metrica/feedback]."

### Problem-Solution Fit (PSF)

**O que e:** Primeiro ponto de inflexao — comprovar que sua solucao resolve um problema REAL.

**Sem PSF, nao adianta discutir:** modelo de negocio, monetizacao, canais de aquisicao, growth. Resolver um problema real e o PRIMEIRO gargalo.

**PSF = Cliente com dor real + Solucao adequada + Cliente usando e ficando feliz**

### Teste de Sean Ellis (Metrica de PSF)

4 perguntas para clientes que ja usam o produto:

1. **Como voce se sentiria se nao pudesse mais usar o produto?**
   - Muito desapontado / Um pouco desapontado / Nao desapontado
2. Que tipo de pessoa voce acha que mais se beneficiaria com o produto?
3. Qual o principal beneficio que voce recebe do produto?
4. Como podemos melhorar o produto para voce?

**Benchmark:** >=40% respondendo "muito desapontado" = forte indicativo de PSF (Dropbox, Eventbrite, Superhuman usaram isso).

### Analise Pos-Teste de Sean Ellis (se <40%)

```
Passo 1: Clusterizar respondentes por perfil (founders, gestores, executivos, etc.)
Passo 2: Manter todos os "muito desapontados" como referencia
Passo 3: Dos "um pouco desapontados", manter so os com MESMO PERFIL dos muito desapontados
Passo 4: Usar pergunta 2 para refinar o perfil-alvo (quem se beneficiaria?)
Passo 5: Dos "muito desapontados", ver pergunta 3 — qual o beneficio core?
Passo 6: Dos "um pouco desapontados" alinhados, ver se valorizam o MESMO beneficio core
Passo 7: Para esses alinhados, usar pergunta 4 — o que melhorar para eles amarem?
→ Isso gera o ROADMAP de desenvolvimento do produto
```

**Respondentes nao alinhados e "nao desapontados":** gentilmente ignorar — nao sao o perfil cabeca de praia.

### Ferramentas para MVP sem Codigo

| Ferramenta | Uso |
|------------|-----|
| Wix / Webflow | Landing pages e operacoes simples |
| Google Forms | Coleta de dados do cliente |
| WhatsApp | Comunicacao direta, enviar PDF, catalogo |
| Instagram | Vitrine de produto, MVP visual tipo Zappos |
| Notion / Airtable | Backend manual do concierge |
| Calendly | Agendamento como parte do MVP |

### Regras de Ouro
- **Voce e o algoritmo** — execute manualmente antes de codar
- **Lancou feio? Otimo** — significa que lancou rapido o suficiente
- **Aprendizado > Perfeicao** — cada ciclo de feedback vale mais que semanas de desenvolvimento
- **PSF antes de tudo** — sem resolver problema real, nada mais importa
- **40% desapontados = sinal verde** — abaixo disso, iterar no produto
- **Ignorar noise** — clientes fora do perfil geram dados enganosos

## Aplicacao ao Quayer
- **Pergunta "Como Podemos":** Como podemos ajudar donos de barbearia a gerenciar atendimento WhatsApp de forma organizada, sem perder clientes por demora?
- **MVP Concierge possivel:**
  1. Pagina simples com formulario de interesse
  2. Gabriel configura WhatsApp Business API manualmente para cada early adopter
  3. Centraliza conversas e responde/encaminha como "concierge"
  4. Aprende padroes: horarios de pico, tipos de mensagem, fluxos de agendamento
- **Teste de Sean Ellis para Quayer:**
  1. Apos 10-20 barbeiros usando: aplicar as 4 perguntas
  2. Se <40% "muito desapontados": clusterizar por perfil (barbearia 1 cadeira vs 5+, com/sem funcionario)
  3. Identificar beneficio core (organizacao? velocidade? nao perder cliente?)
  4. Roadmap baseado na pergunta 4 dos "um pouco desapontados" alinhados
- **Status atual:** Produto ja em desenvolvimento — oportunidade de rodar Sean Ellis com primeiros usuarios para validar PSF e priorizar roadmap
