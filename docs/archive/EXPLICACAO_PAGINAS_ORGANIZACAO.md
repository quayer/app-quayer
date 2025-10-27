# 📖 Explicação Completa de Cada Página da Organização

## 🎯 Contexto

Quando o **Admin seleciona "ACME Corporation"**, ele passa a ver o sistema como se fosse um **Master** da ACME. Todas as páginas abaixo mostram dados **APENAS** da ACME Corporation.

---

## 1️⃣ 📊 Dashboard

**Rota:** `/integracoes/dashboard`

### O que é?
Visão geral de **tudo** que está acontecendo na organização ACME **AGORA**.

### O que mostra?

#### Cards de Resumo (Topo)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Integrações  │ │ Conversas    │ │ Mensagens    │ │ Usuários     │
│ Ativas       │ │ Abertas      │ │ Hoje         │ │ Ativos       │
│     10       │ │      45      │ │    1.234     │ │      8       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

#### Métricas de Atendimento
```
┌─────────────────────────────────────────────────────┐
│ Métricas de Conversas                               │
├─────────────────────────────────────────────────────┤
│ Total de Conversas: 166                             │
│ Em Andamento: 45                                    │
│ Controladas por IA: 30                              │
│ Controladas por Humano: 15                          │
│                                                     │
│ Tempo Médio de Atendimento: 5.2 min                │
│ Taxa de Resolução no Primeiro Contato: 78%         │
└─────────────────────────────────────────────────────┘
```

#### Performance de Disparos
```
┌─────────────────────────────────────────────────────┐
│ Disparos Hoje                                       │
├─────────────────────────────────────────────────────┤
│ ✅ Bem-sucedidos: 1.180 (95.6%)                     │
│ ❌ Falhados: 54 (4.4%)                              │
│ 📖 Lidos: 956 (81.0%)                               │
└─────────────────────────────────────────────────────┘
```

#### Gráficos
```
┌─────────────────────────────────────────────────────┐
│ 📈 Conversas por Hora (últimas 24h)                │
│                                                     │
│  60│         ╭─╮                                    │
│  50│      ╭──╯ ╰╮                                   │
│  40│   ╭──╯     ╰─╮                                 │
│  30│╭──╯          ╰─╮                               │
│  20│╯               ╰──╮                            │
│  10│                  ╰─╮                           │
│   0└──────────────────────╯                        │
│    00h  06h  12h  18h  24h                         │
└─────────────────────────────────────────────────────┘
```

### Quando usar?
- Ver **visão geral** do dia
- Acompanhar **métricas em tempo real**
- Identificar **problemas** (muitas falhas, tempo alto)
- Tomar **decisões rápidas**

---

## 2️⃣ 🔌 Integrações

**Rota:** `/integracoes`

### O que é?
Gerenciamento de **instâncias WhatsApp** da ACME Corporation.

### O que mostra?

#### Layout (2 colunas)
```
┌────────────────────────────────────────────────────┐
│ Integrações                    [+ Nova Integração] │
├──────────────────┬─────────────────────────────────┤
│ LISTA            │ DETALHES DA SELECIONADA         │
│                  │                                 │
│ 🔍 Buscar...     │ WhatsApp Vendas                 │
│                  │ +55 11 99999-0001              │
│ [Todas ▼]        │                                 │
│                  │ Status: ● Conectada             │
│ 📱 WA Vendas     │                                 │
│    +55 11 999... │ ┌─────────────────────────────┐│
│    ● Conectada   │ │ Status da Conexão           ││
│                  │ │ ✅ Conectado há 2 dias      ││
│ 📱 WA Suporte    │ │                             ││
│    +55 11 988... │ │ [Reconectar] [Desconectar] ││
│    ○ Desconectada│ └─────────────────────────────┘│
│                  │                                 │
│ 📱 WA Marketing  │ ┌─────────────────────────────┐│
│    +55 11 977... │ │ Informações                 ││
│    ● Conectada   │ │ Criado: há 30 dias         ││
│                  │ │ Broker: UAZapi              ││
│                  │ │ Mensagens: 1.234 hoje       ││
│                  │ └─────────────────────────────┘│
│                  │                                 │
│                  │ [Editar] [Compartilhar] [QR]   │
└──────────────────┴─────────────────────────────────┘
```

