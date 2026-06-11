---
Criado: 2026-06-10
Atualizado: 2026-06-10
Revisar em: ao iniciar o /plan desta spec, ou mudança em create_custom_tool / catálogo de capacidades
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - src/server/ai-module/builder/tools/create-custom-tool.tool.ts
  - src/lib/providers/apify
---

# Spec — Integration Builder: agente que cria ferramentas personalizadas

## 1. Resumo executivo

Um agente investigador que transforma um pedido em linguagem natural ("quero conectar com o RD Station") em uma ferramenta personalizada funcional do agente WhatsApp: pesquisa a documentação da API sozinho, propõe a integração em linguagem leiga, guia o usuário na obtenção das credenciais passo a passo e **só ativa a ferramenta depois de uma chamada de teste real bem-sucedida**.

## 2. Problema & Motivação

**Dor:**
- Hoje existe um mecanismo de ferramenta custom (webhook definido em conversa), mas ele exige que o **usuário** saiba URL, método, formato do payload e token — conhecimento que o dono de negócio leigo não tem. Na prática, a capacidade existe e não é usável pela persona principal do produto.
- Não há investigação: se o usuário diz "quero integrar com meu CRM", a IA não busca a documentação da API do CRM — ou inventa um endpoint, ou devolve a tarefa ao usuário.
- Não há **gate de validação**: uma ferramenta mal configurada pode ser ativada e falhar silenciosamente em produção, na frente do lead.
- Integração com CRM/planilha/sistema da empresa é um dos pedidos mais frequentes de quem monta agente de captação (o caso citado: enviar leads qualificados para o RD Station).

**Por que agora:** a Jornada v2 (spec relacionada) cria a superfície única de Capacidades com o botão "+ Integração" — este épico é o que está atrás do botão. Sem ele, a promessa "seu agente conecta com suas ferramentas" não se cumpre para leigos.

**Impacto esperado:**
- Integração criada e validada de ponta a ponta **sem o usuário escrever uma linha técnica** (só colar credencial seguindo instruções).
- Zero ferramentas custom ativas sem validação real (hoje: sem gate).
- Métrica de funil própria: pedidos de integração → propostas geradas → credenciais validadas → ativas em produção.

## 3. Usuários afetados

| Persona | Papel | Como é afetada |
|---|---|---|
| **Dono de negócio leigo** | `admin` da org | Pede a integração por nome e segue instruções guiadas; nunca vê JSON/endpoint |
| **Founder/agência** | `admin`/`master` | Cria integrações repetíveis para clientes; quer templates e velocidade |
| **Time/operador** | `user` | Recebe leads/dados no sistema externo já integrado |
| **Lead final** | externo | Indireto: dados capturados pelo agente chegam ao CRM do negócio |

## 4. User Stories

1. Como **dono de negócio**, quero dizer "quero que os leads vão para o RD Station" e ver a IA descobrir sozinha como a integração funciona, para não precisar entender de API.
2. Como **dono de negócio**, quero receber instruções passo a passo de ONDE pegar a chave/token na plataforma externa (com os nomes reais dos menus), para conseguir configurar sem chamar um técnico.
3. Como **dono de negócio**, quero que a ferramenta só fique ativa depois de um teste real comprovadamente bem-sucedido, para nunca publicar um agente com integração quebrada.
4. Como **dono de negócio**, quero entender em linguagem simples o que a integração faz e QUANDO o agente vai usá-la ("quando o lead deixar nome e telefone, envio para o seu CRM"), para confiar no que está acontecendo.
5. Como **founder/agência**, quero partir de templates curados das integrações mais comuns, para configurar em minutos o que já é conhecido.
6. Como **dono de negócio com sistema próprio**, quero o caminho assistido por webhook genérico quando minha ferramenta não tem documentação pública, com o mesmo teste de validação.
7. Como **admin da org**, quero pausar/remover uma integração e ver um histórico de quem criou, validou e ativou, para manter controle e auditoria.

## 5. Requisitos Funcionais

**Descoberta e proposta:**
- **FR-01** Um pedido em linguagem natural de integração (na jornada do Builder ou na superfície de Capacidades, botão "+ Integração") deve iniciar o fluxo de criação — reconhecendo o nome da plataforma quando citado.
- **FR-02** O sistema deve investigar automaticamente a documentação pública da API da plataforma citada (busca na web), e a proposta resultante deve citar as fontes consultadas.
- **FR-03** A proposta da ferramenta deve ser apresentada em linguagem leiga e confirmável: o que faz, em que momento da conversa o agente a usará, quais dados envia/recebe, e o que o usuário precisará fornecer (credenciais). Nada é criado sem confirmação.
- **FR-04** Deve existir um catálogo de **templates curados** para integrações comuns (priorizadas por demanda), que pulam a fase de investigação.

**Credenciais e validação:**
- **FR-05** A coleta de credenciais deve ser guiada: instruções passo a passo de onde obter cada valor na plataforma externa, campo a campo, com validação de formato no preenchimento.
- **FR-06** Toda ferramenta criada nasce em estado **rascunho** e só transita para **ativa** após uma **chamada de teste real bem-sucedida** contra a API externa (com payload de teste identificado como teste). Falha na validação → diagnóstico em linguagem leiga ("a chave parece inválida; confira o passo 2") e permanência em rascunho.
- **FR-07** O usuário deve poder re-testar, editar credenciais, pausar e remover a integração a qualquer momento pela superfície de Capacidades; os estados (rascunho / validada / ativa / pausada / com erro) devem ser visíveis ali.

