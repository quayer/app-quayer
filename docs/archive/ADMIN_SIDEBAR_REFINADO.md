# 🎨 Admin Sidebar - Design Final Refinado

## 📐 Nova Estrutura (Aprovada)

### Sidebar Refinado:

```
╔═══════════════════════════════════════════════════════╗
║ [Logo Quayer]                                         ║
║                                                       ║
║ ⚙️ ADMINISTRAÇÃO                                      ║
║    ├─ 📊 Dashboard                                    ║
║    ├─ 🏢 Organizações       ← COM BUSCA              ║
║    ├─ 👥 Clientes                                    ║
║    ├─ 🔌 Integrações (todas)                         ║
║    ├─ 🔄 Gerenciar Brokers                           ║
║    ├─ 📊 Logs Técnicos                               ║
║    └─ 🔐 Permissões Avançadas                        ║
║                                                       ║
║ 📍 Dashboard (ACME Corporation)  ← DIRETO            ║
║ 🔌 Integrações                                        ║
║ 💬 Conversas                                          ║
║ 📩 Mensagens                                          ║
║ 📋 Projetos                                           ║
║ 👥 Usuários                                           ║
║ 🔗 Webhooks                                           ║
║ ⚙️ Configurações                                      ║
║                                                       ║
║ ────────────────────────────────────────────          ║
║ 👤 Administrator                                      ║
║    ├─ 🏢 Trocar Organização   ← AQUI!               ║
║    ├─ 👤 My Profile                                  ║
║    └─ 🚪 Sign Out                                    ║
╚═══════════════════════════════════════════════════════╝
```

---

## 🏢 Trocar Organização - Funcionamento

### Quando clicar em "👤 Administrator" abre um dropdown:

```
┌────────────────────────────────────┐
│ 🏢 Trocar Organização              │ ← Clique aqui
├────────────────────────────────────┤
│ 🔍 [Buscar organização...]         │ ← Input de busca
│                                    │
│ ● ACME Corporation      (atual)    │ ← Selecionado
│ ○ Tech Solutions Ltda              │
│ ○ Marketing Pro                    │
│ ○ João Silva (PF)                  │
│                                    │
│ ──────────────────────────────     │
│ 👤 My Profile                      │
│ 🚪 Sign Out                        │
└────────────────────────────────────┘
```

### Comportamento:

1. **Clica em "Administrator"** → Abre menu dropdown
2. **Vê "🏢 Trocar Organização"** → Clica
3. **Abre modal com busca:**

```
┌─────────────────────────────────────────┐
│ Selecionar Organização                  │
├─────────────────────────────────────────┤
│                                         │
│ 🔍 [Digite para buscar...]              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ● ACME Corporation                  │ │
│ │   12.345.678/0001-90 | PJ | PRO     │ │
│ │   10 instâncias | 25 usuários       │ │
│ │                                     │ │
│ │ ○ Tech Solutions Ltda               │ │
│ │   98.765.432/0001-12 | PJ | BASIC   │ │
│ │   5 instâncias | 10 usuários        │ │
│ │                                     │ │
│ │ ○ Marketing Pro                     │ │
│ │   11.222.333/0001-44 | PJ | PRO     │ │
│ │   15 instâncias | 30 usuários       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancelar]              [Selecionar]    │
└─────────────────────────────────────────┘
```

### Após selecionar organização:

- Sidebar atualiza mostrando nome da org
- Seção do meio muda de "Visão Admin (global)" para nome da org
- Admin passa a ver dados APENAS daquela organização

---

## 🏢 Página "Organizações" com Busca

### Local: `/admin/organizations`

**Quando clicar em "🏢 Organizações" na sidebar:**