### Funcionalidades

#### Ver lista de instâncias
- Nome da instância
- Número WhatsApp
- Status (conectada/desconectada)
- Última atividade

#### Conectar instância
1. Clica em instância desconectada
2. Clica em "Conectar"
3. Mostra QR Code
4. Escaneia com WhatsApp
5. Status muda para "Conectada"

#### Criar nova instância
```
┌─────────────────────────────────┐
│ Nova Integração WhatsApp        │
├─────────────────────────────────┤
│ Nome:                           │
│ [WhatsApp Vendas 2]             │
│                                 │
│ Número (opcional):              │
│ [+55 11 99999-0002]             │
│                                 │
│ Webhook URL (opcional):         │
│ [https://api.acme.com/webhook]  │
│                                 │
│ [Cancelar]        [Criar]       │
└─────────────────────────────────┘
```

#### Compartilhar instância
Dar acesso a **usuários específicos** da ACME:
```
┌─────────────────────────────────┐
│ Compartilhar WhatsApp Vendas    │
├─────────────────────────────────┤
│ Usuários com acesso:            │
│                                 │
│ ✓ João Silva (Master)           │
│ ✓ Maria Santos (Manager)        │
│ □ Pedro Costa (User)            │
│ □ Ana Souza (User)              │
│                                 │
│ [Cancelar]        [Salvar]      │
└─────────────────────────────────┘
```

### Quando usar?
- **Adicionar** novo número WhatsApp
- **Conectar/desconectar** números
- **Ver status** de cada número
- **Gerenciar acesso** de usuários

### 🔧 Super Poder do Admin
Quando **admin** está nesta página, vê botão extra:
```
[🔄 Trocar Broker]
```
Permite trocar de **UAZapi** para **Evolution API**, **Baileys**, etc.

---

## 3️⃣ 💬 Conversas

**Rota:** `/conversas`

### O que é?
Interface de **chat em tempo real** com clientes, estilo WhatsApp Web.

### O que mostra?

#### Layout (2 colunas)
```
┌────────────────────────────────────────────────────┐
│ Conversas                                          │
├──────────────────┬─────────────────────────────────┤
│ LISTA DE CHATS   │ CONVERSA ATIVA                  │
│                  │                                 │
│ 🔍 Buscar...     │ João Silva                      │
│                  │ +55 11 99999-8888              │
│ [Todas ▼]        │ ═══════════════════════════     │
│                  │                                 │
│ 👤 João Silva    │ [Hoje 10:30] João:              │
│    Oi, tudo bem? │ Olá, gostaria de saber sobre   │
│    2min          │ o produto X                     │
│    ●●            │                                 │
│                  │ [10:31] Você:                   │
│ 👤 Maria Santos  │ Olá João! Claro, o produto X   │
│    Obrigada!     │ custa R$ 99,90                  │
│    15min         │                                 │
│    ✓✓            │ [10:32] João:                   │
│                  │ Perfeito, quero comprar!        │
│ 👤 Pedro Costa   │                                 │
│    Onde fica?    │ [10:33] Você:                   │
│    1h            │ Ótimo! Vou te enviar o link... │
│    ✓             │                                 │
│                  │ ┌───────────────────────────┐  │
│ 👤 Ana Souza     │ │ Digite sua mensagem...    │  │
│    [imagem]      │ │ [📎] [😊] [🎤]           │  │
│    3h            │ └───────────────────────────┘  │
│    ✓✓            │                                 │
└──────────────────┴─────────────────────────────────┘
```

### Funcionalidades

#### Lista de conversas (sidebar)
- **Preview** da última mensagem
- **Tempo** relativo ("2min", "1h", "3d")
- **Status de leitura:**
  - ○ = Não enviado
  - ✓ = Enviado
  - ✓✓ = Entregue
  - ●● = Lido (azul)
