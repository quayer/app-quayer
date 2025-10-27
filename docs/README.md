# 📚 Documentação Quayer App

Bem-vindo à documentação completa do Quayer App - Sistema de gestão de instâncias WhatsApp.

---

## 🚀 Quick Start

- **[Guia de Início Rápido](guides/DEPLOYMENT_GUIDE.md)** - Como começar a desenvolver
- **[Checklist de Deploy](guides/DEPLOYMENT_CHECKLIST.md)** - Checklist completo
- **[Testes](guides/TESTE_GUIDE.md)** - Como executar testes

---

## 📖 Índice Geral

### 🎯 Guias (`guides/`)
Guias práticos e tutoriais para desenvolvimento e deploy.

- **[DEPLOYMENT_GUIDE.md](guides/DEPLOYMENT_GUIDE.md)** - Guia completo de deployment
- **[DEPLOYMENT_CHECKLIST.md](guides/DEPLOYMENT_CHECKLIST.md)** - Checklist pré-deploy
- **[EASYPANEL_SETUP.md](guides/EASYPANEL_SETUP.md)** - Setup no Easypanel
- **[TESTE_GUIDE.md](guides/TESTE_GUIDE.md)** - Como executar e criar testes

### 🏗️ Implementação (`implementation/`)
Documentação de features implementadas e decisões arquiteturais.

- **[ONBOARDING_IMPLEMENTATION.md](implementation/ONBOARDING_IMPLEMENTATION.md)** - Sistema de onboarding
- **[USER_MANAGEMENT_IMPLEMENTATION.md](implementation/USER_MANAGEMENT_IMPLEMENTATION.md)** - Gestão de usuários
- **[APRENDIZADOS_E_SOLUCOES.md](implementation/APRENDIZADOS_E_SOLUCOES.md)** - Aprendizados e soluções

### 🧩 Componentes (`components/`)
Documentação de componentes UI e bibliotecas.

- **[input-otp-usage.md](components/input-otp-usage.md)** - Como usar Input OTP

### 🎨 UX/UI (`ux/`)
Guias de design e experiência do usuário.

- **UX_AUDIT_BRUTAL.md** - Auditoria de UX
- **UX_IMPROVEMENTS_IMPLEMENTED.md** - Melhorias implementadas
- **UX_PROGRESS_COMPLETE.md** - Progresso UX

### 🔌 API (`api/`)
Documentação de endpoints e integrações.

- **TEST_IMPLEMENTATION_REPORT.md** - Relatório de testes de API

### 📦 Arquivos (`archive/`)
Documentos históricos e arquivados.

- **`sprints/`** - Documentos de sprints anteriores
- **`audits/`** - Auditorias e relatórios antigos

---

## 🛠️ Stack Tecnológica

### Frontend
- **Next.js 15** - Framework React
- **React 19** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **Shadcn/ui** - Componentes UI

### Backend
- **Igniter.js** - Framework Node.js
- **Prisma** - ORM
- **PostgreSQL** - Database
- **Redis** - Cache e jobs
- **BullMQ** - Filas de background

### Integrações
- **UAZAPI** - WhatsApp API
- **Google OAuth** - Autenticação
- **Resend/SMTP** - Envio de emails

### Testes
- **Vitest** - Unit e Integration tests
- **Playwright** - E2E tests
- **Testing Library** - Component tests

### DevOps
- **GitHub Actions** - CI/CD
- **Vercel/Easypanel** - Hosting
- **Docker** - Containerização

---

## 📂 Estrutura do Projeto

```
app-quayer/
├── src/
│   ├── app/              # Next.js App Router (páginas)
│   ├── components/       # Componentes React
│   ├── features/         # Features (controllers, services)
│   ├── hooks/            # React hooks customizados
│   ├── lib/              # Utilitários e helpers
│   └── services/         # Serviços externos
├── prisma/               # Schema e migrations
├── test/                 # Suíte de testes
│   ├── unit/             # Testes unitários
│   ├── api/              # Testes de API
│   └── e2e/              # Testes end-to-end
├── docs/                 # Documentação (você está aqui!)
├── scripts/              # Scripts de automação
└── .github/workflows/    # CI/CD pipelines
```

---

## 🧪 Executando Testes

```bash
# Todos os testes
npm run test:all

# Apenas unit tests
npm run test:unit

# Apenas API tests
npm run test:api

# Apenas E2E tests
npm run test:e2e

# Com cobertura
npm run test:coverage

# Script consolidado (recomendado)
bash scripts/test-complete.sh
```

---

## 🚀 Deploy

### Desenvolvimento
```bash
npm run dev
```

### Produção (Build)
```bash
npm run build
npm run start
```

### Variáveis de Ambiente
Consulte `.env.example` para variáveis necessárias.

**Obrigatórias**:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Chave secreta JWT
- `NEXT_PUBLIC_APP_URL` - URL pública da aplicação

---

## 📊 CI/CD Pipeline

O projeto possui pipeline completo de CI/CD com GitHub Actions:

1. **Lint & TypeCheck** - Verificação de código
2. **Unit Tests** - Testes unitários com cobertura
3. **API Tests** - Testes de integração
4. **E2E Tests** - Testes end-to-end com Playwright
5. **Build** - Build de produção
6. **Security Audit** - Auditoria de segurança
7. **Deploy** - Deploy automático (staging/production)

Ver: `.github/workflows/ci.yml`

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

Ver: [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## 📝 Convenções

### Commits
Usamos [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - Nova feature
- `fix:` - Correção de bug
- `docs:` - Mudanças na documentação
- `test:` - Adicionar/modificar testes
- `refactor:` - Refatoração de código
- `chore:` - Tarefas de manutenção

### Branches
- `main` - Produção
- `develop` - Desenvolvimento
- `feature/*` - Novas features
- `fix/*` - Correções
- `hotfix/*` - Correções urgentes

---

## 📞 Suporte

- **Repositório**: [GitHub](https://github.com/your-org/app-quayer)
- **Issues**: [GitHub Issues](https://github.com/your-org/app-quayer/issues)
- **Email**: contato@quayer.com

---

## 📄 Licença

Este projeto está sob a licença MIT. Ver [LICENSE](../LICENSE) para mais detalhes.

---

## 🔄 Última Atualização

**Data**: 2025-10-12
**Versão**: 1.0.0
**Status**: ✅ Documentação reorganizada e atualizada

---

**Desenvolvido com ❤️ pela equipe Quayer**