**Uso pelo agente:**
- **FR-08** O agente (playground e produção) só enxerga ferramentas em estado ativo; o teste simulado usa exatamente o mesmo conjunto que a produção usará.
- **FR-09** A proposta confirmada deve definir o gatilho de uso em linguagem natural (ex.: "quando o lead informar nome e telefone") e isso deve refletir no comportamento do agente publicado.
- **FR-10** Falhas da integração em produção devem degradar com mensagem neutra ao lead (nunca expor erro técnico) e gerar sinal visível para o dono (estado "com erro" + aviso).

**Plataforma sem documentação:**
- **FR-11** Quando a investigação não encontrar documentação utilizável, o fluxo deve oferecer o caminho assistido por webhook genérico (o usuário informa/encaminha a URL que o sistema dele expõe), mantendo o MESMO gate de validação.

**Auditoria:**
- **FR-12** Registrar quem criou, validou, ativou, pausou e removeu cada integração, e o histórico de chamadas de teste (sem registrar payloads sensíveis).

## 6. Requisitos Não-Funcionais

- **NFR-01 Segurança de credenciais:** tokens/chaves cifrados em repouso (padrão de criptografia já existente na plataforma), nunca em logs, nunca ecoados de volta na conversa; exibição mascarada.
- **NFR-02 Multi-tenant:** integrações, credenciais e auditoria escopadas por `organizationId`.
- **NFR-03 LGPD:** dados de leads trafegando para sistemas terceiros sob responsabilidade da org; a proposta (FR-03) deve declarar explicitamente QUAIS dados são enviados; logs de teste sem dados pessoais.
- **NFR-04 Custo e cache:** a investigação (busca web) deve ter cache por plataforma para não re-pesquisar a mesma documentação a cada pedido; limites de uso por org.
- **NFR-05 Rate limit:** chamadas de validação limitadas (anti-abuso contra APIs de terceiros).
- **NFR-06 Observabilidade:** taxa de sucesso de validações, falhas por plataforma e erros em produção instrumentados.
- **NFR-07 Robustez do runtime:** timeout e retry padronizados nas chamadas externas; falha de integração nunca derruba o turno do agente.

## 7. Fora de escopo

- Fluxos **OAuth completos** de terceiros no MVP (primeiro: API key/token; OAuth entra por template depois).
- Integrações **inbound** (sistemas externos chamando o agente/webhooks de entrada) — MVP é o agente acionando o sistema externo.
- **Marketplace** público de integrações entre orgs.
- Execução de **código arbitrário** fornecido pelo usuário.
- Sincronização bidirecional/contínua de dados (é acionamento por evento de conversa, não ETL).
- A reforma geral da jornada (spec própria: `jornada-builder-v2`).

## 8. Critérios de aceitação

- [ ] "Quero mandar os leads para o RD Station" (ou template equivalente) leva a uma proposta em linguagem leiga com fontes citadas, sem o usuário fornecer URL/endpoint.
- [ ] O passo de credenciais mostra instruções de onde obter o token na plataforma externa, campo a campo.
- [ ] É impossível ativar uma ferramenta sem chamada de teste real bem-sucedida; o estado rascunho/ativa/pausada/com erro é visível na superfície de Capacidades.
- [ ] Falha de validação produz diagnóstico em linguagem leiga e a ferramenta permanece inativa.
- [ ] O playground e o agente publicado usam apenas ferramentas ativas — comportamento idêntico.
- [ ] Plataforma sem documentação → caminho webhook genérico assistido com o mesmo gate.
- [ ] Credenciais cifradas, mascaradas na UI e ausentes de logs (verificável).
- [ ] Pausar a integração remove o uso pelo agente imediatamente; auditoria registra o ciclo de vida completo.
- [ ] Falha em produção: lead recebe resposta neutra; dono vê estado "com erro".

## 9. Perguntas em aberto

> **Decisões registradas em 2026-06-10** (defaults do time técnico, reversíveis no /plan):
>
> 1. **Templates iniciais:** RD Station (citado pelo founder) + webhook genérico; Google Sheets na sequência. Demais por demanda.
> 2. **Gate por plano:** MVP sem gate novo — criação livre, limite de salvaguarda de 3 integrações ativas por org; o gate de plano continua sendo o de publicação já existente.
> 3. **Custo da investigação:** absorvido pela plataforma, com cache por plataforma investigada e limite de 10 investigações/org/dia.
> 4. **Curadoria humana:** nenhuma no MVP — validação técnica obrigatória + telemetria; curadoria entra se a taxa de falha em produção justificar.
> 5. **Retry em produção:** MVP sem fila nova — 1 retry inline com timeout e estado "com erro" visível; fila durável fica para a proposta FSM de outbound (separada).

---

**Dependência:** a superfície de Capacidades da `jornada-builder-v2` (FR-06/FR-07 de lá) é o lar visual deste épico.
**Próximo passo sugerido:** `/plan specs/integration-builder` após o /plan da jornada v2 (ou em paralelo, se o time aceitar definir a superfície de Capacidades primeiro).