- **Filtros:**
  - Todas
  - Não lidas
  - Conectadas
  - Desconectadas

#### Chat ativo (main)
- **Timeline** de mensagens
- **Data/hora** de cada mensagem
- **Quem enviou** (você ou cliente)
- **Mídia:** imagens, vídeos, áudios, documentos
- **Status** de cada mensagem

#### Enviar mensagem
```
┌───────────────────────────────────┐
│ Digite sua mensagem...            │
│                                   │
│ [📎 Anexar] [😊 Emoji] [🎤 Áudio] │
└───────────────────────────────────┘
```

- **Enter** = Enviar
- **Shift+Enter** = Quebra de linha
- **📎** = Upload de arquivo
- **😊** = Seletor de emoji
- **🎤** = Gravar áudio

#### Estados especiais
```
┌─────────────────────────────────┐
│ ⚠️ Esta instância está          │
│    desconectada                 │
│                                 │
│ [Reconectar Agora]              │
└─────────────────────────────────┘
```

### Quando usar?
- **Atender clientes** em tempo real
- **Responder perguntas** imediatas
- **Fazer vendas** via chat
- **Suporte técnico** ao vivo

### Diferença para "Mensagens"?
- **Conversas** = Chat AO VIVO (agora)
- **Mensagens** = Histórico e relatórios

---

## 4️⃣ 📩 Mensagens

**Rota:** `/integracoes/messages`

### O que é?
**Dashboard analítico** de todas as mensagens enviadas/recebidas.

### O que mostra?

#### Cards de métricas
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Enviadas     │ │ Entregues    │ │ Lidas        │ │ Falhadas     │
│              │ │              │ │              │ │              │
│   1.234      │ │   1.180      │ │     956      │ │      54      │
│              │ │   (95.6%)    │ │   (81.0%)    │ │   (4.4%)     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

#### Filtros avançados
```
┌─────────────────────────────────────────────────────┐
│ Filtros                                             │
├─────────────────────────────────────────────────────┤
│ Período: [Hoje ▼]                                   │
│          Hoje | Ontem | Última semana | Último mês  │
│                                                     │
│ Status: [Todas ▼]                                   │
│         Todas | Entregues | Lidas | Falhadas       │
│                                                     │
│ Instância: [Todas ▼]                                │
│            WA Vendas | WA Suporte | WA Marketing    │
│                                                     │
│ Tipo: [Todas ▼]                                     │
│       Texto | Imagem | Vídeo | Áudio | Documento   │
│                                                     │
│ [Aplicar Filtros] [Limpar]                          │
└─────────────────────────────────────────────────────┘
```

#### Tabela de mensagens
```
┌─────────────────────────────────────────────────────────────┐
│ Data/Hora │ De/Para      │ Mensagem         │ Status        │
├─────────────────────────────────────────────────────────────┤
│ 10:30     │ → João Silva │ Olá, tudo bem?   │ ✓✓ Lida       │
│ 10:25     │ ← Maria      │ Oi! Preciso...   │ ✓ Entregue    │
│ 10:20     │ → Pedro      │ [imagem.jpg]     │ ✓✓ Lida       │
│ 10:15     │ → Ana Souza  │ Promoção hoje!   │ ❌ Falhada    │
│ 10:10     │ ← Carlos     │ Obrigado!        │ ✓✓ Lida       │
└─────────────────────────────────────────────────────────────┘
```

#### Ações
```
[📊 Exportar CSV] [📄 Exportar Excel] [📧 Enviar Relatório]
```

#### Detalhes de mensagem falhada
Clicar em mensagem falhada:
```
┌─────────────────────────────────┐
│ Detalhes da Falha               │
├─────────────────────────────────┤
│ Para: +55 11 99999-8888         │
│ Mensagem: "Promoção hoje!"      │
│                                 │
│ Erro:                           │
│ "Número bloqueou WhatsApp       │
│  Business"                      │
│                                 │
│ Código: ERR_BLOCKED             │
│                                 │
│ [Reenviar] [Marcar como Visto]  │
└─────────────────────────────────┘
```

