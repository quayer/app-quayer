# 🎯 Integração do Skill Webapp-Testing

Este documento descreve como o skill **webapp-testing** (.cursor/skills/webapp-testing) foi integrado aos testes E2E do projeto.

## 📋 O que é o Skill Webapp-Testing?

Skill fornecido pelo Cursor para testes de web apps usando Playwright, com foco em:

- ✅ **Padrão Reconnaissance-Then-Action** (Inspecionar → Descobrir → Agir)
- ✅ **Captura completa de console logs**
- ✅ **Screenshots automáticos para debugging**
- ✅ **Descoberta dinâmica de elementos**
- ✅ **Wait for networkidle** (crítico para apps dinâmicos)

## 🔧 Melhorias Implementadas

### 1. **Captura Aprimorada de Erros** (`setupErrorCapture`)

**Antes:**
```typescript
const errors = setupErrorCapture(page);
// Capturava apenas erros do console
```

**Depois:**
```typescript
const { errors, consoleMessages } = setupErrorCapture(page);
// Captura:
// - Console errors
// - Page errors
// - Request failures (network errors)
// - TODAS as mensagens do console (debug)
```

**Benefícios:**
- Debug mais completo com TODOS os logs
- Detecção de network failures
- Logging visual com emojis (🔴 para erros)

### 2. **Padrão Reconnaissance-Then-Action** (`takeReconnaissance`)

Baseado no exemplo `element_discovery.py` do skill:

```typescript
// 🔍 RECONNAISSANCE: Inspecionar antes de agir
const { inputs, buttons, links } = await takeReconnaissance(page, 'login-form');

// 🎯 ACTION: Usar dados descobertos para agir
const emailInput = page.locator('input[type="email"]').first();
```

**O que faz:**
1. Tira screenshot full-page para debugging visual
2. Descobre todos os elementos interativos (buttons, links, inputs)
3. Loga estatísticas de elementos encontrados
4. Retorna elementos para uso posterior

**Benefícios:**
- Screenshots automáticos em `test-screenshots/`
- Debugging visual do estado da página
- Inspeção antes de falhas
- Logs detalhados de elementos encontrados

### 3. **Wait for NetworkIdle** (CRÍTICO)

**Antes:**
```typescript
await page.goto(BASE_URL);
await page.waitForLoadState('domcontentloaded');
```

**Depois:**
```typescript
await page.goto(BASE_URL);
await page.waitForLoadState('networkidle'); // CRÍTICO para apps dinâmicos
```

**Por quê?**
- Apps React/Next.js carregam conteúdo dinamicamente
- `domcontentloaded` dispara ANTES do JavaScript executar
- `networkidle` espera requisições de rede terminarem
- Evita erros de "elemento não encontrado"

### 4. **Console Logging Detalhado**

```typescript
// Debug automático de mensagens do console
if (consoleMessages.length > 0) {
  console.log(`📋 Console Messages (${consoleMessages.length}):`, 
              consoleMessages.slice(0, 5));
}
```

**Benefícios:**
- Ver exatamente o que a aplicação está logando
- Identificar warnings antes de virarem erros
- Debug de comportamento do client-side

## 📂 Estrutura de Arquivos

```
test/
├── e2e/
│   ├── all-routes-complete.spec.ts  ← Testes TypeScript (atualizados)
│   └── webapp-testing-example.py    ← Exemplo Python (novo)
│
├── screenshots/                      ← Screenshots automáticos
│   ├── login-page-*.png
│   ├── homepage-*.png
│   └── console-login-*.log
```

## 🚀 Como Usar

### TypeScript (Playwright Test)

