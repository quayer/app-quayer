---
Criado: 2026-06-12
Atualizado: 2026-06-12
Revisar em: antes de cada sessao de refinamento com founder/produto
Relacionados:
  - specs/builder-playbook-refinement/spec.md
  - specs/builder-playbook-refinement/plan.md
  - specs/builder-playbook-refinement/tasks.md
---

# Talks - Roteiros de revisao do Builder Playbook

Este arquivo existe para guiar conversas de decisao antes de codar. A ideia e evitar implementar UI bonita em cima de uma decisao de produto mal fechada.

## Talk 1 - O que o usuario precisa ver antes do prompt?

Objetivo: validar o card "Roteiro da conversa".

Perguntas de revisao:
- O usuario precisa ver todas as perguntas ou so as principais?
- O card deve mostrar "dado capturado" para leigo ou isso fica escondido?
- "Gerar outra sugestao" e util ou aumenta ansiedade?
- Quantas perguntas sugeridas sao aceitaveis antes de parecer questionario?
- O que e obrigatorio aprovar: perguntas, gatilhos de humano, ferramentas ou tudo junto?

Decisao sugerida:
- Mostrar 3 a 5 perguntas principais.
- Mostrar "o que essa pergunta descobre" em linguagem leiga.
- Manter edicao simples: editar texto, remover, reordenar.

## Talk 2 - Como deve aparecer a fase "Refinando"?

Objetivo: definir UX da validacao multiagente.

Perguntas de revisao:
- "Refinando" aparece automaticamente ou apos clique?
- Quanto tempo aceitavel para usuario esperar?
- Mostrar score numerico ou apenas "Pronto / precisa ajustar"?
- Quais falhas bloqueiam publicacao?
- Como explicar que varios avaliadores testaram sem parecer tecnico demais?

Decisao sugerida:
- Rodar automaticamente antes de publicar.
- Mostrar progresso por areas.
- Score interno; UI mostra "Pronto para publicar" ou "Corrigir antes de publicar".
- Bloquear apenas falhas criticas.

## Talk 3 - Perguntas dinamicas por nicho

Objetivo: fechar padrao de blueprint por nicho.

Exemplo imobiliario:
- morar ou investir?
- tipologia/regiao?
- faixa de valor/financiamento?
- quer detalhes, fotos ou falar com consultor?

Exemplo B2B:
- como resolve hoje?
- qual dor pesa mais?
- tamanho/time/volume?
- aceita diagnostico/reuniao?

Exemplo servico local:
- qual servico precisa?
- melhor dia/horario?
- unidade/profissional preferido?
- deseja confirmar/agendar?

Perguntas de revisao:
- Quais nichos entram primeiro?
- O que nunca perguntar em cada nicho?
- Quando o agente deve parar de qualificar e encaminhar?

## Talk 4 - Ferramentas como capacidades de negocio

Objetivo: validar como o usuario escolhe ferramentas sem ver endpoint.

Perguntas de revisao:
- Para RD Station, quais capacidades aparecem primeiro?
- "Criar lead" e linguagem clara ou deve ser "Enviar interessado para o CRM"?
- O usuario deve escolher rotas detalhadas ou objetivos de negocio?
- Como mostrar que credencial ainda nao esta validada?

Decisao sugerida:
- Mostrar capacidades de negocio.
- Rotas/endpoints ficam escondidos.
- Ferramenta so aparece como disponivel ao agente depois de teste real.

## Talk 5 - Cards que ficam e cards que somem

Objetivo: revisar arquitetura de cards do chat.

Perguntas de revisao:
- Quais cards sao obrigatorios da jornada?
- Quais cards viram capacidade opcional?
- Quais cards deixam de existir porque foram fundidos?
- Apos submit, qual recibo cada card deve deixar?

Lista inicial proposta:
- Fontes do negocio
- Objetivo do agente
- Roteiro da conversa
- Revisar e criar agente
- Capacidades
- Configurar capacidade
- Refinando
- Testar
- Publicar

## Talk 6 - Politica de score e bloqueio

Objetivo: decidir regra de publicacao.

Perguntas de revisao:
- Score minimo para publicar?
- Warning permite publicar?
- Falha de UX bloqueia ou so recomenda?
- Falha de ferramenta bloqueia se a ferramenta for opcional?
- O usuario pode "publicar mesmo assim" em algum caso?

Decisao sugerida:
- Falha critica bloqueia.
- Warning nao bloqueia.
- Score baixo sem falha critica permite publicar com aviso.
- Ferramenta prometida mas nao ativa bloqueia sempre.

## Talk 7 - Anatomia final do prompt

Objetivo: alinhar prompt gerado aos prompts reais validados.

Perguntas de revisao:
- A anatomia atual de 10 secoes continua ou vira modular M01/M02?
- Devemos incluir exemplos de resposta no prompt final?
- Quantos exemplos por agente?
- Regras "SEMPRE/NUNCA" ficam compactas ou completas?
- Como evitar prompt gigante?

Decisao sugerida:
- Manter 10 secoes como validador estrutural.
- Inserir blueprint como conteudo forte dentro de Fluxo, Ferramentas, Gatilhos e Regras.
- Exemplos poucos, escolhidos por cenario critico.

