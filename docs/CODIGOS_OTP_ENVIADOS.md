# 📧 Códigos OTP Enviados - Referência Rápida

## ✅ E-mails e Códigos de Verificação

**Data**: 12 de outubro de 2025

---

## 🔐 Códigos Ativos

### 1. maria.teste@example.com
- **Código**: `640911`
- **Tipo**: Signup (cadastro)
- **Enviado em**: ~20:15
- **Status**: ✅ Enviado com sucesso
- **Uso**: Testes de onboarding

### 2. gabrielrizzatto@hotmail.com
- **Código**: `329825`
- **Tipo**: Login
- **Enviado em**: ~20:16
- **Status**: ✅ Enviado com sucesso
- **Uso**: Testes de login

### 3. admin@quayer.com
- **Código**: `428651`
- **Tipo**: Login (admin)
- **Enviado em**: ~22:41
- **Status**: ✅ Enviado com sucesso
- **Uso**: **VALIDAÇÕES ADMIN** 🔴

---

## 🎯 PRÓXIMO PASSO IMEDIATO

### Login como Admin
```
1. Acessar: http://localhost:3000/login
2. E-mail: admin@quayer.com
3. Código: 428651
4. Será redirecionado para: /admin
5. Iniciar auditorias das 8 páginas
```

---

## 📋 Para Encontrar Códigos nos Logs

**Padrão de busca no terminal**:
```bash
# Procurar por:
"Código XXXXXX"
"Para: email@exemplo.com"

# Ou:
grep "Código" logs.txt
```

**Logs de Confirmação**:
```
========== 📧 ENVIANDO EMAIL REAL ==========
Para: admin@quayer.com
Assunto: Código 428651 - Login Quayer 🔐
De: Quayer <contato@quayer.com>
==========================================
✅ Email enviado com sucesso!
Message ID: <7e811769-2766-3d35-3a07-13ccf595d0ea@quayer.com>
Response: 250 2.0.0 OK ...
==========================================
```

---

## 🧪 Testes Realizados

### ✅ Signup (maria.teste@example.com)
- Código enviado: 640911
- E-mail SMTP funcionando ✅
- Tela de verificação OK ✅
- Screenshot capturado ✅

### ✅ Login (gabrielrizzatto@hotmail.com)
- Código enviado: 329825
- Magic link funcionando ✅
- Redirecionamento OK ✅

### ⏳ Login Admin (admin@quayer.com)
- Código enviado: 428651
- **Aguardando inserção manual**
- Será usado para validar 8 páginas admin

---

## 🎯 Próximas Validações

### Com Código 428651 (admin@quayer.com)
1. ⏳ Dashboard admin
2. ⏳ Organizações (CRUD)
3. ⏳ Clientes
4. ⏳ Integrações admin
5. ⏳ Webhooks
6. ⏳ Brokers
7. ⏳ Logs
8. ⏳ Permissões

**Total**: 8 páginas para validar

---

**Documento atualizado**: 12/out/2025, 22:50  
**Código mais recente**: 428651 (admin)  
**Status**: ✅ Pronto para uso!