### Quando usar?
- **Analisar** performance de mensagens
- **Exportar** relatórios para gestão
- **Identificar** mensagens falhadas
- **Reenviar** mensagens com erro
- **Ver histórico** completo

### Diferença para "Conversas"?
| Conversas | Mensagens |
|-----------|-----------|
| Chat ao vivo | Histórico analítico |
| Tempo real | Relatórios |
| Atender agora | Analisar depois |
| Interface de chat | Tabela de dados |

---

## 5️⃣ 📋 Projetos

**Rota:** `/integracoes/projects`

### O que é?
Sistema de **organização** de campanhas, equipes e iniciativas.

### O que mostra?

#### Lista de projetos
```
┌─────────────────────────────────────────────────────┐
│ Projetos                         [+ Novo Projeto]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────┐        │
│ │ 🎯 Campanha Black Friday 2024           │        │
│ │ ────────────────────────────────────    │        │
│ │ Status: 🟢 Ativa                        │        │
│ │                                         │        │
│ │ Instâncias: 3                           │        │
│ │ • WA Vendas                             │        │
│ │ • WA Marketing                          │        │
│ │ • WA Suporte                            │        │
│ │                                         │        │
│ │ Equipe: 5 pessoas                       │        │
│ │ • João Silva (Líder)                    │        │
│ │ • Maria Santos                          │        │
│ │ • Pedro Costa                           │        │
│ │ • Ana Souza                             │        │
│ │ • Carlos Lima                           │        │
│ │                                         │        │
│ │ Métricas:                               │        │
│ │ • Mensagens enviadas: 5.000             │        │
│ │ • Taxa de resposta: 45%                 │        │
│ │ • Conversões: 600 (12%)                 │        │
│ │ • Receita gerada: R$ 59.400,00          │        │
│ │                                         │        │
│ │ Período: 01/11 a 30/11/2024            │        │
│ │                                         │        │
│ │ [Ver Detalhes] [Editar] [Pausar]       │        │
│ └─────────────────────────────────────────┘        │
│                                                     │
│ ┌─────────────────────────────────────────┐        │
│ │ 💬 Atendimento Suporte Técnico          │        │
│ │ ────────────────────────────────────    │        │
│ │ Status: 🟢 Ativa                        │        │
│ │                                         │        │
│ │ Instâncias: 2                           │        │
│ │ • WA Suporte 1                          │        │
│ │ • WA Suporte 2                          │        │
│ │                                         │        │
│ │ Equipe: 3 pessoas                       │        │
│ │                                         │        │
│ │ Métricas:                               │        │
│ │ • Conversas/mês: 1.200                  │        │
│ │ • Tempo médio: 5.2 min                  │        │
│ │ • CSAT: 4.5/5.0 ⭐                       │        │
│ │                                         │        │
│ │ [Ver Detalhes] [Editar] [Relatório]    │        │
│ └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

#### Criar novo projeto
```
┌─────────────────────────────────┐
│ Novo Projeto                    │
├─────────────────────────────────┤
│ Nome:                           │
│ [Campanha Natal 2024]           │
│                                 │
│ Descrição:                      │
│ [Campanha de vendas para...]    │
│                                 │
│ Instâncias:                     │
│ ☑ WA Vendas                     │
│ ☑ WA Marketing                  │
│ ☐ WA Suporte                    │
│                                 │
│ Equipe:                         │
│ ☑ João Silva                    │
│ ☑ Maria Santos                  │
│ ☐ Pedro Costa                   │
│                                 │
│ Período:                        │
│ De: [01/12/2024]                │
│ Até: [24/12/2024]               │
│                                 │
│ [Cancelar]        [Criar]       │
└─────────────────────────────────┘
```

#### Detalhes do projeto
```
┌─────────────────────────────────────────────────────┐
│ Campanha Black Friday 2024                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📊 Dashboard do Projeto                             │
│                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│ │ Mensagens    │ │ Respostas    │ │ Conversões   ││
│ │   5.000      │ │   2.250      │ │     600      ││
│ │              │ │   (45%)      │ │   (12%)      ││
│ └──────────────┘ └──────────────┘ └──────────────┘│
│                                                     │
│ 📈 Gráfico de Performance                           │
│  [Gráfico de barras por dia]                       │
│                                                     │
│ 👥 Equipe                                           │
│  • João Silva - 1.200 mensagens enviadas           │
│  • Maria Santos - 1.500 mensagens enviadas         │
│  • Pedro Costa - 1.000 mensagens enviadas          │
│                                                     │
│ 🎯 Metas                                            │
│  • Enviar 10.000 mensagens ▓▓▓▓▓░░░░░ 50%          │
│  • Atingir 1.000 conversões ▓▓▓▓▓▓░░░░ 60%         │
│                                                     │
│ [Exportar Relatório] [Editar Projeto]              │
└─────────────────────────────────────────────────────┘
```

### Quando usar?
- **Organizar campanhas** (Black Friday, Natal, etc)
- **Dividir equipes** por projeto
- **Acompanhar metas** e KPIs
- **Gerar relatórios** por campanha
- **Comparar** performance entre projetos

### Exemplos de projetos
1. **Campanha Black Friday** (vendas)
2. **Atendimento Suporte** (SAC)
3. **Vendas Outbound** (prospecção)
4. **Reativação de Clientes** (relacionamento)
5. **Onboarding Novos Clientes** (educação)

---

## 6️⃣ 👥 Usuários

**Rota:** `/integracoes/users`

### O que é?
Gerenciamento de **usuários da organização** ACME.

### O que mostra?

#### Lista de usuários
```
┌─────────────────────────────────────────────────────┐
│ Usuários                          [+ Novo Usuário]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 🔍 [Buscar por nome ou email...]                    │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │Nome         │Email           │Role    │Status  ││
│ ├─────────────────────────────────────────────────┤│
│ │👑 João Silva│joao@acme.com   │Master  │🟢 Ativo││
│ │👔 Maria     │maria@acme.com  │Manager │🟢 Ativo││
│ │👤 Pedro     │pedro@acme.com  │User    │🟢 Ativo││
│ │👤 Ana Souza │ana@acme.com    │User    │🟢 Ativo││
│ │👤 Carlos    │carlos@acme.com │User    │🔴 Inativo││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Total: 5 usuários (4 ativos, 1 inativo)            │
└─────────────────────────────────────────────────────┘
```

#### Roles (permissões)
```
┌───────────────────────────────────┐
│ Roles na Organização              │
├───────────────────────────────────┤
│ 👑 Master (Dono)                  │
│  • Acesso total                   │
│  • Pode deletar instâncias        │
│  • Gerencia usuários              │
│                                   │
│ 👔 Manager (Gerente)              │
│  • Criar/editar instâncias        │
│  • Ver relatórios                 │
│  • Gerenciar projetos             │
│                                   │
│ 👤 User (Usuário)                 │
│  • Ver instâncias                 │
│  • Enviar mensagens               │
│  • Ver conversas                  │
└───────────────────────────────────┘
```

#### Adicionar usuário
```
┌─────────────────────────────────┐
│ Novo Usuário                    │
├─────────────────────────────────┤
│ Nome:                           │
│ [Lucas Oliveira]                │
│                                 │
│ Email:                          │
│ [lucas@acme.com]                │
│                                 │
│ Role:                           │
│ (○) Master                      │
│ (○) Manager                     │
│ (●) User                        │
│                                 │
│ Instâncias com acesso:          │
│ ☑ WA Vendas                     │
│ ☑ WA Suporte                    │
│ ☐ WA Marketing                  │
│                                 │
│ [Cancelar]    [Enviar Convite]  │
└─────────────────────────────────┘
```

#### Editar usuário
```
┌─────────────────────────────────┐
│ Editar Usuário - Pedro Costa    │
├─────────────────────────────────┤
│ Nome: [Pedro Costa]             │
│ Email: pedro@acme.com (fixo)    │
│                                 │
│ Role:                           │
│ (○) Master                      │
│ (●) Manager  ← PROMOVER         │
│ (○) User                        │
│                                 │
│ Status:                         │
│ (●) Ativo                       │
│ (○) Inativo                     │
│                                 │
│ Instâncias:                     │
│ ☑ WA Vendas                     │
│ ☑ WA Suporte                    │
│ ☑ WA Marketing (novo)           │
│                                 │
│ [Cancelar]        [Salvar]      │
└─────────────────────────────────┘
```

### Quando usar?
- **Adicionar** novos membros da equipe
- **Promover/rebaixar** usuários (User → Manager)
- **Desativar** usuários que saíram
- **Controlar acesso** a instâncias específicas
- **Ver atividade** de cada usuário

---

## 7️⃣ 🔗 Webhooks

**Rota:** `/integracoes/webhooks`

### O que é?
Configuração de **integrações automáticas** com sistemas externos.

### O que mostra?

#### Lista de webhooks
```
┌─────────────────────────────────────────────────────┐
│ Webhooks                          [+ Novo Webhook]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ 📡 Webhook CRM (Salesforce)                     ││
│ │ ────────────────────────────────────────────    ││
│ │ URL: https://api.salesforce.com/webhook         ││
│ │                                                 ││
│ │ Eventos:                                        ││
│ │ ✓ message.received (Mensagem recebida)          ││
│ │ ✓ message.read (Mensagem lida)                  ││
│ │ ✗ status.changed (Status mudou)                 ││
│ │                                                 ││
│ │ Status: 🟢 Ativo                                ││
│ │                                                 ││
│ │ Últimas entregas:                               ││
│ │ ✅ 200 OK - há 2min                             ││
│ │ ✅ 200 OK - há 5min                             ││
│ │ ✅ 200 OK - há 10min                            ││
│ │                                                 ││
│ │ [Testar] [Editar] [Ver Logs] [Pausar]          ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ 📡 Webhook Analytics (Google)                   ││
│ │ ────────────────────────────────────────────    ││
│ │ URL: https://analytics.google.com/collect       ││
│ │                                                 ││
│ │ Eventos:                                        ││
│ │ ✓ message.sent (Mensagem enviada)               ││
│ │ ✓ message.delivered (Mensagem entregue)         ││
│ │                                                 ││
│ │ Status: 🟡 Pausado                              ││
│ │                                                 ││
│ │ [Ativar] [Editar] [Ver Logs]                   ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