```
┌─────────────────────────────────────────────────────┐
│ Organizações                   [+ Nova Organização] │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 🔍 [Buscar por nome, documento...]                 │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │Nome         │Doc      │Tipo│Plano│Inst│Users│ ││
│ ├─────────────────────────────────────────────────┤│
│ │ACME Corp    │12345678 │PJ  │PRO  │ 10 │ 25  │●││
│ │Tech Ltda    │87654321 │PJ  │BASIC│  5 │ 10  │●││
│ │Marketing Pro│11222333 │PJ  │PRO  │ 15 │ 30  │●││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Funcionalidades da busca:**
- Busca por: Nome, Documento (CNPJ/CPF)
- Filtro em tempo real
- Resultados instantâneos

**Ação ao clicar em uma organização:**
- Abre detalhes em modal OU
- Redireciona para página de edição OU
- Pergunta: "Deseja visualizar como esta organização?"

---

## 📄 Explicação de Cada Página do Sistema

### 1. 💬 Conversas (`/conversas`)

**O que é:**
Interface de chat em tempo real, estilo WhatsApp Web

**Funcionalidades:**
- Lista de todas as conversas ativas
- Preview da última mensagem
- Status de leitura (enviado, entregue, lido)
- Filtros: Todas, Não lidas, Abertas, Fechadas
- Timeline de mensagens
- Input para enviar mensagens
- Upload de mídia (imagens, vídeos, docs)
- Emojis, áudio, localização

**Exemplo Visual:**
```
┌────────────────────────────────────────────────┐
│ Conversas                                      │
├──────────────────┬─────────────────────────────┤
│ LISTA            │ CHAT ATIVO                  │
│                  │                             │
│ João Silva       │ João Silva                  │
│ Oi, tudo bem?    │ +55 11 99999-9999          │
│ 2min atrás       │ ═════════════════════       │
│                  │                             │
│ Maria Santos     │ [10:30] João: Oi!          │
│ Preciso de ajuda │ [10:31] Você: Olá João!    │
│ 5min atrás       │ [10:32] João: Tudo bem?    │
│                  │                             │
│ Pedro Costa      │ ┌───────────────────────┐  │
│ Obrigado!        │ │ Digite mensagem...    │  │
│ 1h atrás         │ └───────────────────────┘  │
└──────────────────┴─────────────────────────────┘
```

**Objetivo:** Chat em tempo real com clientes

---

### 2. 📩 Mensagens (`/integracoes/messages`)

**O que é:**
Dashboard de análise e gerenciamento de mensagens enviadas/recebidas

**Funcionalidades:**
- Histórico de TODAS as mensagens
- Filtros avançados:
  - Por data (última hora, hoje, semana, mês)
  - Por status (enviada, entregue, lida, falhada)
  - Por tipo (texto, mídia, localização)
  - Por instância
  - Por número de telefone
- Estatísticas:
  - Total enviadas
  - Taxa de entrega
  - Taxa de leitura
  - Mensagens falhadas
- Exportar relatórios
- Reenviar mensagens falhadas

**Exemplo Visual:**
```
┌─────────────────────────────────────────────────────┐
│ Mensagens                                           │
├─────────────────────────────────────────────────────┤
│ [📊 Dashboard de Mensagens]                         │
│                                                     │
│ Enviadas: 1.234 | Entregues: 1.180 | Lidas: 956   │
│ Falhadas: 54                                        │
│                                                     │
│ Filtros: [Todas ▼] [Hoje ▼] [Instância 1 ▼]       │
│                                                     │
│ ┌───────────────────────────────────────────────┐  │
│ │Data/Hora │Para         │Mensagem    │Status  │  │
│ ├───────────────────────────────────────────────┤  │
│ │10:30     │+5511999... │Olá, tudo...│✓✓ Lida │  │
│ │10:25     │+5511888... │Seu pedido..│✓ Entreg│  │
│ │10:20     │+5511777... │Promoção... │❌ Falha│  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ [Exportar CSV] [Exportar Excel]                    │
└─────────────────────────────────────────────────────┘
```

**Objetivo:** Análise, histórico e relatórios de mensagens

---

### 3. 📋 Projetos (`/integracoes/projects`)

**O que é:**
Sistema de organização de campanhas, atendimentos e automações

**Funcionalidades:**
- Criar projetos/campanhas
- Organizar mensagens por projeto
- Atribuir instâncias a projetos
- Equipes por projeto
- Métricas por projeto
- Tags e categorias

**Exemplo de Projetos:**
1. **Campanha Black Friday**
   - 3 instâncias
   - 5.000 mensagens disparadas
   - Taxa de conversão: 12%

2. **Atendimento Suporte**
   - 2 instâncias
   - 1.200 conversas/mês
   - Tempo médio: 5min

3. **Vendas Outbound**
   - 4 instâncias
   - 10.000 contatos
   - 230 vendas fechadas

**Exemplo Visual:**
```
┌─────────────────────────────────────────────────────┐
│ Projetos                         [+ Novo Projeto]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────┐        │
│ │ 🎯 Campanha Black Friday                │        │
│ │ ────────────────────────────────────    │        │
│ │ Status: Ativa                           │        │
│ │ Instâncias: 3                           │        │
│ │ Mensagens: 5.000 enviadas               │        │
│ │ Conversões: 12% (600 vendas)            │        │
│ │                                         │        │
│ │ [Ver Detalhes] [Editar] [Pausar]       │        │
│ └─────────────────────────────────────────┘        │
│                                                     │
│ ┌─────────────────────────────────────────┐        │
│ │ 💬 Atendimento Suporte                  │        │
│ │ ────────────────────────────────────    │        │
│ │ Status: Ativa                           │        │
│ │ Instâncias: 2                           │        │
│ │ Conversas/mês: 1.200                    │        │
│ │ Tempo médio: 5min                       │        │
│ │                                         │        │
│ │ [Ver Detalhes] [Editar] [Relatório]    │        │
│ └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

