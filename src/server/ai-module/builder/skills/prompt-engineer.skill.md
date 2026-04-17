---
name: prompt-engineer
description: Gera, valida e testa system prompts para agentes Quayer
context: inline
when_to_use: >
  Use quando o criador quer criar um novo agente, melhorar um prompt existente,
  ou quando o Builder precisa gerar um system prompt.
  Triggers: "cria agente", "novo projeto", "melhora o prompt", "ajusta o prompt"
allowed_tools:
  - generate_prompt_anatomy
  - run_playground_test
  - update_agent_prompt
  - search_web
---

# Skill: Prompt Engineer

Pipeline de 4 etapas para criar, validar e testar system prompts de agentes Quayer.

## 1. Coleta

Coleta de informacoes do criador sobre o agente. Tres modos disponiveis:

- **Rapido**: Criador fornece descricao livre. Builder extrai objetivo, tom, restricoes e informacoes do negocio automaticamente.
- **Guiado**: Builder faz perguntas estruturadas uma a uma (objetivo, publico-alvo, tom, restricoes, exemplos de conversa, informacoes do negocio).
- **Misto**: Criador fornece descricao inicial, Builder complementa com perguntas especificas sobre lacunas detectadas.

O modo e selecionado automaticamente com base na quantidade de informacao fornecida pelo criador.

## 2. Geracao

Usa a tool `generate_prompt_anatomy` para gerar o system prompt com duas secoes:

### Secoes visiveis (editaveis pelo criador)
- Identidade e nome do agente
- Objetivo principal
- Tom e estilo de comunicacao
- Restricoes e limites
- Informacoes do negocio (horarios, produtos, servicos)
- Exemplos de conversa

### Secoes internas (gerenciadas pelo Builder)
- Instrucoes de seguranca (anti-jailbreak, anti-prompt-injection)
- Regras de formatacao WhatsApp (sem markdown, emojis controlados)
- Instrucoes de uso de tools disponíveis
- Fallback behaviors

## 3. Validacao

Quatro validadores executados em sequencia:

1. **Anatomy Validator**: Verifica se todas as secoes obrigatorias estao presentes e bem formadas.
2. **Blacklist Validator**: Checa se o prompt contem termos proibidos, instrucoes perigosas ou padroes de jailbreak.
3. **Ambiguity Validator**: Detecta instrucoes vagas, contraditorias ou ambiguas que podem causar comportamento inconsistente.
4. **Journey Validator**: Simula jornadas de usuario (saudacao, pergunta fora do escopo, tentativa de jailbreak) e verifica se o prompt lida com cada cenario.

Se algum validador falhar, o Builder aplica auto-correcao e re-executa. Maximo de 2 rounds de auto-correcao. Apos isso, reporta os problemas ao criador para intervencao manual.

## 4. Teste

Usa a tool `run_playground_test` para testar o prompt gerado:

- Gera de 3 a 5 cenarios de teste automaticamente (baseados no objetivo e restricoes do agente)
- Cada cenario simula uma conversa completa com o agente
- Score calculado por cenario (0-100) baseado em: aderencia ao objetivo, tom, restricoes e uso correto de tools
- Score geral = media dos cenarios
- **Score minimo para aprovacao: >= 80**
- Se score < 80, Builder ajusta o prompt e re-testa. Maximo de 3 rounds.
- Apos 3 rounds sem aprovacao, reporta ao criador com sugestoes de melhoria.
