# 📚 APRENDIZADOS E SOLUÇÕES - Base de Conhecimento

**Objetivo:** Evitar repetição de erros e otimizar uso de tokens Claude
**Última atualização:** 2025-10-16

---

## 🎯 PROPÓSITO DESTE DOCUMENTO

Este documento registra:
- ✅ Problemas encontrados e como foram resolvidos
- ✅ Decisões arquiteturais importantes
- ✅ Padrões estabelecidos no projeto
- ✅ Erros comuns e como evitá-los
- ✅ Otimizações de performance

**🚨 LEIA ESTE DOCUMENTO ANTES DE:**
- Fazer alterações em autenticação
- Modificar estrutura de banco de dados
- Alterar configuração do Igniter.js
- Criar novos endpoints de API
- Implementar novos fluxos de integração

---

## 🐛 ERROS CRÍTICOS CORRIGIDOS

### 1. **Bug: OTP Verification Error - Banco de Dados Vazio**

**Data:** 2025-10-16
**Severidade:** 🔴 CRÍTICA
**Impacto:** Autenticação OTP completamente quebrada (erro 400 sempre)

**Problema:**
```typescript
// Error observado no frontend:
Error: OTP verification error: {}

// Log do servidor (inexistente):
POST /api/v1/auth/verify-login-otp 400 in 487ms
// ❌ Nenhum log de debug aparecia
```

**Causa raiz:**
- Banco de dados estava VAZIO (sem usuários)
- Handler retornava erro na linha 1432: `if (!user) return response.status(400).json({ error: 'Invalid code' })`
- Recovery token (123456) NUNCA era verificado pois código retornava antes

**Solução:**
```bash
# ✅ PASSO 1: Verificar se banco tem usuários
docker exec app-quayer-postgres-1 psql -U docker -d docker -c "SELECT id, email FROM \"User\";"

# ✅ PASSO 2: Se vazio, executar seed
npm run db:seed

# ✅ PASSO 3: Testar recovery token
curl -X POST http://localhost:3000/api/v1/auth/verify-login-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@quayer.com","code":"123456"}'

# ✅ Resultado esperado (200 OK):
{
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "needsOnboarding": true,
    "user": { "id": "...", "email": "admin@quayer.com", ... }
  }
}
```

**Debug logs adicionados:**
```typescript
// ✅ Log no início do handler para confirmar execução
handler: async ({ request, response }) => {
  const { email, code } = request.body;
  console.log('🚀 [verifyLoginOTP] HANDLER EXECUTADO - EMAIL:', email, 'CODE:', code);

  const user = await db.user.findUnique({ ... });

  // ✅ Log de debug detalhado APÓS buscar usuário
  console.log('🔍 [verifyLoginOTP] DEBUG:', {
    email,
    code,
    recoveryToken,
    userResetToken: user.resetToken,
    isValidCode,
    codeMatchesRecovery: code === recoveryToken,
    codeMatchesUser: user.resetToken === code,
  });
}
```

**Aprendizado:**
- ⚠️ SEMPRE verificar se o banco tem dados antes de testar autenticação
- ⚠️ Logs de debug são ESSENCIAIS para identificar onde o código está falhando
- ⚠️ Erro "Invalid code" pode significar "usuário não existe" (mensagem genérica por segurança)
- ⚠️ Recovery token só funciona SE o usuário existir no banco
- ⚠️ Next.js pode cachear código antigo - limpar `.next/` se logs não aparecem

**Como evitar:**
1. Adicionar script de verificação de saúde do banco:
   ```bash
   # Adicionar em package.json
   "scripts": {
     "db:check": "docker exec app-quayer-postgres-1 psql -U docker -d docker -c \"SELECT COUNT(*) as total_users FROM \\\"User\\\";\""
   }
   ```

2. Adicionar comentário no erro genérico:
   ```typescript
   if (!user) {
     logger.debug('User not found for OTP verification', { email });
     return response.status(400).json({ error: 'Invalid code' }); // User might not exist
   }
   ```

3. Sempre executar seed após:
   - `npx prisma migrate reset`
   - `npx prisma db push --force-reset`
   - Limpeza completa do banco

