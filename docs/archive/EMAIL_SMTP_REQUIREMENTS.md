# 📧 Email SMTP - Requisitos e Configuração

## 📋 O que você precisa saber

Para a funcionalidade de **"Esqueci minha senha"** funcionar, precisamos configurar um serviço de envio de emails (SMTP).

---

## 🔧 Opções de Serviço de Email

### Opção 1: Gmail (Recomendado para Dev/Teste)

**Prós:**
- ✅ Grátis
- ✅ Fácil de configurar
- ✅ Confiável

**Contras:**
- ❌ Limite de 500 emails/dia
- ❌ Não recomendado para produção
- ❌ Requer "App Password"

**O que você precisa:**
1. Uma conta Gmail
2. Criar "App Password" (senha de aplicativo)

**Como configurar:**
1. Acesse: https://myaccount.google.com/security
2. Ative "Verificação em 2 etapas"
3. Vá em "App Passwords" (Senhas de app)
4. Crie uma senha para "Mail" > "Other (Custom name)" > "Quayer"
5. Copie a senha de 16 caracteres gerada

**Variáveis de ambiente:**
```bash
# Gmail SMTP
EMAIL_PROVIDER=gmail
EMAIL_FROM=seu-email@gmail.com
EMAIL_FROM_NAME=Quayer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # App Password de 16 dígitos
```

---

### Opção 2: SendGrid (Recomendado para Produção)

**Prós:**
- ✅ 100 emails/dia grátis
- ✅ Profissional e confiável
- ✅ Excelente deliverability
- ✅ Dashboard com analytics

**Contras:**
- ❌ Requer cadastro
- ❌ Verificação de domínio para produção

**O que você precisa:**
1. Criar conta: https://signup.sendgrid.com/
2. Verificar email
3. Criar API Key

**Como configurar:**
1. Acesse: https://app.sendgrid.com/settings/api_keys
2. Clique em "Create API Key"
3. Nome: "Quayer"
4. Permissions: "Full Access" ou "Mail Send"
5. Copie a API Key (começa com SG.)

**Variáveis de ambiente:**
```bash
# SendGrid
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=noreply@seudominio.com
EMAIL_FROM_NAME=Quayer
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx
```

---

### Opção 3: AWS SES (Para Produção em Escala)

**Prós:**
- ✅ 62.000 emails/mês grátis (primeiro ano)
- ✅ Depois: $0.10 por 1.000 emails
- ✅ Altamente escalável
- ✅ Integração com AWS

**Contras:**
- ❌ Mais complexo de configurar
- ❌ Requer conta AWS
- ❌ Inicia em "Sandbox" (precisa sair)

**O que você precisa:**
1. Conta AWS
2. Configurar SES
3. Verificar domínio/email
4. Criar credenciais SMTP

**Variáveis de ambiente:**
```bash
# AWS SES
EMAIL_PROVIDER=ses
EMAIL_FROM=noreply@seudominio.com
EMAIL_FROM_NAME=Quayer
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

---

### Opção 4: Resend (Moderna e Developer-Friendly)

**Prós:**
- ✅ 100 emails/dia grátis
- ✅ Interface moderna
- ✅ React Email integration
- ✅ Excelente DX

**Contras:**
- ❌ Serviço relativamente novo
- ❌ Menor escala que SendGrid/SES

**O que você precisa:**
1. Criar conta: https://resend.com/signup
2. Criar API Key

**Variáveis de ambiente:**
```bash
# Resend
EMAIL_PROVIDER=resend
EMAIL_FROM=onboarding@resend.dev  # ou seu domínio verificado
EMAIL_FROM_NAME=Quayer
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 Implementação no Código

### 1. Service de Email já existe!
**Arquivo:** `src/lib/email/index.ts`

Já está implementado com suporte a:
- ✅ Mock (desenvolvimento)
- ✅ SMTP genérico
- ✅ SendGrid
- ✅ AWS SES
- ✅ Resend

### 2. Adicionar variáveis ao .env

