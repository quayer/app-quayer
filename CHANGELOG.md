# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-10-11

### 🎉 Initial Production Release

### 🚀 Features

- **Multi-Instance WhatsApp Management**
  - Create and manage multiple WhatsApp instances
  - QR Code generation (base64, SVG, terminal)
  - Connection polling with real-time updates
  - Profile picture fetching
  - Webhook configuration (admin only)
  - Phone number validation (E.164 format)

- **Authentication & Authorization**
  - JWT authentication with access + refresh tokens
  - Bcrypt password hashing (12 rounds)
  - RBAC with 4 roles (Admin, Master, Manager, User)
  - Google OAuth integration
  - Smart Login-OTP (auto-signup if email doesn't exist)
  - Magic Link authentication
  - Session management with revocation

- **Multi-Tenancy**
  - Organization management (PF/PJ)
  - CPF/CNPJ validation
  - Instance limits per organization
  - Organization switching
  - Member management with roles

- **Projects**
  - Project CRUD operations
  - Link instances to projects
  - Project-based organization

- **Webhooks**
  - Webhook configuration and management
  - Event subscription system
  - HMAC payload signing
  - Retry mechanism (3 attempts)
  - Delivery logs and tracking

- **Email Service**
  - 3 providers (Resend, SMTP, Mock)
  - 6 responsive HTML templates
  - Async/non-blocking delivery
  - Welcome, verification, password reset, invitation emails

### ⚡ Improvements

- **Performance**
  - Optimized polling: 10s for lists, 3s for status
  - Redis caching with intelligent invalidation
  - Database indexes for critical queries
  - React Query integration for client-side caching

- **Testing**
  - 120+ automated test cases
  - Unit tests (70+ cases): Phone validator, UAZapi service, React hooks
  - API integration tests (15+ cases)
  - E2E tests (19+ cases): RBAC, QR Code, Real-time polling
  - Critical auth tests (OTP, Google OAuth)

- **CI/CD**
  - Complete GitHub Actions pipeline
  - Automated linting and type checking
  - Unit, API, and E2E test automation
  - Security audit (npm audit, Trivy)
  - Automatic deployment to staging (Vercel)
  - Production deployment with manual approval
  - Docker image build and push
  - Automatic release notes generation

- **Docker**
  - Multi-stage optimized Dockerfile (~200-300MB)
  - Production-ready docker-compose.prod.yml
  - Health check endpoint
  - Non-root user for security
  - Comprehensive .dockerignore

### 📝 Documentation

- Comprehensive README with setup instructions
- API documentation (OpenAPI/Swagger)
- Environment configuration guide (.env.example)
- Knowledge base (docs/APRENDIZADOS_E_SOLUCOES.md)
- Deployment checklist
- Contributing guidelines
- Testing documentation

### 🔧 Infrastructure

- PostgreSQL 15 with Prisma ORM
- Redis 7 for caching and queues
- BullMQ for background jobs
- Igniter.js framework (v0.2.80)
- Next.js 15 with App Router
- TypeScript 5 with strict mode
- Tailwind CSS 4
- shadcn/ui components

### 📦 Dependencies

- @igniter-js/core: ^0.2.80
- next: 15.3.5
- react: ^19.0.0
- @prisma/client: ^6.11.1
- @tanstack/react-query: ^5.90.2
- zod: ^3.25.76
- libphonenumber-js: ^1.12.24
- And 70+ other production dependencies

### 🛡️ Security

- Rate limiting with Upstash Redis
- CORS configuration
- Helmet security headers
- Input validation with Zod
- SQL injection protection (Prisma)
- XSS protection
- CSRF tokens
- Secure cookie handling

### 🌐 Deployment

- Vercel for hosting (staging + production)
- Docker support with Dockerfile
- Easypanel-ready configuration
- Health check endpoint
- Environment-based configuration
- CI/CD automation with GitHub Actions

---

## Version History

- **1.0.0** (2025-10-11) - Initial production release

[unreleased]: https://github.com/Quayer/app-quayer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Quayer/app-quayer/releases/tag/v1.0.0