**Checklist de debug para erros de autenticação:**
- [ ] Verificar se servidor está rodando (`curl http://localhost:3000/api/health`)
- [ ] Verificar se banco tem usuários (`npm run db:check`)
- [ ] Limpar cache do Next.js (`rm -rf .next`)
- [ ] Adicionar logs no início do handler
- [ ] Verificar se recovery token está configurado no `.env`
- [ ] Testar com curl direto (ignorar frontend)

---

### 2. **Bug: `basePATH` vs `basePath` (Case Sensitivity)**

**Data:** 2025-10-09
**Severidade:** 🔴 CRÍTICA
**Impacto:** Todos os endpoints retornando 404

**Problema:**
```typescript
// ❌ ERRADO (causava 404 em todas as rotas)
.config({
  basePATH: '/api/v1'  // Case errado
})
```

**Solução:**
```typescript
// ✅ CORRETO
.config({
  basePath: '/api/v1'  // Case correto
})
```

**Arquivos afetados:**
- `src/igniter.ts` (linha 21)
- `src/igniter.client.ts` (linha 30)

**Aprendizado:**
- ⚠️ Igniter.js é case-sensitive em configurações
- ⚠️ Sempre verificar documentação oficial para nomes exatos
- ⚠️ TypeScript não detecta este erro (usa `any` em alguns lugares)

**Como evitar:**
- Usar autocomplete do IDE
- Revisar `igniter.config.ts` oficial
- Testar endpoint base logo após configuração

---

### 2. **Bug: TempUser.name Missing no Signup OTP**

**Data:** 2025-10-09
**Severidade:** 🟡 MÉDIA
**Impacto:** Signup via OTP falhava com erro Prisma

**Problema:**
```typescript
// ❌ ERRADO (campo name obrigatório não enviado)
await db.tempUser.upsert({
  where: { email },
  create: { email, code, expiresAt }, // Falta 'name'
  update: { code, expiresAt }
})
```

**Solução:**
```typescript
// ✅ CORRETO
const tempName = email.split('@')[0] // Extrair do email
await db.tempUser.upsert({
  where: { email },
  create: { email, name: tempName, code, expiresAt },
  update: { code, expiresAt }
})
```

**Aprendizado:**
- ⚠️ Sempre verificar schema Prisma antes de upsert/create
- ⚠️ Campos required sem default value causam erro
- ⚠️ Extrair nome do email é boa prática para temp users

**Como evitar:**
- Rodar `npx prisma validate` antes de commit
- Usar TypeScript strict mode
- Revisar mensagens de erro Prisma detalhadamente

---

### 3. **Bug: Smart Login OTP - Email Não Recebido**

**Data:** 2025-10-09
**Severidade:** 🟡 MÉDIA
**Impacto:** Usuários novos não recebiam OTP no login

**Problema Original:**
```typescript
// ❌ ERRADO (segurança excessiva)
const user = await db.user.findUnique({ where: { email } })
if (!user) {
  return response.success({ sent: true }) // Não envia email!
}
```

**Expectativa do Usuário:**
> "Para fazer login, caso não existir o email, ele fazer o cadastro enviando OTP"

**Solução:**
```typescript
// ✅ CORRETO (Smart Login)
const user = await db.user.findUnique({ where: { email } })
if (!user) {
  // Enviar OTP de SIGNUP automaticamente
  const signupOtpCode = generateOTP()
  await db.tempUser.upsert({ ... })
  await emailService.sendWelcomeSignupEmail(...)
  return response.success({
    sent: true,
    isNewUser: true,
    message: 'Código de cadastro enviado'
  })
}
// Continuar com login normal
```

**Aprendizado:**
- ⚠️ UX > Segurança em alguns casos (cadastro simples)
- ⚠️ Sempre validar com usuário final antes de assumir requisitos
- ⚠️ "Smart" features precisam ser explícitas na resposta API

**Como evitar:**
- Documentar comportamento "inteligente" na API
- Adicionar campo `isNewUser` na resposta
- Testar com emails reais (não só mocks)

---

### 4. **Bug: Prisma Migration Shadow Database**

**Data:** 2025-10-11
**Severidade:** 🟡 MÉDIA
**Impacto:** Migrations falhando em desenvolvimento

