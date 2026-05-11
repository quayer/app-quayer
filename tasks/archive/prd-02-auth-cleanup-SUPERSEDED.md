# PRD 02: Auth Cleanup (Data-Driven)

**Versão:** 1.0
**Data:** 2026-04-08
**Release:** 2 de 3 (ver [prd-auth-releases-index.md](prd-auth-releases-index.md))
**Branch:** `feat/auth-cleanup`
**Pré-requisito:** Release 1 (testing pipeline) 100% completa e rodando em prod

---

## 1. Introdução

Remover rotas e componentes de auth legados (`/register`, `/forgot-password`, `/reset-password/[token]`, `/login/verify-magic`, `/signup/verify-magic`) **somente depois** de confirmar via **tráfego real em produção** que não estão em uso. Sem observação, sem deleção.

**Princípio:** `grep` não é prova. Log é.

---

## 2. Goals

- Instrumentar rotas candidatas para medir tráfego real por 14 dias
- Deprecate formal (warning header + log) em rotas sem tráfego significativo
- Comunicar deprecation via changelog e (se aplicável) aviso in-app
- Deletar fisicamente rotas confirmadas mortas após período de observação
- Atualizar emails transacionais e templates que possam referenciar rotas removidas
- Documentar decisão em `docs/auth/CLEANUP_AUDIT.md`

---

## 3. User Stories

### **FASE A — Medição (semana 1-2)**

#### US-201: Instrumentar rotas candidatas com logging estruturado
**Description:** Como engenheiro, preciso de métricas de acesso real antes de decidir o que deletar.

**Acceptance Criteria:**
- [ ] Cada rota candidata (`/register`, `/forgot-password`, `/reset-password/[token]`, `/login/verify-magic`, `/signup/verify-magic`) tem log estruturado na entrada contendo:
  - `route`, `method`, `userAgent`, `referrer`, `ip` (hashed), `hasAuthCookie`, `timestamp`
- [ ] Logs vão para o agregador de logs atual do projeto (ou arquivo em `logs/cleanup-audit/` se não houver)
- [ ] Endpoints de API relacionados também instrumentados (ex: `POST /api/v1/auth/forgot-password`)
- [ ] **Não muda comportamento funcional** — só adiciona log
- [ ] Deploy em prod e início da janela de observação de **14 dias corridos**

#### US-202: Audit de referências estáticas
**Description:** Paralelo à medição runtime, fazer grep completo do codebase e repositórios relacionados.

**Acceptance Criteria:**
- [ ] Relatório em `docs/auth/CLEANUP_AUDIT.md` listando para cada rota candidata:
  - Arquivos que referenciam (frontend, backend, docs, comments)
  - Templates de email que apontam para ela
  - Configs que mencionam (next.config.js, middleware.ts)
  - Tests que a cobrem
- [ ] Grep também em: repositórios de landing page, apps mobile (se existir), documentação externa
- [ ] Cada referência encontrada tem recomendação: `KEEP` / `UPDATE` / `DELETE`

#### US-203: Verificação de integrações externas
**Description:** Garantir que integrações (emails, webhooks, links em apps terceiros) não dependem das rotas candidatas.

**Acceptance Criteria:**
- [ ] Emails transacionais auditados: listar todos os templates e as URLs neles
- [ ] SDK/apps de integração revisados
- [ ] Documentação pública (site, help center) revisada
- [ ] Lista publicada em `docs/auth/CLEANUP_AUDIT.md` seção "External References"

### **FASE B — Análise (fim da semana 2)**

#### US-204: Análise de logs e decisão por rota
**Description:** Após 14 dias, consolidar dados e decidir por rota: manter, deprecate ou delete.

**Acceptance Criteria:**
- [ ] Para cada rota candidata, relatório em `docs/auth/CLEANUP_AUDIT.md`:
  - Requests totais no período
  - Requests únicos (por IP hashed)
  - Distribuição temporal (alguma concentração suspeita?)
  - User-agents (bot vs humano)
  - Referrers (origem do tráfego)
- [ ] **Decisão por rota**, registrada e aprovada pelo founder:
  - `< 5 requests reais (humanos) em 14 dias` → elegível para DELETE
  - `5-50 requests` → elegível para DEPRECATE (fase C), re-avaliar em 30 dias
  - `> 50 requests` → KEEP, investigar por quê
- [ ] Decisão documentada com assinatura/aprovação explícita do founder

### **FASE C — Deprecate (semana 3)**

#### US-205: Adicionar warnings de deprecation
**Description:** Rotas elegíveis para remoção ganham warning visual e header HTTP antes de serem deletadas.

**Acceptance Criteria:**
- [ ] Response headers incluem `Deprecation: true` e `Sunset: <data futura>` (RFC 8594)
- [ ] Página exibe banner visível: "Esta página será removida em [data]. Use [alternativa]."
- [ ] Log de deprecation warning disparado a cada acesso
- [ ] Continua funcional — só avisa
- [ ] Changelog atualizado anunciando deprecation