```typescript
test('meu teste', async ({ page }) => {
  // 1. Setup error capture
  const { errors, consoleMessages } = setupErrorCapture(page);
  
  // 2. Navigate + wait for networkidle
  await page.goto(`${BASE_URL}/minha-rota`);
  await page.waitForLoadState('networkidle');
  
  // 3. Reconnaissance (inspecionar antes de agir)
  const { inputs, buttons } = await takeReconnaissance(page, 'minha-rota');
  
  // 4. Action (interagir com elementos descobertos)
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();
  
  // 5. Assertions
  expect(errors).toHaveLength(0);
  expect(inputs.length).toBeGreaterThan(0);
});
```

### Python (Script Direto)

```bash
# Executar exemplo Python
cd test/e2e
python webapp-testing-example.py
```

O script Python demonstra:
- ✅ Captura de console logs
- ✅ Screenshots automáticos
- ✅ Teste de múltiplas rotas
- ✅ Padrão Reconnaissance-Then-Action

## 🎯 Exemplos Práticos do Skill

O skill fornece exemplos prontos em `.cursor/skills/webapp-testing/examples/`:

1. **`console_logging.py`** - Captura de console logs
2. **`element_discovery.py`** - Descoberta de elementos interativos
3. **`static_html_automation.py`** - Testes com file:// URLs

## 📊 Comparação Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Error Capture** | Apenas console errors | Console + Page + Network |
| **Wait Strategy** | domcontentloaded | networkidle (dinâmico) |
| **Debugging** | Manual | Screenshots automáticos |
| **Element Discovery** | Manual | Reconnaissance automático |
| **Console Logs** | Perdidos | Salvos em arquivos |
| **Screenshots** | Manuais | Automáticos em cada teste |

## 🔍 Decision Tree do Skill

```
Sua tarefa → É HTML estático?
    ├─ Sim → Ler HTML diretamente
    │         └─ Escrever script Playwright
    │
    └─ Não (app dinâmico) → Servidor rodando?
        ├─ Não → Use with_server.py helper
        │        └─ Script Playwright simplificado
        │
        └─ Sim → Reconnaissance-Then-Action:
            1. Navigate + wait for networkidle
            2. Screenshot ou inspecionar DOM
            3. Identificar seletores
            4. Executar ações com seletores descobertos
```

## 🛠️ Scripts Helper do Skill

### `with_server.py`

Gerencia lifecycle do servidor automaticamente:

```bash
# Servidor único
python scripts/with_server.py \
  --server "npm run dev" \
  --port 3000 \
  -- python seu_teste.py

# Múltiplos servidores (backend + frontend)
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 8000 \
  --server "cd frontend && npm run dev" --port 3000 \
  -- python seu_teste.py
```

**Benefícios:**
- Inicia servidor automaticamente
- Espera servidor estar pronto
- Mata servidor ao finalizar
- Suporta múltiplos servidores

## ✅ Checklist de Boas Práticas

Ao escrever testes com webapp-testing:

- [ ] **Sempre** use `page.wait_for_load_state('networkidle')`
- [ ] **Sempre** faça reconnaissance antes de actions críticas
- [ ] **Sempre** capture erros de console, página e rede
- [ ] **Sempre** tire screenshots em pontos-chave
- [ ] **Sempre** use seletores descritivos (`text=`, `role=`, CSS)
- [ ] **Sempre** adicione waits apropriados
- [ ] **Sempre** feche o browser ao terminar
- [ ] **Sempre** salve console logs para debug posterior

## 🔗 Recursos Adicionais

- Skill oficial: `.cursor/skills/webapp-testing/SKILL.md`
- Exemplos: `.cursor/skills/webapp-testing/examples/`
- Playwright Docs: https://playwright.dev/
- Playwright Python: https://playwright.dev/python/

## 🎉 Resultado Final

Com essas mudanças, seus testes E2E agora:

✅ Capturam **TODOS** os erros (console, página, rede)
✅ Tiram **screenshots automáticos** para debugging
✅ Usam **networkidle** para apps dinâmicos (crítico!)
✅ Fazem **reconnaissance** antes de interações
✅ Salvam **console logs** para análise posterior
✅ Seguem **padrões do skill webapp-testing**

🚀 **Happy Testing!**