**Problema:**
```bash
❌ Error: P3006
Migration failed to apply cleanly to the shadow database.
The underlying table for model `Organization` does not exist.
```

**Solução:**
```bash
# ✅ Usar db push em vez de migrate dev
npx prisma db push

# OU resetar shadow database
npx prisma migrate reset --force
```

**Aprendizado:**
- ⚠️ `db push` é mais seguro em dev (não usa shadow DB)
- ⚠️ Shadow database precisa estar limpa
- ⚠️ Migrations podem falhar se há schemas órfãos

**Como evitar:**
- Usar `db push` durante desenvolvimento ativo
- Usar `migrate dev` apenas para commits finais
- Manter migrations atômicas e pequenas

---

### 5. **Bug: Processos Node.js Duplicados**

**Data:** 2025-10-11
**Severidade:** 🟠 ALTA
**Impacto:** Múltiplos servidores rodando, conflitos de porta

**Problema:**
- Background bash shells acumulando (19+ processos)
- Cada shell rodando `npm run dev`
- Porta 3000 conflitando

**Solução:**
```bash
# ✅ Matar todos os processos Node
powershell.exe "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force"

# Aguardar
sleep 3

# Iniciar apenas um servidor
npm run dev
```

**Aprendizado:**
- ⚠️ Background bash shells não morrem automaticamente
- ⚠️ Claude Code pode criar múltiplos shells paralelos
- ⚠️ Verificar `ps aux | grep node` regularmente

**Como evitar:**
- Rodar apenas um servidor por vez
- Usar `run_in_background: true` com cuidado
- Kill shells antigos antes de criar novos

---

## 🏗️ DECISÕES ARQUITETURAIS

### 1. **Polling vs WebSockets para Real-Time**

**Decisão:** Polling HTTP (10s lista, 3s status)
**Data:** 2025-10-11

**Motivos:**
- ✅ Mais simples de implementar
- ✅ Funciona em todos os ambientes (proxies, firewalls)
- ✅ Não requer conexão persistente
- ✅ React Query já gerencia polling

**Trade-offs:**
- ❌ Mais requisições HTTP
- ❌ Latência de 3-10 segundos
- ✅ Aceitável para UX de integração WhatsApp

**Quando reconsiderar:**
- Se precisar latência < 1s
- Se número de usuários > 10.000 simultâneos
- Se houver eventos críticos em tempo real

---

### 2. **Validação de Telefone: libphonenumber-js**

**Decisão:** Biblioteca completa em vez de regex
**Data:** 2025-10-11

**Motivos:**
- ✅ Suporte a 150+ países
- ✅ Formato E.164 padrão internacional
- ✅ Validação robusta (detecta números falsos)
- ✅ ~80KB gzipped (aceitável)

**Alternativa rejeitada:**
- ❌ Regex customizado (frágil, incompleto)
- ❌ Validação apenas no frontend (inseguro)

**Padrão estabelecido:**
```typescript
// ✅ SEMPRE usar este padrão
import { validatePhoneNumber } from '@/lib/validators/phone.validator'

const validation = validatePhoneNumber(phoneNumber, 'BR')
if (!validation.isValid) {
  return response.badRequest(validation.error)
}
const e164Phone = validation.formatted // +5511999887766
```

---

### 3. **RBAC: Admin Only para Webhooks**

**Decisão:** Apenas `role: 'admin'` pode configurar webhooks
**Data:** 2025-10-11

**Motivos:**
- ✅ Webhooks expõem dados sensíveis
- ✅ Podem causar loops infinitos se mal configurados
- ✅ Requerem conhecimento técnico
- ✅ Admin geralmente é perfil técnico

**Verificação:**
```typescript
// ✅ SEMPRE verificar role antes de webhook
const userRole = context.auth?.session?.user?.role
if (userRole !== 'admin') {
  return response.forbidden('Apenas administradores podem configurar webhooks')
}
```

**Matriz de permissões:**
| Ação | Admin | Master | Manager | User |
|------|-------|--------|---------|------|
| Criar instância | ✅ | ✅ | ✅ | ❌ |
| Webhook config | ✅ | ❌ | ❌ | ❌ |
| Ver webhook | ✅ | ❌ | ❌ | ❌ |

