---
Criado: 2026-06-12
Atualizado: 2026-06-12
Revisar em: antes de implementar Conversation Blueprint, Refining Loop ou novos cards da jornada
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - specs/integration-builder/spec.md
  - specs/builder-fontes-card-ux/plan.md
  - src/server/ai-module/builder/tools/generate-prompt-anatomy.tool.ts
  - src/server/ai-module/builder/sub-agents/prompt-writer
  - src/server/ai-module/builder/sub-agents/integration-researcher
  - src/server/ai-module/builder/cards/builder-state.ts
---

# Spec - Builder Playbook & Refining Loop

## 1. Resumo executivo

Evoluir o Builder de um fluxo que coleta campos e gera um prompt generico para um sistema que cria um **playbook conversacional validado**: o usuario diz o resultado que quer, a IA sugere como o agente vai conduzir a conversa, mostra perguntas/etapas/capacidades de forma editavel, gera o prompt a partir desse playbook e, antes da publicacao, roda uma fase visivel de **Refinando** com avaliadores multiagente testando conversa, ferramentas, limites, conhecimento, midia e prontidao.

O objetivo nao e apenas "criar um agente"; e ajudar o usuario a chegar a um agente que funciona no mundo real.

## 2. Problema & motivacao

**Dor principal:** os prompts reais validados em producao sao playbooks: possuem fluxo, perguntas, regras de pulo, uso de ferramentas, objecoes, handoff, exemplos e proibicoes. O Builder atual ainda gera prompt a partir de blocos genericos como persona, escopo e horario. Isso produz agentes visualmente configurados, mas sem contrato operacional forte.

**Sintomas observados:**
- O prompt gerado nao se parece com os prompts reais publicados.
- O usuario nao sabe quais perguntas o agente vai fazer.
- O card de revisao valida "voz/escopo/equipe", mas nao valida a conversa que o agente vai conduzir.
- Ferramentas aparecem como capacidade tecnica, nao como acao de negocio ligada ao roteiro.
- No final, nao existe uma fase clara de validacao profunda; o usuario precisa confiar que "esta pronto".

**Por que agora:** a Jornada v2 ja caminha para "configure por excecao", mas ainda falta a camada que define o comportamento real do agente. Sem essa camada, qualquer melhoria de UI so deixa o cadastro mais bonito.

## 3. Usuarios afetados

| Persona | Papel | Como e afetada |
|---|---|---|
| Dono de negocio leigo | admin/master | Precisa entender o que o agente fara sem ler prompt tecnico |
| Agencia/founder | admin/master | Precisa montar agentes mais rapido, com padrao repetivel por nicho |
| Usuario interno que recebe handoff | membro da org | Recebe leads mais bem qualificados e resumidos |
| Lead final | externo | Conversa com agente mais consistente, menos robotico e menos quebrado |

## 4. User stories

1. Como dono de negocio, quero ver quais perguntas meu agente fara antes de publicar, para confiar que ele vai conduzir o atendimento certo.
2. Como dono de negocio, quero que a IA sugira perguntas dinamicas por nicho e objetivo, para eu nao precisar criar um roteiro do zero.
3. Como dono de negocio, quero editar/remover perguntas sugeridas, para ajustar o atendimento ao meu processo real.
4. Como agencia, quero que o Builder gere um playbook por nicho reutilizando padroes reais de prompts validados, para reduzir retrabalho.
5. Como usuario, quero ver uma etapa "Refinando" no final, para saber que o sistema esta testando o agente antes de liberar.
6. Como usuario, quero que essa etapa teste tambem ferramentas e integracoes, para nao publicar um agente que promete algo e nao chama a tool correta.
7. Como usuario, quero receber um resumo claro do que passou, do que foi corrigido e do que ainda exige minha decisao, para seguir sem ler logs tecnicos.
8. Como usuario leigo, quero que o chat use listas, botoes, cards e carrosseis quando fizer sentido, para nao receber blocos gigantes de texto.

## 5. Requisitos funcionais

### Playbook conversacional

