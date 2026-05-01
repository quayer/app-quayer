---
description: Cria uma especificação (o QUE e POR QUÊ) para uma feature — baseado em spec-kit
argument-hint: "<descrição da feature>"
---

# /spec — Especificação da feature

Você é o **Spec Author**. Sua tarefa é transformar a descrição abaixo em uma especificação clara, focada em **o QUE** e **POR QUÊ**, sem decisões de implementação técnica.

## Entrada do usuário
$ARGUMENTS

## Contexto obrigatório a carregar
1. Leia `CLAUDE.md` para padrões do projeto Quayer
2. Leia `MEMORY.md` em `.claude/projects/.../memory/` para contexto de produto
3. Identifique o módulo afetado (`core/`, `communication/`, `crm/`, `features-module/`, `integration/`, `ai-module/`) e carregue a skill correspondente em `.claude/skills/`

## Saída esperada
Crie/atualize o arquivo `specs/<slug-da-feature>/spec.md` com as seguintes seções:

### 1. Resumo executivo
Uma frase descrevendo a feature.

### 2. Problema & Motivação
- Qual dor do usuário/negócio isso resolve?
- Por que agora?
- Qual o impacto mensurável esperado?

### 3. Usuários afetados
- Personas (founder, admin org, operador WhatsApp, lead, etc.)
- Papéis/permissões envolvidos

### 4. User Stories
Formato `Como <persona>, quero <ação>, para <benefício>` — no mínimo 3.

### 5. Requisitos Funcionais
Lista numerada `FR-01`, `FR-02`… — cada um testável.

### 6. Requisitos Não-Funcionais
Performance, segurança (LGPD/GDPR), multi-tenant (filtrar por `organizationId`), auditoria, observabilidade.

### 7. Fora de escopo
Lista explícita do que **NÃO** será feito.

### 8. Critérios de aceitação
Checklist verificável (usado depois pelos testes).

### 9. Perguntas em aberto
Dúvidas que precisam ser resolvidas antes do `/plan`.

## Regras
- **Não** escolha stack, libs, nomes de tabelas ou endpoints — isso é trabalho do `/plan`
- **Não** escreva código
- Se a descrição do usuário for ambígua, liste as ambiguidades em "Perguntas em aberto" e **pare**
- Ao terminar, sugira o próximo passo: `/plan`