---

### 4. **Limite de Instâncias por Organização**

**Decisão:** Campo `maxInstances` no modelo Organization
**Data:** 2025-10-11

**Implementação:**
```typescript
// ✅ SEMPRE verificar antes de criar instância
const organization = await db.organization.findUnique({
  where: { id: organizationId },
  include: { instances: true }
})

if (organization.instances.length >= organization.maxInstances) {
  return response.badRequest(
    `Limite atingido: ${organization.maxInstances} instância(s)`
  )
}
```

**Padrões de limite:**
- Free: 1 instância
- Basic: 3 instâncias
- Pro: 10 instâncias
- Enterprise: Ilimitado (999)

---

## 🎨 PADRÕES DE CÓDIGO ESTABELECIDOS

### 1. **Controllers Igniter.js**

```typescript
// ✅ PADRÃO: Sempre seguir esta estrutura
export const myController = igniter.controller({
  name: 'myFeature',
  path: '/my-feature',
  description: 'Descrição clara',
  actions: {
    create: igniter.mutation({
      name: 'CreateMyFeature',
      description: 'O que faz',
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: MyFeatureSchema,
      handler: async ({ request, response, context }) => {
        // 1. Extract & log
        const data = request.body
        logger.info('Action', { userId: context.auth?.session?.user?.id })

        try {
          // 2. Validações de negócio
          // 3. Operações de banco
          // 4. Retorno
          return response.created(result)
        } catch (error) {
          logger.error('Error', { error })
          throw error
        }
      }
    })
  }
})
```

**Ordem de validações:**
1. RBAC (no procedure ou início do handler)
2. Validação de dados (Zod schema)
3. Business rules (limites, duplicatas)
4. Operações de banco
5. Operações externas (UAZapi)

---

### 2. **Hooks React Query**

```typescript
// ✅ PADRÃO: Hook de query com polling
export function useMyData(id: string, options?: { enablePolling?: boolean }) {
  const { enablePolling = false } = options || {}

  return useQuery({
    queryKey: ['my-data', id],
    queryFn: async () => {
      const response = await api.myFeature.get.query()
      return response.data
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    refetchInterval: enablePolling ? 10 * 1000 : false,
    refetchOnWindowFocus: true
  })
}
```

**Tempos de polling:**
- Lista geral: 10 segundos
- Status crítico: 3 segundos
- Dados estáticos: false (sem polling)

---

### 3. **Componentes com RBAC**

```typescript
// ✅ PADRÃO: RBAC no componente
export function MyComponent() {
  const { isAdmin, canEdit } = usePermissions()

  if (!canEdit) {
    return <Alert>Sem permissão</Alert>
  }

  return (
    <div>
      {/* UI geral */}
      {isAdmin && (
        <Button onClick={handleAdminAction}>
          Admin Only
        </Button>
      )}
    </div>
  )
}
```

---

## 🧪 PADRÕES DE TESTE

### 1. **Testes E2E - Estrutura**

