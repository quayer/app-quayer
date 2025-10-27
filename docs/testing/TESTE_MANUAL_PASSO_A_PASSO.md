# 🧪 TESTE MANUAL - PASSO A PASSO

## ✅ STATUS: Servidor Rodando em http://localhost:3000

---

## 🎯 VAMOS TESTAR JUNTOS - MANUALMENTE PRIMEIRO!

### JORNADA 1: SIGNUP → LOGIN → DASHBOARD

**Tempo estimado:** ~5 minutos

**Você vai precisar:**
- ✉️ Um email REAL (Gmail, Outlook, etc.)
- 📱 Acesso ao email

---

## 📋 PASSO A PASSO

### 1. ABRIR O SITE
```
URL: http://localhost:3000
```
- Abra no seu browser
- Você deve ver a homepage/landing page

**✅ Me confirme:** Site carregou?

---

### 2. IR PARA SIGNUP
```
URL: http://localhost:3000/auth/signup
```
OU
- Clique em "Cadastrar" / "Sign Up" na home

**O que você deve ver:**
- Formulário com campos: Email, Senha, Nome

**✅ Me confirme:** Formulário apareceu?

---

### 3. PREENCHER E ENVIAR
**Preencha:**
- Email: SEU_EMAIL_REAL@gmail.com
- Senha: qualquer senha forte (ex: Test@123!)
- Nome: Seu Nome

**Clique em:** "Cadastrar" / "Sign Up"

**O que deve acontecer:**
- Você será redirecionado para `/auth/verify`
- Página pedindo código OTP de 6 dígitos

**✅ Me confirme:** Redirecionou para verify?

---

### 4. VERIFICAR EMAIL E DIGITAR OTP
**Verifique seu email:**
- Procure por email de "Quayer" ou "contato@quayer.com"
- Assunto algo como "Código de Verificação" ou "OTP"
- **CÓDIGO: ______** (6 dígitos)

**Digite o código na página**

**O que deve acontecer:**
- Você será redirecionado para `/dashboard`
- Dashboard aparece com sidebar e conteúdo

**✅ Me confirme:** Dashboard carregou?

---

### 5. FAZER LOGOUT
**No dashboard:**
- Clique no seu avatar/nome no canto superior direito
- Clique em "Sair" / "Logout"

**O que deve acontecer:**
- Você volta para `/auth/login` ou homepage

**✅ Me confirme:** Logout funcionou?

---

### 6. FAZER LOGIN NOVAMENTE
```
URL: http://localhost:3000/auth/login
```

**Preencha:**
- Email: O MESMO email que você cadastrou
- Senha: A MESMA senha

**Clique em:** "Entrar" / "Login"

**O que deve acontecer:**
- Você vai direto para `/dashboard`
- Sem precisar de OTP (email já verificado)

**✅ Me confirme:** Login funcionou?

---

## 🎉 JORNADA 1 COMPLETA!

**Se todos os passos funcionaram:**
✅ Signup OK
✅ Email/OTP OK
✅ Dashboard OK
✅ Logout OK
✅ Login OK

---

## 🐛 SE ALGO DEU ERRADO

**Me avise IMEDIATAMENTE com:**
1. Em qual passo travou?
2. O que apareceu na tela?
3. Alguma mensagem de erro?
4. Screenshot se possível

**Eu vou:**
- Ver os logs do servidor
- Debugar o problema
- Ajustar e testar novamente

---

## 📊 PRÓXIMAS JORNADAS (após essa funcionar)

1. ✅ Signup → Login (EM TESTE AGORA)
2. ⏳ Criar Organização → Convidar Membro
3. ⏳ WhatsApp QR → Conectar → Enviar Mensagem
4. ⏳ Onboarding Completo
5. ⏳ Multi-user Collaboration

---

## 🚀 COMECE AGORA!

1. Abra: http://localhost:3000
2. Vá para Signup
3. Cadastre-se com seu email real
4. Me avise como está indo!

**ESTOU AQUI MONITORANDO E PRONTO PARA AJUDAR! 🎯**