**Objetivo:** Organizar e gerenciar campanhas e equipes

---

### 4. 🔗 Webhooks (`/integracoes/webhooks`)

**O que é:**
Configuração de endpoints para receber eventos do WhatsApp

**Funcionalidades:**
- Cadastrar URLs de webhook
- Selecionar eventos:
  - `message.received` - Mensagem recebida
  - `message.sent` - Mensagem enviada
  - `message.read` - Mensagem lida
  - `status.changed` - Status da instância mudou
  - `qrcode.updated` - QR Code atualizado
- Testar webhook (enviar evento de teste)
- Ver logs de entregas:
  - Sucesso (200)
  - Falha (400, 500)
  - Timeout
- Retry automático
- Headers customizados
- Autenticação (Bearer Token, API Key)

**Exemplo Visual:**
```
┌─────────────────────────────────────────────────────┐
│ Webhooks                         [+ Novo Webhook]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────┐        │
│ │ 📡 Webhook Campanha Black Friday        │        │
│ │ ────────────────────────────────────    │        │
│ │ URL: https://api.acme.com/whatsapp     │        │
│ │                                         │        │
│ │ Eventos:                                │        │
│ │ ✓ message.received                      │        │
│ │ ✓ message.read                          │        │
│ │ ✗ status.changed                        │        │
│ │                                         │        │
│ │ Últimas entregas:                       │        │
│ │ ✅ 200 OK - há 2min                     │        │
│ │ ✅ 200 OK - há 5min                     │        │
│ │ ❌ 500 Error - há 10min                 │        │
│ │                                         │        │
│ │ [Testar] [Editar] [Ver Logs]           │        │
│ └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

**Objetivo:** Integrar WhatsApp com sistemas externos

---

### 5. ⚙️ Configurações (`/integracoes/settings`)

**O que é:**
Configurações gerais da organização e preferências

**Funcionalidades:**
- **Perfil da Organização:**
  - Nome
  - Logo
  - Fuso horário
  - Idioma padrão

- **Preferências de Atendimento:**
  - Mensagem de boas-vindas
  - Mensagem de ausência
  - Horário de atendimento
  - Fila de atendimento (ordem)

- **Integrações Externas:**
  - CRM (Salesforce, HubSpot, Pipedrive)
  - E-commerce (Shopify, WooCommerce)
  - Analytics (Google Analytics, Mixpanel)

- **Segurança:**
  - 2FA (autenticação de dois fatores)
  - Whitelist de IPs
  - Logs de auditoria

- **Faturamento:**
  - Plano atual
  - Histórico de pagamentos
  - Upgrade/Downgrade

**Exemplo Visual:**
```
┌─────────────────────────────────────────────────────┐
│ Configurações                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 🏢 Perfil da Organização                           │
│ ┌─────────────────────────────────────────┐        │
│ │ Nome: ACME Corporation                  │        │
│ │ Logo: [Alterar]                         │        │
│ │ Fuso: America/Sao_Paulo                 │        │
│ │ Idioma: Português (BR)                  │        │
│ └─────────────────────────────────────────┘        │
│                                                     │
│ 💬 Preferências de Atendimento                     │
│ ┌─────────────────────────────────────────┐        │
│ │ Mensagem boas-vindas:                   │        │
│ │ [Olá! Como posso ajudar?]               │        │
│ │                                         │        │
│ │ Horário atendimento:                    │        │
│ │ Segunda a Sexta: 09:00 - 18:00         │        │
│ │ Sábado: 09:00 - 12:00                  │        │
│ │ Domingo: Fechado                        │        │
│ └─────────────────────────────────────────┘        │
│                                                     │
│ 🔐 Segurança                                        │
│ ┌─────────────────────────────────────────┐        │
│ │ 2FA: ✅ Ativado                          │        │
│ │ [Ver logs de auditoria]                 │        │
│ └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