```typescript
// ✅ PADRÃO: Describe por perfil de usuário
test.describe('Feature - Admin Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/feature`)
  })

  test('Admin pode fazer X', async ({ page }) => {
    // Arrange
    const data = createTestData()

    // Act
    await page.click('button:has-text("Action")')

    // Assert
    await expect(page.locator('text=Success')).toBeVisible()
  })
})
```

### 2. **Testes API - Estrutura**

```typescript
// ✅ PADRÃO: Describe por endpoint
describe('POST /api/v1/feature', () => {
  it('Deve aceitar dados válidos', async () => {
    const response = await fetch(`${API_BASE}/feature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(validData)
    })

    expect(response.status).toBe(201)
    expect(response.data).toHaveProperty('id')
  })

  it('Deve rejeitar dados inválidos', async () => {
    // ...
  })

  it('Deve retornar 403 para usuário sem permissão', async () => {
    // ...
  })
})
```

---

## 📝 CHECKLIST ANTES DE COMMIT

### ✅ Backend:
- [ ] Schema Prisma validado (`npx prisma validate`)
- [ ] Todos os campos obrigatórios preenchidos
- [ ] RBAC verificado em todos os endpoints sensíveis
- [ ] Logger adicionado em operações críticas
- [ ] Error handling com try/catch
- [ ] Validação Zod em todos os inputs

### ✅ Frontend:
- [ ] Hooks com polling configurado corretamente
- [ ] RBAC implementado na UI
- [ ] Loading states em todas as mutations
- [ ] Error boundaries onde necessário
- [ ] Tipos TypeScript sem `any`

### ✅ Testes:
- [ ] Teste E2E para cada perfil de usuário
- [ ] Teste API para happy path e edge cases
- [ ] RBAC validado em testes (403 esperado)
- [ ] Testes passando localmente

### ✅ Documentação:
- [ ] JSDoc em funções públicas
- [ ] README atualizado se necessário
- [ ] APRENDIZADOS.md atualizado com novas soluções

---

## 🚨 ALERTAS E CUIDADOS

### ⚠️ NÃO FAZER:

1. **NÃO modificar schema Prisma sem migration/push**
   ```bash
   # ❌ ERRADO
   # Editar schema.prisma e continuar

   # ✅ CORRETO
   npx prisma db push
   npx prisma generate
   ```

2. **NÃO usar `any` type em TypeScript**
   ```typescript
   // ❌ ERRADO
   const data: any = request.body

   // ✅ CORRETO
   const data: CreateInstanceInput = request.body
   ```

3. **NÃO expor tokens/secrets em logs**
   ```typescript
   // ❌ ERRADO
   logger.info('User logged in', { token: accessToken })

   // ✅ CORRETO
   logger.info('User logged in', { userId: user.id })
   ```

4. **NÃO fazer operações síncronas pesadas no handler**
   ```typescript
   // ❌ ERRADO
   const result = heavyComputation() // Bloqueia event loop

   // ✅ CORRETO
   const job = await queue.add('heavy-task', data)
   ```

---

## 💡 OTIMIZAÇÕES DE PERFORMANCE

### 1. **Polling Inteligente**

```typescript
// ✅ Desabilitar polling quando modal fecha
const { data } = useInstanceStatus(
  instanceId,
  isModalOpen // enabled only quando necessário
)
```

### 2. **Cache de Foto de Perfil**

```typescript
// ✅ Cache longo para imagens
staleTime: 5 * 60 * 1000 // 5 minutos
```

### 3. **Invalidação Seletiva**

```typescript
// ✅ Invalidar apenas queries necessárias
queryClient.invalidateQueries({ queryKey: ['instances', id] })
// NÃO invalidar TUDO:
// queryClient.invalidateQueries() ❌
```

---

## 📚 REFERÊNCIAS ÚTEIS

### Documentação Oficial:
- [Igniter.js Docs](https://igniterjs.com)
- [Prisma Docs](https://prisma.io/docs)
- [React Query Docs](https://tanstack.com/query)
- [Playwright Docs](https://playwright.dev)
- [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js)

### Arquivos de Referência Internos:
- `IMPLEMENTACAO_COMPLETA_WHATSAPP.md` - Última implementação completa
- `INSTRUCOES_TESTE_MANUAL.md` - Como testar manualmente
- `.cursor/rules/` - Regras do projeto

---

## 🔄 COMO ATUALIZAR ESTE DOCUMENTO

**Quando adicionar novo aprendizado:**

1. Identificar categoria (Bug, Decisão Arquitetural, Padrão)
2. Adicionar seção com:
   - Data
   - Severidade (se bug)
   - Problema claro
   - Solução com código
   - Aprendizado
   - Como evitar
3. Atualizar data no topo do documento
4. Commit com mensagem: `docs: adicionar aprendizado sobre X`

**Template:**

```markdown
### X. **Título do Aprendizado**

**Data:** YYYY-MM-DD
**Severidade:** 🔴/🟠/🟡 (se bug)

**Problema:**
[Descrição]

**Solução:**
[Código ou explicação]

**Aprendizado:**
- ⚠️ Ponto 1
- ⚠️ Ponto 2

**Como evitar:**
- Ação 1
- Ação 2
```

---

**📅 Última revisão:** 2025-10-11
**🔄 Próxima revisão:** A cada nova feature ou bug crítico
**👥 Mantido por:** Lia AI Agent + Time de Desenvolvimento