#### Criar webhook
```
┌─────────────────────────────────┐
│ Novo Webhook                    │
├─────────────────────────────────┤
│ Nome:                           │
│ [Webhook E-commerce Shopify]    │
│                                 │
│ URL:                            │
│ [https://myshop.com/webhook]    │
│                                 │
│ Método:                         │
│ (●) POST                        │
│ (○) GET                         │
│                                 │
│ Headers (opcional):             │
│ Authorization: Bearer abc123... │
│                                 │
│ Eventos:                        │
│ ☑ message.received              │
│ ☑ message.sent                  │
│ ☑ message.read                  │
│ ☐ status.changed                │
│ ☐ qrcode.updated                │
│                                 │
│ Instâncias:                     │
│ ☑ WA Vendas                     │
│ ☐ WA Suporte                    │
│ ☐ WA Marketing                  │
│                                 │
│ [Testar Webhook] [Cancelar]     │
│                  [Criar]        │
└─────────────────────────────────┘
```

#### Eventos disponíveis
```
┌───────────────────────────────────┐
│ Eventos de Webhook                │
├───────────────────────────────────┤
│ 📩 message.received               │
│    Quando receber mensagem        │
│                                   │
│ 📤 message.sent                   │
│    Quando enviar mensagem         │
│                                   │
│ ✅ message.delivered              │
│    Quando entregar mensagem       │
│                                   │
│ 👁️ message.read                  │
│    Quando ler mensagem            │
│                                   │
│ 🔄 status.changed                 │
│    Quando status mudar            │
│    (conectado/desconectado)       │
│                                   │
│ 📱 qrcode.updated                 │
│    Quando gerar novo QR Code      │
└───────────────────────────────────┘
```

