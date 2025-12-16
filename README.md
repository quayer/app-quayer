# App Quayer - Sistema WhatsApp Multi-Instância

## Status Atual

**Versão**: 1.0.0
**Status**: Production-Ready
**Framework**: Igniter.js + Next.js 15

[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](.)
[![Igniter.js](https://img.shields.io/badge/Igniter.js-Framework-purple)](https://igniterjs.com)
[![Production Deploy](https://github.com/quayer/app-quayer/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/quayer/app-quayer/actions/workflows/deploy-production.yml)

---

## Quick Start

### Pré-requisitos
- Node.js 20+
- PostgreSQL 14+ (ou Docker)
- Redis (opcional, para cache)

### Instalação
```bash
# Clone o repositório
git clone https://github.com/quayer/app-quayer.git
cd app-quayer

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Setup database
npx prisma db push
npx prisma generate

# Iniciar servidor
npm run dev
```

### Acessar
- **App**: http://localhost:3000
- **Admin**: http://localhost:3000/admin
- **API Docs**: http://localhost:3000/api/v1/docs

---

## Arquitetura

### Stack Tecnológico
| Camada | Tecnologia |
|--------|------------|
| **Framework API** | Igniter.js |
| **Frontend** | Next.js 15 + React 19 |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | JWT + Magic Link + OTP |
| **UI** | Shadcn UI + Tailwind CSS |
| **WhatsApp** | UAZapi + Cloud API |

### Features Principais
- Multi-tenancy (Organizações)
- RBAC (Admin + Org Roles)
- WhatsApp Multi-Instância
- Provider-Agnostic (UAZapi, Cloud API)
- Sistema de Compartilhamento Público
- Magic Link + OTP Authentication

---

## Estrutura do Projeto

```
app-quayer/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Rotas de autenticação
│   │   ├── admin/             # Área administrativa
│   │   ├── integracoes/       # Área de integrações
│   │   └── api/v1/            # API Routes (Igniter.js)
│   ├── components/            # Componentes React
│   │   └── ui/                # Shadcn UI components
│   ├── features/              # Features do Igniter.js
│   │   ├── auth/              # Autenticação
│   │   ├── instances/         # Instâncias WhatsApp
│   │   ├── messages/          # Mensagens
│   │   ├── organizations/     # Organizações
│   │   ├── sessions/          # Sessões de chat
│   │   └── webhooks/          # Webhooks
│   ├── lib/
│   │   └── providers/         # Provider Orchestrators
│   │       ├── core/          # Orchestrator para mensagens
│   │       └── orchestrator/  # Orchestrator para instâncias
│   └── services/              # Serviços compartilhados
├── prisma/                    # Schema e migrations
├── docs/                      # Documentação
│   ├── api-specs/            # Specs de APIs externas
│   └── guides/               # Guias de uso
├── scripts/                   # Scripts de automação
└── .cursor/rules/            # Regras do AI Agent (Lia)
```

---

## Documentação

### API Specs (docs/api-specs/)
| Arquivo | Descrição |
|---------|-----------|
| `uazapi-openapi.yaml` | OpenAPI spec da UAZapi |
| `whatsapp-cloud-api.postman.json` | Meta WhatsApp Cloud API |
| `supabase-api.postman.json` | Supabase API reference |
| `chatwoot-api.postman.json` | Chatwoot API reference |

### Guias
- [docs/PRD.md](docs/PRD.md) - Product Requirements Document
- [docs/INDEX.md](docs/INDEX.md) - Índice da documentação
- [CLAUDE.md](CLAUDE.md) - Instruções do AI Agent

---

## Provider Architecture

O sistema usa dois orchestrators para WhatsApp:

| Orchestrator | Responsabilidade | Interface |
|--------------|------------------|-----------|
| `core/orchestrator.ts` | Mensagens (Igniter.js) | `IWhatsAppProvider` |
| `orchestrator/provider.orchestrator.ts` | Instâncias (connect, status) | `IProviderAdapter` |

### Providers Suportados
- **UAZapi** - WhatsApp Web API
- **Cloud API** - Meta Official API

---

## Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev              # Iniciar servidor dev
npm run build            # Build produção
npm run start            # Iniciar produção

# Database
npx prisma db push       # Sincronizar schema
npx prisma generate      # Gerar client
npx prisma studio        # Interface visual

# Deploy
./scripts/deploy.sh      # Deploy manual
./scripts/backup.sh      # Backup do banco
```

---

## CI/CD

### GitHub Actions
O pipeline roda automaticamente:
- **CI**: Lint, typecheck, build em PRs
- **Deploy**: Automático em releases

### Secrets Necessários
| Secret | Descrição |
|--------|-----------|
| `HOST` | IP do servidor |
| `USERNAME` | Usuário SSH |
| `PASSWORD` | Senha SSH |

---

## Segurança

### Autenticação
- **Magic Link**: Login via e-mail
- **OTP**: Código de 6 dígitos
- **JWT Tokens**: Access (15min) + Refresh (7d)
- **Cookie httpOnly**: Tokens seguros

### Autorização
- **System Roles**: admin, user
- **Org Roles**: master, manager, agent, viewer
- **Middleware**: Proteção de rotas
- **Procedures**: Validação por endpoint

---

## Variáveis de Ambiente

Ver `.env.example` para lista completa. Principais:

```env
# Database
DATABASE_URL="postgresql://..."

# Auth
JWT_SECRET="..."
IGNITER_APP_SECRET="..."

# WhatsApp Providers
UAZAPI_URL="https://..."
UAZAPI_ADMIN_TOKEN="..."

# Email
SMTP_HOST="..."
SMTP_USER="..."
SMTP_PASSWORD="..."
```

---

## Limpeza Realizada (Dez/2024)

### Arquivos Removidos
- `test/` - 115 arquivos de teste (fresh start)
- `docs/` - 205+ arquivos obsoletos consolidados
- `.kiro/` - Duplicata de `.cursor/`
- `.playwright-mcp/` - Screenshots antigos
- `src/test/` - Pasta vazia
- `logs/*.log` - Logs vazios

### Arquivos Organizados
- API specs movidos para `docs/api-specs/`
- `.env.example` simplificado e organizado

---

## Licença

MIT

---

## Suporte

- **Docs**: `docs/`
- **AI Agent**: Ver `CLAUDE.md`
- **Issues**: GitHub Issues

---

**Última atualização**: Dezembro 2024
**Desenvolvido por**: Quayer Team + Lia (AI Agent)
