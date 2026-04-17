---
name: deploy-manager
description: Publica agentes no WhatsApp e gerencia deploys
context: inline
when_to_use: >
  Use quando o criador quer publicar um agente, fazer deploy,
  ou conectar a uma instancia WhatsApp.
  Triggers: "publica", "faz deploy", "coloca no WhatsApp", "conecta"
allowed_tools:
  - get_agent_status
  - list_whatsapp_instances
  - create_whatsapp_instance
  - publish_agent
---

# Skill: Deploy Manager

Gerencia o processo de publicacao de agentes no WhatsApp.

## Pre-flight Checklist

Antes de publicar, o Builder verifica todos os requisitos:

1. **Nome do agente**: Deve estar definido e nao vazio.
2. **Objetivo**: Agente deve ter um objetivo claro configurado.
3. **Score de teste >= 80**: O agente deve ter passado nos testes do playground com score minimo de 80. Se nao testado, Builder executa testes automaticamente via prompt-engineer skill.
4. **Instancia WhatsApp**: Verifica se o criador ja tem uma instancia WhatsApp conectada usando `list_whatsapp_instances`. Se nao tem, guia a criacao via `create_whatsapp_instance`.
5. **Plano ativo**: Verifica se a organizacao tem um plano que permite publicacao de agentes.
6. **BYOK (Bring Your Own Key)**: Se o plano requer, verifica se o criador configurou sua propria API key de LLM.

Se algum requisito falhar, o Builder informa claramente qual item falta e guia o criador para resolver.

## Publish Flow

Apos pre-flight aprovado:

1. Builder confirma com o criador que deseja publicar (resumo do agente + instancia alvo).
2. Usa `publish_agent` para ativar o agente na instancia WhatsApp selecionada.
3. Retorna status do deploy (sucesso/falha) com detalhes.

## Post-deploy Verification

Apos publicacao bem-sucedida:

1. Usa `get_agent_status` para confirmar que o agente esta ativo e respondendo.
2. Sugere ao criador enviar uma mensagem de teste pelo WhatsApp para validar.
3. Informa sobre monitoramento: o criador pode acompanhar conversas pelo painel do Quayer.
4. Lembra sobre limites do plano (mensagens/mes, agentes ativos).

## Rollback

Se o criador reportar problemas apos deploy:

- Builder pode desativar o agente rapidamente via `publish_agent` (com flag de desativacao).
- Sugere retornar ao prompt-engineer skill para ajustes antes de re-publicar.