Escolha uma das opções acima e adicione as variáveis correspondentes ao arquivo `.env`.

### 3. Template de Email

O sistema já possui template para reset de senha em:
**`src/lib/email/templates/password-reset.html`**

---

## 📝 Exemplo Completo - Gmail (Mais Rápido)

### Passo 1: Configurar App Password no Gmail

1. Acesse: https://myaccount.google.com/security
2. Em "Como fazer login no Google":
   - Ative "Verificação em 2 etapas" (se não estiver)
3. Volte para "Segurança"
4. Procure "Senhas de app" (App Passwords)
5. Selecione:
   - App: Mail
   - Device: Other (digite "Quayer")
6. Copie a senha de 16 caracteres (ex: `xxxx xxxx xxxx xxxx`)

### Passo 2: Adicionar ao .env

```bash
# Email Configuration (Gmail)
EMAIL_PROVIDER=gmail
EMAIL_FROM=seu-email@gmail.com
EMAIL_FROM_NAME=Quayer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # Cole aqui a App Password
```

### Passo 3: Reiniciar servidor

```bash
npm run dev
```

### Passo 4: Testar

1. Vá para: `http://localhost:3000/forgot-password`
2. Digite um email cadastrado
3. Verifique o email na caixa de entrada

---

## 🔒 Segurança

### ⚠️ IMPORTANTE: Nunca commitar credenciais!

O `.env` já está no `.gitignore`. **JAMAIS** faça commit com:
- Senhas SMTP
- API Keys
- Credenciais AWS

### Para Produção

1. Use variáveis de ambiente do servidor (Vercel, Railway, etc.)
2. Ative SMTP_SECURE=true (porta 465)
3. Configure SPF/DKIM no domínio
4. Use domínio próprio no EMAIL_FROM

---

## 📊 Comparação Rápida

| Provider | Grátis/Mês | Complexidade | Produção | Recomendação |
|----------|-----------|--------------|----------|--------------|
| Gmail | 500/dia | ⭐ Fácil | ❌ Não | Dev/Teste |
| SendGrid | 100/dia | ⭐⭐ Médio | ✅ Sim | Pequeno/Médio |
| AWS SES | 62k | ⭐⭐⭐ Difícil | ✅ Sim | Grande Escala |
| Resend | 100/dia | ⭐ Fácil | ✅ Sim | Startups/Dev |

---

## 🎯 Recomendação

### Para começar AGORA (5 minutos):
**Use Gmail com App Password**
- Rápido de configurar
- Funciona imediatamente
- Perfeito para desenvolvimento

### Para produção (futuro):
**Use SendGrid ou Resend**
- Profissional
- Confiável
- Fácil de migrar depois

---

## ❓ FAQ

**P: O sistema funciona sem email configurado?**
R: Sim! O sistema usa um "Mock Provider" que loga os emails no console. Útil para dev.

**P: Posso trocar de provider depois?**
R: Sim! Basta mudar as variáveis de ambiente e reiniciar.

**P: Preciso de domínio próprio?**
R: Não para desenvolvimento. Para produção, recomendado.

**P: Os emails vão para spam?**
R: Gmail: Às vezes. SendGrid/SES: Raramente (após configurar SPF/DKIM).

---

## 🛠️ Próximos Passos

1. **Escolha um provider** (recomendo Gmail para começar)
2. **Configure as credenciais** (siga o guia do provider escolhido)
3. **Adicione ao .env** (copie o template correspondente)
4. **Reinicie o servidor** (`npm run dev`)
5. **Teste!** (http://localhost:3000/forgot-password)

---

## 📞 Dúvidas?

Se tiver dificuldades com algum provider específico:
- Gmail: https://support.google.com/accounts/answer/185833
- SendGrid: https://docs.sendgrid.com/
- AWS SES: https://docs.aws.amazon.com/ses/
- Resend: https://resend.com/docs

**Me avise qual provider você escolheu para eu ajudar na configuração específica!** 🚀
