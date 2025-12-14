# Discussão: Arquitetura Acquire vs. Estado Atual

**Data:** Dezembro 2024
**Status:** Em análise - NÃO ALTERAR CÓDIGO AINDA

---

## Essência do Acquire

> *"Abstrair a parte difícil para que o usuário foque no agente, não na engenharia."*

A Acquire existe para **remover a complexidade técnica** do desenvolvimento de agentes de IA e automações conversacionais, permitindo que qualquer pessoa — técnica ou não — crie agentes profissionais sem lidar com infraestrutura, WhatsApp, sessões, concatenação, bancos, filas e integrações.

---

## Visão do Produto

Ser a maior plataforma modular de agentes de IA do Brasil, oferecendo:

* Criação simples e visual de agentes
* Templates inteligentes por nicho
* Deploy instantâneo para WhatsApp, Web e n8n
* Infra robusta (memória, sessões, transcrição, multimídia, APIs)
* Módulos opcionais (CRM leve, disparos, inbox, funis etc.)
* White-label controlado para agências e consultores

---

## O que NÃO é (Delimitação)

A Acquire **não é**:

* Um CRM completo
* Um sistema de disparos massivos na V1
* Um substituto de plataformas de atendimento humano
* Uma ferramenta de prospecção
* Um inbox omnichannel
* Um gestor de leads
* Um sistema ERP
* Uma plataforma de funis avançados
* Uma plataforma para manual operations (BPO)

---

## Decisões Tomadas na Discussão

### 1. Webhook n8n por Integração
**Confirmado:** Cada Connection (integração/número) pode ter seu próprio webhook n8n configurado.

### 2. Canais vs Integrações
**Decisão:** NÃO criar página separada "Canais". Manter `/integracoes` como está - já lista números, gera QR Code, mostra status.

### 3. Webhook na Tela da Integração
**Decisão:** Configuração de webhook deve estar DENTRO de cada integração, não em página separada.

### 4. Página de Ferramentas (Tools)
**NOVA PÁGINA NECESSÁRIA:** `/ferramentas` - Biblioteca de tools que podem ser adicionadas a qualquer agente:
- Agendamento (Cal.com, Google Calendar)
- Enviar Email
- Criar Lead no CRM
- Buscar no Google
- Consultar Planilha
- Consultar Estoque
- Gerar Link de Pagamento
- Webhook Customizado

### 5. Onboarding
**Decisão:** NÃO mexer no onboarding atual.

---

## Arquitetura de Páginas Proposta

```
src/app/
├── (auth)/
│   ├── login/
│   ├── signup/
│   └── onboarding/           # Manter como está
│
├── (dashboard)/
│   ├── agentes/              # 🆕 NOVO - Core do produto
│   │   ├── page.tsx          # Lista de agentes
│   │   ├── novo/             # Criar agente
│   │   └── [id]/
│   │       ├── page.tsx      # Editor do agente
│   │       ├── testar/       # Playground
│   │       └── logs/         # Conversas deste agente
│   │
│   ├── templates/            # 🆕 NOVO - Marketplace
│   │   ├── page.tsx          # Grid de templates
│   │   └── [slug]/           # Preview + "Usar"
│   │
│   ├── ferramentas/          # 🆕 NOVO - Biblioteca de tools
│   │   ├── page.tsx          # Lista de ferramentas
│   │   └── [id]/             # Configurar ferramenta
│   │
│   ├── integracoes/          # MANTER - Números WhatsApp
│   │   ├── page.tsx          # Lista (já existe)
│   │   └── [id]/             # MELHORAR - Config completa
│   │
│   ├── logs/                 # 🆕 NOVO - Telemetria geral
│   ├── analytics/            # 🆕 NOVO - Métricas
│   └── configuracoes/        # SIMPLIFICAR
```

---

## Páginas para Remover/Desprioritizar

| Página | Ação | Motivo |
|--------|------|--------|
| `/conversas/[sessionId]` | Remover | Não é plataforma de atendimento humano |
| `/configuracoes/departamentos` | Remover | Não é CRM |
| `/configuracoes/labels` | Remover | Simplificar |
| `/integracoes/conversations` | Mover para `/logs` | Renomear |
| `/integracoes/users` | Desprioritizar | Não é core |

---

## Perguntas Pendentes

1. **Ferramentas/Tools:** Como deve ser a interface?
2. **Agentes:** Um agente pode estar vinculado a múltiplas integrações?
3. **Templates:** Quais nichos são prioridade?

---

## Próximos Passos

1. ✅ Salvar discussão
2. 🔄 Testar todas as telas atuais (foco em funcionamento)
3. ⏸️ Implementar mudanças (APÓS testes)