#### US-206: Atualizar changelog e comunicação
**Description:** Comunicar mudança antes de executar.

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` com seção "Deprecated" listando rotas e datas
- [ ] Se houver página de status/help center: publicar aviso
- [ ] Se houver usuários afetados identificáveis: email de aviso (ou in-app notification)

### **FASE D — Deleção (após período de deprecation)**

#### US-207: Atualizar templates de email transacionais
**Description:** Antes de deletar rotas, garantir que emails não as referenciam.

**Acceptance Criteria:**
- [ ] Todo template que aponta para rota candidata é atualizado para alternativa
- [ ] Deploy de templates atualizados em prod
- [ ] Validação: enviar email de teste e verificar link final

#### US-208: Adicionar redirects no middleware
**Description:** Preservar URLs antigas via redirect antes de deletar as páginas.

**Acceptance Criteria:**
- [ ] `next.config.js` (ou `middleware.ts`) configura redirects 308:
  - `/register` → `/signup`
  - `/forgot-password` → `/login`
  - `/reset-password/*` → `/login`
  - `/login/verify-magic` → `/login`
  - `/signup/verify-magic` → `/signup`
- [ ] Testes E2E (US-107 da Release 1) atualizados para validar redirects
- [ ] Deploy em prod
- [ ] Observação por 48h antes de prosseguir para US-209

#### US-209: Deletar arquivos das rotas confirmadas mortas
**Description:** Apenas rotas com decisão `DELETE` em US-204 podem ser removidas.

**Acceptance Criteria:**
- [ ] Pastas `src/app/(auth)/[rota]/` deletadas para cada rota aprovada
- [ ] Componentes órfãos em `src/client/components/auth/` removidos se exclusivos dessas rotas
- [ ] Endpoints backend relacionados removidos (ex: `POST /api/v1/auth/forgot-password`)
- [ ] Schemas Zod, procedures, tests, migrations (se houver) limpos
- [ ] `grep` confirma zero referências no código (exceto redirects)
- [ ] Pipeline `npm run test:all` verde após deleção
- [ ] PR com diff explícito de cada arquivo deletado, revisado por humano

#### US-210: Validar em homol e prod pós-deleção
**Description:** Garantir que nada quebrou.

**Acceptance Criteria:**
- [ ] Smoke homol verde (Release 1)
- [ ] Merge para main
- [ ] Smoke prod verde pós-deploy
- [ ] Baselines de Release 1 comparadas: nenhuma regressão em p95/conversão
- [ ] Monitor sintético sem alertas por 48h
- [ ] Logs de redirect mostram tráfego sendo corretamente redirecionado

---

## 4. Functional Requirements

- **FR-1:** Nenhuma rota pode ser deletada sem 14 dias de observação prévia de tráfego real em prod.
- **FR-2:** Decisão de deleção requer aprovação explícita do founder, registrada em `docs/auth/CLEANUP_AUDIT.md`.
- **FR-3:** Redirects 308 devem cobrir todas as rotas deletadas, sem exceção.
- **FR-4:** Templates de email devem ser atualizados **antes** da deleção, não depois.
- **FR-5:** Pipeline de testes (Release 1) deve estar verde antes e depois de cada deleção.
- **FR-6:** Qualquer rota com tráfego humano não-zero não pode pular direto para DELETE — passa por DEPRECATE primeiro.

---

## 5. Non-Goals

- ❌ Não deleta rota só porque "ninguém lembra de ter usado"
- ❌ Não assume que `grep` vazio = rota morta
- ❌ Não deleta em massa — uma decisão por rota, documentada
- ❌ Não muda visual das rotas remanescentes (Release 3)
- ❌ Não altera lógica de endpoints que **ficam** (só remove os que morrem junto)
- ❌ Não comprime fases — 14 dias de observação são obrigatórios

---

## 6. Technical Considerations

- **Log structured:** usar formato JSON para facilitar análise posterior
- **Privacidade:** IP deve ser hashed (SHA256 com salt fixo do ambiente) antes de logar
- **Janela de observação:** 14 dias é mínimo; pode se estender se decisão for ambígua
- **Rollback de deleção:** se algo quebrar pós-deleção, restore via git + deploy revert. Release 1 já garante detecção rápida.
- **Dependência crítica:** esta release **não pode** começar sem Release 1 em produção — senão não há como detectar regressões

---

## 7. Success Metrics

- ✅ Decisão documentada e aprovada para cada uma das 5 rotas candidatas
- ✅ Zero regressão detectada pelo pipeline de testes após cada fase
- ✅ Zero alertas do monitor sintético durante rollout
- ✅ Redirects funcionando: tráfego remanescente nas rotas antigas é redirecionado corretamente
- ✅ Templates de email atualizados e validados
- ✅ Codebase menor e mais focado (LOC reduzidas, complexidade ciclomática reduzida)

---

## 8. Open Questions

1. **Quanto tempo de DEPRECATE** antes de DELETE? Proposta: 30 dias. Confirmar com founder.
2. **Onde vão os logs estruturados?** Se não houver aggregator, criar diretório temporário em prod? (precisa de volume persistente no Vercel)
3. **User notification in-app** — temos esse canal ou só email?

---

## Definition of Done

- [ ] Todas as US de 201 a 210 concluídas
- [ ] `CLEANUP_AUDIT.md` completo com decisão por rota
- [ ] 14 dias de observação cumpridos
- [ ] Rotas mortas deletadas com redirects configurados
- [ ] Templates de email atualizados
- [ ] Pipeline verde em local, homol, prod
- [ ] Review humano aprovou PR
- [ ] Changelog publicado