#### Logs do webhook
```
┌─────────────────────────────────────────────────────┐
│ Logs - Webhook CRM                                  │
├─────────────────────────────────────────────────────┤
│ Data/Hora │ Evento           │ Status │ Resposta   │
├─────────────────────────────────────────────────────┤
│ 10:30     │ message.received │ ✅ 200 │ OK         │
│ 10:25     │ message.read     │ ✅ 200 │ OK         │
│ 10:20     │ message.received │ ❌ 500 │ Timeout    │
│ 10:15     │ message.received │ ✅ 200 │ OK         │
│ 10:10     │ message.read     │ ❌ 404 │ Not Found  │
└─────────────────────────────────────────────────────┘

Taxa de sucesso: 60% (3/5)
```

#### Payload do webhook
Quando evento acontece, envia JSON:
```json
{
  "event": "message.received",
  "timestamp": "2024-10-04T10:30:00Z",
  "instance": {
    "id": "uuid-123",
    "name": "WA Vendas",
    "phoneNumber": "+5511999990001"
  },
  "message": {
    "id": "msg-456",
    "from": "+5511888887777",
    "body": "Olá, gostaria de comprar",
    "timestamp": "2024-10-04T10:30:00Z",
    "type": "text"
  }
}
```

### Quando usar?
- **Integrar** com CRM (Salesforce, HubSpot)
- **Enviar** para Analytics (Google, Mixpanel)
- **Sincronizar** com E-commerce (Shopify, WooCommerce)
- **Notificar** sistemas internos
- **Automatizar** processos