- **FR-01** O Builder deve criar um `ConversationBlueprint` antes de gerar o prompt final.
- **FR-02** O blueprint deve conter: objetivo, etapas, perguntas sugeridas, dados capturados, regras de pular perguntas, criterios de sucesso, gatilhos de handoff, gatilhos de ferramentas, objecoes e limites.
- **FR-03** As perguntas sugeridas devem ser especificas ao nicho e ao objetivo. Ex.: SDR imobiliario deve sugerir interesse, tipologia/regiao, faixa de valor/financiamento e proximo passo.
- **FR-04** Cada pergunta deve ter um proposito, uma variavel capturada e uma regra de pulo quando a informacao ja estiver disponivel no contexto.
- **FR-05** O usuario deve revisar o roteiro em card proprio, com confirmacao explicita ou edicao por excecao.
- **FR-06** O prompt final deve ser gerado a partir do blueprint aprovado, nao apenas de persona/escopo/horario.
- **FR-07** O validador de prompt deve checar se o prompt final preserva o roteiro aprovado: perguntas, ordem, limites, handoff e ferramentas.

### Cards e formatacao conversacional

- **FR-08** O Builder deve ter um contrato de blocos de UI para respostas do orquestrador: texto curto, bullets, checklist, quick replies, receipt de acao, mini-card, carrossel de imagens e card de configuracao.
- **FR-09** O orquestrador deve usar `quick_reply_chips` para escolhas curtas em vez de listar opcoes como texto plano.
- **FR-10** Cards que confirmam dados devem virar recibo apos o submit, mostrando o que foi enviado em resumo curto; o usuario nao deve perder o contexto quando o card some.
- **FR-11** O card "Fontes do negocio" deve mostrar fotos em formato compacto/carrossel, com acao clara para usar no agente e edicao/remocao por foto.
- **FR-12** A Visao geral deve mostrar progresso e capacidades sem virar uma lista tecnica gigante; detalhes avancados devem abrir por demanda.

### Ferramentas e integracoes

- **FR-13** Ferramentas devem ser apresentadas como capacidades de negocio, nao como endpoints ou webhooks.
- **FR-14** Uma integracao investigada deve virar uma lista de capacidades selecionaveis. Ex.: RD Station: criar lead, criar conversao, adicionar tag, atualizar contato.
- **FR-15** Para plataformas sem template pronto, o sistema deve pesquisar documentacao, mapear rotas, citar fontes e propor capacidades antes de pedir credenciais.
- **FR-16** Uma ferramenta so fica disponivel ao agente depois de credencial validada e teste real bem-sucedido.
- **FR-17** O prompt deve receber o contrato de cada ferramenta: quando usar, dados obrigatorios, o que fazer em falha e o que nunca expor ao lead.

### Refining Loop multiagente

- **FR-18** Antes da publicacao, o Builder deve exibir uma fase "Refinando" quando houver agente/prompt/ferramentas suficientes para testar.
- **FR-19** A fase deve disparar avaliadores independentes, no minimo:
  - Auditor de roteiro: verifica se o agente segue as etapas do blueprint.
  - Auditor de perguntas: verifica uma pergunta por vez, pulo de perguntas ja respondidas e ausencia de interrogatorio.
  - Auditor de ferramentas: verifica se ferramentas corretas seriam chamadas no momento certo.
  - Auditor de conhecimento: verifica se respostas usam dados aceitos/fontes e nao inventam.
  - Auditor de seguranca/compliance: verifica proibicoes, dados sensiveis e identidade da IA.
  - Auditor de UX/copy: verifica clareza, tamanho das mensagens e tom.
- **FR-20** O sistema deve gerar cenarios de teste por nicho e objetivo, incluindo fluxo feliz, lead confuso, lead apressado, objecao, pergunta fora de escopo e falha de ferramenta.
- **FR-21** Os avaliadores devem produzir resultados estruturados: `pass`, `warning`, `fail`, evidencia curta, ajuste recomendado e severidade.
- **FR-22** Falhas corrigiveis de prompt devem ser aplicadas automaticamente em uma rodada de autocorrecao, sem pedir ao usuario para editar prompt tecnico.
- **FR-23** Falhas que dependem de decisao de negocio devem voltar ao usuario como pergunta/card objetivo. Ex.: "A IA pode falar preco ou deve sempre encaminhar?"
- **FR-24** A UI deve mostrar progresso da fase Refinando por area, sem logs tecnicos: "Roteiro", "Conhecimento", "Ferramentas", "Seguranca", "UX".
- **FR-25** A publicacao deve ficar bloqueada quando houver falha critica nao resolvida.