**Objetivo:** Configurar organização e preferências

---

## 📊 Resumo das Diferenças

| Página | Foco | Tempo Real | Objetivo |
|--------|------|------------|----------|
| **💬 Conversas** | Chat ao vivo | ✅ SIM | Atender clientes agora |
| **📩 Mensagens** | Histórico/Analytics | ❌ NÃO | Analisar e reportar |
| **📋 Projetos** | Organização | ❌ NÃO | Gerenciar campanhas |
| **🔗 Webhooks** | Integrações | ⚡ Eventos | Automatizar sistemas |
| **⚙️ Configurações** | Preferências | ❌ NÃO | Configurar organização |

---

## 🎯 Sidebar Final (Versão Aprovada)

```
╔═══════════════════════════════════════════════════════╗
║ [Logo Quayer]                                         ║
║                                                       ║
║ ⚙️ ADMINISTRAÇÃO                                      ║
║    ├─ 📊 Dashboard                                    ║
║    ├─ 🏢 Organizações       🔍                       ║
║    ├─ 👥 Clientes                                    ║
║    ├─ 🔌 Integrações (global)                        ║
║    ├─ 🔄 Gerenciar Brokers                           ║
║    ├─ 📊 Logs Técnicos                               ║
║    └─ 🔐 Permissões Avançadas                        ║
║                                                       ║
║ ───── ACME CORPORATION ─────                         ║
║ 📊 Dashboard                                          ║
║ 🔌 Integrações                                        ║
║ 💬 Conversas                                          ║
║ 📩 Mensagens                                          ║
║ 📋 Projetos                                           ║
║ 👥 Usuários                                           ║
║ 🔗 Webhooks                                           ║
║ ⚙️ Configurações                                      ║
║                                                       ║
║ ────────────────────────────────────────────          ║
║ 👤 Administrator           ▼                         ║
║    ├─ 🏢 Trocar Organização  🔍                      ║
║    ├─ 👤 My Profile                                  ║
║    └─ 🚪 Sign Out                                    ║
╚═══════════════════════════════════════════════════════╝
```

---

## ✅ Aprovações Finais

- ✅ Organization Switcher dentro de "👤 Administrator"
- ✅ Busca de organizações ao clicar
- ✅ Super Poderes dentro de "⚙️ ADMINISTRAÇÃO"
- ✅ Seção de organização como itens diretos (não submenu)
- ✅ Dashboard também aparece na seção da organização

**Pronto para implementação!** 🚀

Posso começar agora?