### Exemplos de uso
1. **Mensagem recebida** → Cria ticket no Zendesk
2. **Mensagem lida** → Atualiza status no Salesforce
3. **Status mudou** → Notifica time no Slack
4. **Nova venda** → Envia para Google Analytics

---

## 8️⃣ ⚙️ Configurações

**Rota:** `/integracoes/settings`

### O que é?
Preferências e configurações da **organização ACME**.

### O que mostra?

#### Seções

##### 1. Perfil da Organização
```
┌─────────────────────────────────────────┐
│ 🏢 Perfil da Organização                │
├─────────────────────────────────────────┤
│ Nome:                                   │
│ [ACME Corporation                    ]  │
│                                         │
│ Documento (CNPJ):                       │
│ 12.345.678/0001-90                      │
│                                         │
│ Logo:                                   │
│ [📷 logo-acme.png] [Alterar]            │
│                                         │
│ Fuso horário:                           │
│ [America/Sao_Paulo              ▼]      │
│                                         │
│ Idioma:                                 │
│ [Português (BR)                 ▼]      │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

##### 2. Mensagens Automáticas
```
┌─────────────────────────────────────────┐
│ 💬 Mensagens Automáticas                │
├─────────────────────────────────────────┤
│ Mensagem de boas-vindas:                │
│ ┌─────────────────────────────────────┐ │
│ │ Olá! 👋                             │ │
│ │ Bem-vindo à ACME Corporation.       │ │
│ │ Como posso ajudar você hoje?        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Mensagem de ausência:                   │
│ ┌─────────────────────────────────────┐ │
│ │ Obrigado pela mensagem!             │ │
│ │ Estamos fora do horário de          │ │
│ │ atendimento.                        │ │
│ │ Retornaremos em breve.              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

