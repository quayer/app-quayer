# Antigravity Agent Context - app-quayer

## 1. Project Overview
**Name:** app-quayer
**Type:** Igniter.js Next.js Starter Application
**Core Stack:**
- **Framework:** Next.js 15.3.5 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4
- **Database:** Prisma with PostgreSQL
- **State/API:** Igniter.js, React Query
- **Testing:** Vitest, Playwright

## 2. Key Documentation & Rules
This project maintains strict operational rules and documentation in:
- **`AGENT.md`**: Comprehensive operational guide and agent identity ("Lia").
- **`CLAUDE.md`**: Instructions specifically for Claude, but relevant for project architecture.
- **`.cursor/rules/`**: Detailed rules for specific domains (Frontend, Backend, Testing, etc.).

## 3. Architecture Highlights
- **Feature-based Architecture**: Logic is organized by features in `src/features` (likely, based on Igniter.js patterns).
- **Universal Client**: Uses `api.*` for type-safe calls in both Server and Client components.
- **Real-time**: Server-Sent Events (SSE) integration.
- **Background Jobs**: BullMQ and Redis.

## 4. Operational Protocols (Adapted from AGENT.md)
- **File Analysis**: Always analyze files before editing.
- **Testing**: Maintain high test coverage (Unit, Integration, E2E).
- **Type Safety**: Strict TypeScript usage (no `any`).

## 5. Memory & Notes
*Space for storing session-specific notes or long-term project insights.*

- [ ] Review `.cursor/rules` for specific implementation details when needed.
- [ ] Follow `AGENT.md` guidelines for architectural decisions.
