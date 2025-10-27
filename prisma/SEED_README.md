# 🌱 Database Seed - Documentação

## 📋 Visão Geral

Este seed cria automaticamente o usuário **admin** e dados de teste sempre que você executar:

```bash
npm run db:seed
# ou
npx tsx prisma/seed.ts
```

## 🔐 Variáveis de Ambiente para Admin

O seed usa variáveis de ambiente para configurar o admin. Se não definidas, usa valores padrão:

### Configuração do Admin

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `ADMIN_EMAIL` | `admin@quayer.com` | Email do usuário admin |
| `ADMIN_PASSWORD` | `admin123456` | Senha do admin |
| `ADMIN_NAME` | `Administrator` | Nome do admin |
| `ADMIN_RECOVERY_TOKEN` | `123456` | Token permanente para login (testes E2E) |

### Exemplo de Uso com Variáveis Customizadas

**Linux/Mac:**
```bash
ADMIN_EMAIL="myadmin@company.com" \
ADMIN_PASSWORD="MySuperSecurePassword123!" \
ADMIN_NAME="Super Admin" \
ADMIN_RECOVERY_TOKEN="999999" \
npx tsx prisma/seed.ts
```

**Windows (PowerShell):**
```powershell
$env:ADMIN_EMAIL="myadmin@company.com"
$env:ADMIN_PASSWORD="MySuperSecurePassword123!"
$env:ADMIN_NAME="Super Admin"
$env:ADMIN_RECOVERY_TOKEN="999999"
npx tsx prisma/seed.ts
```

**Windows (CMD):**
```cmd
set ADMIN_EMAIL=myadmin@company.com
set ADMIN_PASSWORD=MySuperSecurePassword123!
set ADMIN_NAME=Super Admin
set ADMIN_RECOVERY_TOKEN=999999
npx tsx prisma/seed.ts
```

## ✨ Características do Admin

### 1. **Recovery Token Permanente** 🔑
- O admin SEMPRE tem um recovery token ativo (padrão: `123456`)
- Este token NUNCA expira (válido por 1 ano, renovado a cada seed)
- Funciona como login universal para testes E2E
- Não precisa enviar email - use diretamente no formulário OTP

### 2. **Upsert Inteligente** 🔄
- Se o admin já existe, apenas atualiza:
  - Recovery token (garante que sempre esteja ativo)
  - Status ativo
  - Email verificado
- Se não existe, cria com todas as configurações

### 3. **Onboarding Completo** ✅
- Admin criado com `onboardingCompleted: true`
- Não precisa passar pela tela de onboarding
- Vai direto para `/admin` após login

## 🧪 Uso em Testes E2E

### Login do Admin (sem email):

```typescript
// 1. Fazer login-otp
await api.auth.loginOTP.mutate({
  body: { email: 'admin@quayer.com' }
});

// 2. Verificar OTP com recovery token
await api.auth.verifyLoginOTP.mutate({
  body: {
    email: 'admin@quayer.com',
    code: '123456' // Recovery token permanente
  }
});

// ✅ Logado com sucesso!
```

### Login com Playwright:

```typescript
test('Admin login with recovery token', async ({ page }) => {
  // Ir para login
  await page.goto('http://localhost:3000/login');
  
  // Preencher email
  await page.fill('input[type="email"]', 'admin@quayer.com');
  await page.click('button[type="submit"]');
  
  // Aguardar tela OTP
  await page.waitForURL('**/login/verify**');
  
  // Preencher recovery token (SEM enviar email!)
  await page.fill('input[name="code"]', '123456');
  await page.click('button[type="submit"]');
  
  // ✅ Redirecionado para /admin
  await expect(page).toHaveURL('**/admin');
});
```

## 🔄 Reset do Banco de Dados

### Comando Completo (Reset + Seed)

```bash
# Linux/Mac
npm run db:reset

# Ou manualmente:
npx prisma migrate reset --force && npx tsx prisma/seed.ts
```

**O que acontece:**
1. ⚠️ **APAGA TODOS OS DADOS** do banco
2. ♻️ Reaplica todas as migrations
3. 🌱 Executa o seed automaticamente
4. ✅ Admin é recriado com recovery token

### Seed sem Reset

Se você só quer recriar o admin (sem perder dados):

```bash
npm run db:seed
# ou
npx tsx prisma/seed.ts
```

Isso vai:
- ✅ Criar admin se não existir
- ✅ Atualizar recovery token se já existir
- ✅ Manter outros dados intactos

## 🎯 Scripts NPM Úteis

```json
{
  "scripts": {
    "db:seed": "npx tsx prisma/seed.ts",
    "db:reset": "npx prisma migrate reset --force",
    "db:push": "npx prisma db push",
    "db:studio": "npx prisma studio"
  }
}
```

## ⚙️ Personalização

### Criar Admin Customizado

Crie um arquivo `.env` na raiz do projeto:

```env
# .env
ADMIN_EMAIL=admin@meusite.com.br
ADMIN_PASSWORD=SenhaForte123!@#
ADMIN_NAME=Administrador Mestre
ADMIN_RECOVERY_TOKEN=111111
```

Depois rode:
```bash
npm run db:reset
```

O admin será criado com suas configurações! 🎉

## 🚨 Segurança

### ⚠️ IMPORTANTE - Produção

Em **PRODUÇÃO**, você DEVE:

1. **Mudar o Recovery Token**:
   ```env
   ADMIN_RECOVERY_TOKEN=algum-token-muito-secreto-e-aleatorio
   ```

2. **Senha Forte**:
   ```env
   ADMIN_PASSWORD=SuaSenhaMuitoForteComCaracteresEspeciais123!@#
   ```

3. **Email Corporativo**:
   ```env
   ADMIN_EMAIL=admin@suaempresa.com.br
   ```

### ✅ Desenvolvimento

Em **DEV/TESTES**, pode usar os padrões:
- Recovery token: `123456` (fácil de lembrar)
- Senha: `admin123456`
- Email: `admin@quayer.com`

## 📊 Output do Seed

Quando você rodar `npm run db:seed`, verá algo assim:

```
🌱 Starting database seeding...

👤 Creating Admin user...
   📧 Email: admin@quayer.com
   🔑 Recovery Token: 123456
✅ Admin user created/updated: admin@quayer.com
   🎯 Recovery Token: 123456

🏢 Creating Organizations...
✅ Organization created: Acme Corporation (PJ)
✅ Organization created: Tech Startup Ltda (PJ)
...
```

## 🎓 Resumo

- ✅ Seed SEMPRE cria/atualiza admin com recovery token
- ✅ Recovery token (padrão: `123456`) funciona para login sem email
- ✅ Configurável via variáveis de ambiente
- ✅ Idempotente - pode rodar múltiplas vezes sem problemas
- ✅ Perfeito para testes E2E automatizados
- ✅ Admin com onboarding completo

**Agora você nunca mais ficará sem admin após reset do banco!** 🎉