##### 3. Horário de Atendimento
```
┌─────────────────────────────────────────┐
│ 🕐 Horário de Atendimento               │
├─────────────────────────────────────────┤
│ Segunda a Sexta:                        │
│ De: [09:00] Até: [18:00]                │
│                                         │
│ Sábado:                                 │
│ De: [09:00] Até: [12:00]                │
│                                         │
│ Domingo:                                │
│ ☑ Fechado                               │
│                                         │
│ Feriados:                               │
│ ☑ Seguir calendário brasileiro          │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

##### 4. Integrações Externas
```
┌─────────────────────────────────────────┐
│ 🔗 Integrações Externas                 │
├─────────────────────────────────────────┤
│ Salesforce CRM                          │
│ Status: 🟢 Conectado                    │
│ [Desconectar] [Configurar]              │
│                                         │
│ Google Analytics                        │
│ Status: 🔴 Não conectado                │
│ [Conectar]                              │
│                                         │
│ Shopify E-commerce                      │
│ Status: 🔴 Não conectado                │
│ [Conectar]                              │
│                                         │
│ [Adicionar Integração]                  │
└─────────────────────────────────────────┘
```

##### 5. Segurança
```
┌─────────────────────────────────────────┐
│ 🔐 Segurança                            │
├─────────────────────────────────────────┤
│ Autenticação de Dois Fatores (2FA):    │
│ (●) Ativo                               │
│ (○) Inativo                             │
│                                         │
│ Whitelist de IPs:                       │
│ ☑ Ativar restrição de IP                │
│                                         │
│ IPs permitidos:                         │
│ 192.168.1.100                           │
│ 200.150.10.50                           │
│ [+ Adicionar IP]                        │
│                                         │
│ Logs de Auditoria:                      │
│ [Ver Logs de Segurança]                 │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

##### 6. Plano e Faturamento
```
┌─────────────────────────────────────────┐
│ 💳 Plano e Faturamento                  │
├─────────────────────────────────────────┤
│ Plano Atual: PRO                        │
│ Valor: R$ 299,00/mês                    │
│                                         │
│ Limites:                                │
│ • Instâncias: 10/15                     │
│ • Usuários: 8/20                        │
│ • Mensagens/mês: 45.000/100.000         │
│                                         │
│ Próximo vencimento: 15/11/2024          │
│                                         │
│ [Fazer Upgrade] [Alterar Forma de Pgto] │
│                                         │
│ Histórico de Pagamentos:                │
│ • 15/10/2024 - R$ 299,00 ✅ Pago        │
│ • 15/09/2024 - R$ 299,00 ✅ Pago        │
│ • 15/08/2024 - R$ 299,00 ✅ Pago        │
│                                         │
│ [Ver Histórico Completo]                │
└─────────────────────────────────────────┘
```

### Quando usar?
- **Alterar** nome ou logo da empresa
- **Configurar** mensagens automáticas
- **Definir** horário de atendimento
- **Conectar** integrações (CRM, analytics)
- **Ativar** segurança (2FA, whitelist)
- **Gerenciar** plano e pagamentos

---

## 📊 Tabela Resumo

| Página | Para que serve | Tempo Real | Principal Uso |
|--------|----------------|------------|---------------|
| **📊 Dashboard** | Visão geral | ✅ Sim | Ver métricas e status |
| **🔌 Integrações** | Gerenciar números | ⚡ Eventos | Conectar/desconectar números |
| **💬 Conversas** | Chat ao vivo | ✅ Sim | Atender clientes agora |
| **📩 Mensagens** | Histórico | ❌ Não | Relatórios e análises |
| **📋 Projetos** | Campanhas | ❌ Não | Organizar equipes |
| **👥 Usuários** | Equipe | ❌ Não | Gerenciar acessos |
| **🔗 Webhooks** | Automação | ⚡ Eventos | Integrar sistemas |
| **⚙️ Configurações** | Preferências | ❌ Não | Configurar organização |

---

## 🎯 Fluxo de Uso Típico

### Manhã (09:00):
1. **📊 Dashboard** → Ver resumo do dia
2. **💬 Conversas** → Atender clientes

### Durante o dia:
3. **💬 Conversas** → Continuar atendimentos
4. **📩 Mensagens** → Verificar mensagens falhadas

### Final do dia (18:00):
5. **📊 Dashboard** → Ver métricas finais
6. **📩 Mensagens** → Exportar relatório
7. **📋 Projetos** → Atualizar status

### Semanal:
8. **👥 Usuários** → Revisar acessos
9. **🔗 Webhooks** → Ver logs de integrações
10. **⚙️ Configurações** → Ajustar preferências

---

**Tudo claro agora?** Cada página tem um propósito específico e complementar! 🚀
