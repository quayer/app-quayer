---
name: agent-optimizer
description: Diagnostica e melhora agentes existentes com testes comparativos
context: inline
when_to_use: >
  Use quando o criador reclama de respostas ruins, quer melhorar um agente,
  ou quando o agente nao esta performando bem.
  Triggers: "agente ruim", "respostas fracas", "melhora", "nao esta bom"
allowed_tools:
  - run_playground_test
  - update_agent_prompt
  - search_web
---

# Skill: Agent Optimizer

Pipeline de diagnostico e otimizacao para agentes existentes.

## 1. Diagnostico

Coleta informacoes sobre o problema:

- Pergunta ao criador qual o comportamento indesejado (respostas genericas, tom errado, nao usa tools, ignora restricoes).
- Analisa o system prompt atual do agente para identificar possiveis causas.
- Verifica configuracao de tools vinculadas ao agente.
- Identifica gaps entre o objetivo declarado e o comportamento observado.

## 2. Teste Baseline

Estabelece uma linha de base mensuravel antes de qualquer alteracao:

- Usa `run_playground_test` com cenarios que reproduzem o problema reportado.
- Gera 3-5 cenarios adicionais cobrindo o comportamento esperado.
- Registra score baseline para comparacao posterior.
- Documenta quais cenarios falharam e por que.

## 3. Otimizacao do Prompt

Com base no diagnostico e nos resultados do baseline:

- Aplica correcoes direcionadas ao system prompt usando `update_agent_prompt`.
- Tipos comuns de correcao:
  - **Tom**: Ajusta instrucoes de estilo e exemplos de conversa.
  - **Restricoes**: Reforcar limites que estao sendo ignorados.
  - **Tools**: Melhorar instrucoes de quando e como usar cada tool.
  - **Contexto**: Adicionar informacoes de negocio que estao faltando.
  - **Fallback**: Melhorar comportamento para cenarios nao previstos.
- Se necessario, usa `search_web` para pesquisar melhores praticas de prompt engineering para o caso especifico.

## 4. Re-teste

Executa os mesmos cenarios do baseline com o prompt otimizado:

- Usa `run_playground_test` com os cenarios identicos ao baseline.
- Calcula novo score e compara com o baseline.

## 5. Comparacao e Diff

Apresenta resultado ao criador:

- Score anterior vs. score novo (ex: 62 -> 85).
- Cenarios que melhoraram, pioraram ou permaneceram iguais.
- Resumo das alteracoes feitas no prompt.
- Se score novo >= 80: recomenda manter as alteracoes.
- Se score novo < 80: propoe mais um round de otimizacao (maximo 3 rounds totais).
- Apos 3 rounds sem atingir 80: reporta ao criador com analise detalhada e sugestoes manuais.