## 6. Requisitos nao funcionais

- **NFR-01 Anti-alucinacao:** blueprint e prompt devem distinguir dado confirmado, dado sugerido e default `[REVISAR]`.
- **NFR-02 Transparencia:** o usuario ve o comportamento final em linguagem simples; prompt completo continua oculto por padrao.
- **NFR-03 Performance percebida:** a fase Refinando deve mostrar progresso incremental; nao pode parecer tela travada.
- **NFR-04 Custo:** rodadas multiagente devem ter limite por projeto e cache de cenarios quando o blueprint nao mudou.
- **NFR-05 Observabilidade:** salvar score, falhas e tempo por auditor para medir qualidade.
- **NFR-06 Determinismo de teste:** testes unitarios e E2E da jornada devem rodar com LLM mock; LLM real apenas em smoke/homol.
- **NFR-07 Multi-tenant:** toda leitura/escrita de blueprint, refinement e integracoes deve ser escopada por `organizationId`.
- **NFR-08 Segurança:** cenarios e resultados nao podem armazenar credenciais ou payloads sensiveis.

## 7. Fora de escopo

- Criar marketplace publico de templates de playbook.
- Otimizar runtime de producao fora do necessario para testar ferramentas.
- Fazer fine-tuning de modelo.
- Reescrever toda a Jornada v2; esta spec adiciona uma camada sobre ela.
- Criar OAuth generico completo para qualquer SaaS.

## 8. Criterios de aceitacao

- [ ] Ao criar um SDR imobiliario, o usuario ve um card de roteiro com perguntas sugeridas antes do prompt final.
- [ ] O roteiro aprovado e refletido no prompt final e no teste simulado.
- [ ] Se uma informacao ja veio do site/CRM/contexto, o roteiro instrui o agente a nao perguntar de novo.
- [ ] O chat usa chips/cards/carrosseis quando ha escolhas ou listas, sem blocos gigantes de texto.
- [ ] Apos confirmar um card, aparece recibo curto do que foi salvo.
- [ ] A fase "Refinando" aparece antes da publicacao e mostra progresso por area.
- [ ] O Refining Loop roda cenarios de conversa e retorna score/falhas estruturadas.
- [ ] Falhas criticas impedem publicar ate serem corrigidas ou decididas pelo usuario.
- [ ] Ferramentas/integracoes sao testadas no loop; o auditor detecta ferramenta ausente, chamada cedo demais ou parametros obrigatorios faltando.
- [ ] O usuario recebe um resumo final: "pronto para publicar", "corrigi X", "precisa decidir Y".

## 9. Decisoes iniciais

1. **Nome da camada:** `ConversationBlueprint`.
2. **Nome da fase final:** "Refinando".
3. **Posicao na jornada:** depois de criar/gerar prompt e antes de liberar a publicacao final.
4. **Perguntas:** dinamicas por nicho/objetivo, nunca questionario fixo universal.
5. **Prompt:** gerado a partir do blueprint aprovado.
6. **Integracoes:** seguem `specs/integration-builder`, mas esta spec exige que a integracao vire capacidade selecionavel e validavel no Refining Loop.
7. **Cards:** reduzir decisoes obrigatorias; cada card precisa ter uma funcao clara na jornada.

## 10. Perguntas abertas

1. O score minimo para liberar publicacao deve ser 80, 85 ou 90?
2. Quantas rodadas automaticas de correcao o Refining Loop pode fazer antes de pedir decisao ao usuario?
3. O blueprint deve ser editavel como card visual apenas, ou tambem como JSON/debug para usuarios avancados?
4. O Refining Loop deve rodar automaticamente sempre ou apenas quando o usuario clicar "Refinar agora"?
5. Quanto historico de refinement devemos guardar por projeto?

