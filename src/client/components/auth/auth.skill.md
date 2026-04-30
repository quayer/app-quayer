# Skill: auth

Componentes de UI das jornadas de autenticação. Renderizados dentro do `(auth)` layout do Next.js App Router.

## Propósito

- Formulários de login, signup, OTP, 2FA, onboarding e callbacks OAuth
- Todos são Client Components (`"use client"`) que consomem a API via Igniter
- A rota `/onboarding` redireciona para `/` após conclusão

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `auth-shell.tsx` | Wrapper visual das páginas de auth — fundo animado + card central |
| `auth-layout.tsx` | Layout animado alternativo (stars background) |
| `login-form-final.tsx` | Formulário de login (email + password) com submit à API |
| `login-otp-form.tsx` | Segundo fator: campo OTP de 6 dígitos após login |
| `otp-form.tsx` | Formulário OTP genérico (reusado em signup verify) |
| `two-factor-challenge.tsx` | Desafio 2FA (TOTP/backup codes) |
| `onboarding-form.tsx` | Wizard de onboarding pós-cadastro (nome, workspace) |
| `google-callback-v3.tsx` | Client component do callback `/auth/google-callback` |
| `turnstile-widget.tsx` | Widget CAPTCHA Cloudflare Turnstile (bot protection) |

## Rotas associadas

```
/(auth)/login                    → login-form-final.tsx
/(auth)/login/verify             → login-otp-form.tsx
/(auth)/login/verify-magic       → LoginVerifyMagicClient.tsx
/(auth)/signup                   → (formulário inline na page)
/(auth)/signup/verify            → otp-form.tsx
/(auth)/google-callback          → google-callback-v3.tsx
/(auth)/onboarding               → onboarding-form.tsx
```

## Padrões

- Todos consomem `api.<resource>.<action>.mutate()` do Igniter client
- Erros de API são exibidos via `sonner` toast (não inline)
- `turnstile-widget` é montado condicionalmente (`NEXT_PUBLIC_TURNSTILE_ENABLED`)
- `two-factor-challenge` recebe `sessionToken` via URL param após login parcial

## Ao estender

- Novo passo de auth: criar `novo-passo-client.tsx` + rota `/(auth)/novo-passo/page.tsx`
- Novo provider OAuth: criar callback client análogo ao `google-callback-v3.tsx`
- Nunca adicionar lógica de negócio aqui — apenas UI + chamada à API
