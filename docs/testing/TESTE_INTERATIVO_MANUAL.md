# 🚀 Guia de Teste Interativo Manual

## 📋 O que é este teste?

Este é um **teste interativo** que abre o browser (Playwright) em modo **visível** e guia você através de **TODAS as rotas** do sistema, pausando em cada etapa para que você possa **interagir manualmente** e validar cada funcionalidade.

## 🎯 Diferença dos Testes Automatizados

| Aspecto | Testes Automatizados | Teste Interativo |
|---------|---------------------|------------------|
| **Browser** | Headless (invisível) | Headed (visível) |
| **Interação** | Playwright controla tudo | Você controla manualmente |
| **Objetivo** | Validação rápida (CI/CD) | Validação detalhada (UX) |
| **Duração** | ~5 minutos | 30-60 minutos |
| **Quando usar** | Antes de commit/push | Antes de release/demo |

## 🚀 Como Executar

### Pré-requisitos

1. **Servidor deve estar rodando:**
   ```bash
   npm run dev
   # Aguarde até ver: "Ready on http://localhost:3000"
   ```

2. **Em outro terminal, execute:**
   ```bash
   npm run test:interactive
   ```

   Ou diretamente:
   ```bash
   npx playwright test test/e2e/manual-interactive.spec.ts --headed --timeout=0
   ```

## 📝 O que será testado?

### 1️⃣ Autenticação Passwordless (OTP)
- Login via OTP (código enviado por email)
- Email: `admin@quayer.com`
- Código OTP: `123456` (configurado em `ADMIN_RECOVERY_TOKEN`)

**O que testar:**
- [ ] Preencher email
- [ ] Click em "Enviar código"
- [ ] Verificar código no console do servidor
- [ ] Inserir código OTP
- [ ] Login concluído com sucesso

---

### 2️⃣ CRM - Lista de Contatos
**O que testar:**
- [ ] Busca por nome/telefone/email
- [ ] Filtros: Status, Origem, Tags
- [ ] Ordenação (Nome, Data, Telefone)
- [ ] Seleção múltipla (checkboxes)
- [ ] Ações em massa (Bulk Actions)
- [ ] Paginação (Next/Previous)
- [ ] Click em um contato para ver detalhes

---

### 3️⃣ CRM - Detalhes do Contato
**O que testar:**
- [ ] Tabs: Dados, Mensagens, Atendimentos, Observações
- [ ] Modo Edição (Edit mode toggle)
- [ ] Adicionar/remover tags
- [ ] Criar nova observação
- [ ] Ver histórico de mensagens
- [ ] Ver timeline de atendimentos

---

### 4️⃣ Chat - Sistema de Mensagens Real-time ⭐
**O que testar:**
- [ ] Click em uma conversa da lista
- [ ] Enviar mensagem de texto
- [ ] Verificar optimistic update (aparece instantaneamente)
- [ ] Verificar status indicator (pending → sent → delivered)
- [ ] Verificar SSE connection (conexão real-time)
- [ ] Auto-scroll para última mensagem
- [ ] Tipos de mensagem: texto, áudio, imagem, documento

---

### 5️⃣ Kanban - Drag & Drop ⭐⭐⭐ (CRÍTICO)
**O que testar:**
- [ ] Click em um quadro da lista
- [ ] Visualizar colunas e cards
- [ ] **ARRASTAR card entre colunas** (grip handle)
- [ ] Verificar visual feedback (opacity, ring)
- [ ] Verificar toast de sucesso
- [ ] Reordenar cards na mesma coluna
- [ ] Criar nova coluna
- [ ] Criar novo card

---

### 6️⃣ Configurações - Tabulações (Color Picker) ⭐
**O que testar:**
- [ ] Ver stats cards (Total, Contatos, Kanban)
- [ ] Buscar tabulação
- [ ] Click em "Nova Tabulação"
- [ ] Preencher nome
- [ ] **TESTAR Color Picker** (native + hex input)
- [ ] Verificar sync bidirecional (picker ↔ hex)
- [ ] Criar tabulação
- [ ] Editar tabulação existente
- [ ] Excluir tabulação

---

### 7️⃣ Configurações - Labels (Categorias)
**O que testar:**
- [ ] Ver stats (Total, Em uso, Categorias)
- [ ] Filtrar por categoria (Select)
- [ ] Click em "Nova Label"
- [ ] Preencher nome
- [ ] Selecionar categoria (8 opções)
- [ ] Escolher cor (color picker)
- [ ] Criar label
- [ ] Verificar badge de categoria
- [ ] Editar/excluir label

---

### 8️⃣ Configurações - Departamentos (Toggle) ⭐
**O que testar:**
- [ ] Ver stats (Total, Ativos, Usuários)
- [ ] Click em "Novo Departamento"
- [ ] Preencher nome e descrição
- [ ] Verificar toggle (ativo por padrão)
- [ ] Criar departamento
- [ ] **TESTAR Toggle ativo/inativo na tabela**
- [ ] Verificar toast de ativado/desativado
- [ ] Editar/excluir departamento

---

### 9️⃣ Configurações - Webhooks (Deliveries) ⭐
**O que testar:**
- [ ] Ver stats (Total, Ativos, Entregas)
- [ ] Click em "Novo Webhook"
- [ ] Preencher URL e secret
- [ ] Selecionar eventos (9 checkboxes com ScrollArea)
- [ ] Verificar toggle ativo
- [ ] Criar webhook
- [ ] Click em "Testar" (menu de ações)
- [ ] Click em "Ver entregas"
- [ ] Ver deliveries (success/failed/pending)
- [ ] Ver detalhes de entrega (JSON response)
- [ ] Testar retry em entrega falhada

---

### 🔟 Acessibilidade - Navegação por Teclado
**O que testar:**
- [ ] Pressione TAB para navegar pelos elementos
- [ ] Verifique focus ring visível (ring-2)
- [ ] ENTER para ativar botões
- [ ] SPACE para checkboxes
- [ ] ESC para fechar dialogs
- [ ] Setas para navegação em Select/Combobox
- [ ] Verifique aria-labels (inspecionar com DevTools)

---

### 1️⃣1️⃣ Responsividade - Mobile/Tablet/Desktop
O teste redimensiona automaticamente o browser para 3 viewports:

**Mobile (375x667)**
- [ ] Sidebar colapsa
- [ ] Tabela vira cards empilhados
- [ ] Botões viram ícones

**Tablet (768x1024)**
- [ ] Sidebar colapsada por padrão
- [ ] Tabela com colunas principais
- [ ] Touch-friendly buttons

**Desktop (1920x1080)**
- [ ] Sidebar expandida
- [ ] Tabela com todas as colunas
- [ ] Layout otimizado para mouse

---

### 1️⃣2️⃣ Performance - Tempo de Carregamento
O teste mede automaticamente o tempo de carregamento de 5 rotas:
- [ ] Login
- [ ] CRM Contatos
- [ ] Chat
- [ ] Kanban
- [ ] Tabulações

**Meta:** < 2 segundos por página

---

## 🎮 Como Usar o Playwright Inspector

Quando o teste pausar, você verá uma janela com o **Playwright Inspector**:

```
┌─────────────────────────────────────┐
│  Playwright Inspector               │
├─────────────────────────────────────┤
│  ▶ Resume  (Continue next test)     │
│  ⏭ Step Over  (Execute one action)  │
│  🔍 Pick Locator  (Inspect element) │
│  📷 Take Screenshot                  │
│  🎬 Record at cursor                 │
└─────────────────────────────────────┘
```

### Atalhos de Teclado:
- **F8** - Resume (continuar para próximo teste)
- **F10** - Step Over (executar uma ação)
- **F11** - Step Into (entrar em função)
- **Ctrl+Shift+C** - Pick Locator (inspecionar elemento)

---

## 📊 Checklist de Validação

Durante os testes, verifique:

### Visual
- [ ] Sem elementos sobrepostos
- [ ] Cores consistentes (color tokens)
- [ ] Espaçamentos corretos (8pt grid)
- [ ] Animações suaves (transitions)
- [ ] Loading states apropriados
- [ ] Empty states claros

### Funcional
- [ ] Todos os botões clicáveis
- [ ] Forms validam corretamente
- [ ] Toasts aparecem nas ações
- [ ] Dialogs abrem/fecham corretamente
- [ ] Dados carregam sem erro
- [ ] Real-time funciona (SSE)

### Performance
- [ ] Páginas carregam < 2s
- [ ] Sem lag no drag & drop
- [ ] Scroll suave
- [ ] Sem memory leaks

### Acessibilidade
- [ ] Focus ring visível
- [ ] Navegação por teclado funciona
- [ ] aria-labels presentes
- [ ] Contraste adequado (WCAG AA)

---

## 🐛 Reportando Bugs

Se encontrar algum problema, documente assim:

```markdown
### 🐛 Bug: [Título descritivo]

**Teste:** 5️⃣ Kanban - Drag & Drop
**Rota:** `/crm/kanban`

**Passos para Reproduzir:**
1. Abrir quadro "Pipeline de Vendas"
2. Arrastar card "João Silva" da coluna "Novo" para "Em Atendimento"
3. Card não move, aparece erro no console

**Comportamento Esperado:**
- Card deve mover para coluna destino
- Toast "Contato movido com sucesso"
- Tabulação atualizada automaticamente

**Comportamento Atual:**
- Card volta para posição original
- Erro no console: "Cannot read property 'id' of undefined"

**Screenshot:** (anexar se possível)

**Severidade:** 🔴 CRÍTICO (feature principal não funciona)
```

### Níveis de Severidade:
- 🔴 **CRÍTICO** - Feature principal quebrada, bloqueia release
- 🟠 **ALTO** - Feature secundária quebrada, afeta UX significativamente
- 🟡 **MÉDIO** - Bug visual ou comportamento inesperado
- 🟢 **BAIXO** - Cosmético, não afeta funcionalidade

---

## 🎯 Features Críticas (Priorizar Testes)

Estas features DEVEM funcionar perfeitamente:

1. ⭐⭐⭐ **Kanban Drag & Drop** - Core do CRM
2. ⭐⭐⭐ **Chat SSE Real-time** - Diferencial competitivo
3. ⭐⭐ **Color Picker** - UX única
4. ⭐⭐ **Webhook Deliveries** - Integração crítica
5. ⭐ **Toggle Switches** - Usabilidade

---

## ⏱️ Tempo Estimado

| Teste | Tempo |
|-------|-------|
| 1️⃣ Autenticação | 2 min |
| 2️⃣ CRM Lista | 3 min |
| 3️⃣ CRM Detalhes | 4 min |
| 4️⃣ Chat | 5 min |
| 5️⃣ Kanban | 8 min ⭐⭐⭐ |
| 6️⃣ Tabulações | 4 min ⭐ |
| 7️⃣ Labels | 3 min |
| 8️⃣ Departamentos | 3 min ⭐ |
| 9️⃣ Webhooks | 5 min ⭐ |
| 🔟 Acessibilidade | 3 min |
| 1️⃣1️⃣ Responsividade | 5 min |
| 1️⃣2️⃣ Performance | 2 min |
| **TOTAL** | **45-60 min** |

### Teste Rápido (15 min):
Execute apenas os testes marcados com ⭐ (críticos)

---

## 🎉 Conclusão

Ao final dos testes, você terá validado:
- ✅ 10 páginas completas
- ✅ 100+ features
- ✅ 27 APIs integradas
- ✅ Acessibilidade WCAG 2.1 AA
- ✅ Responsividade (mobile/tablet/desktop)
- ✅ Performance (< 2s por página)

**Próximos passos:**
1. Documente bugs encontrados
2. Crie issues no GitHub
3. Priorize correções
4. Rode testes automatizados: `npm run test:e2e`
5. Deploy to production! 🚀

---

## 🆘 Troubleshooting

### Erro: "Cannot connect to http://localhost:3000"
**Solução:** Certifique-se que o servidor está rodando:
```bash
npm run dev
```

### Erro: "Playwright browser not installed"
**Solução:** Instale os browsers:
```bash
npx playwright install
```

### Browser não abre (fica headless)
**Solução:** Certifique-se de usar `--headed`:
```bash
npm run test:interactive
```

### Teste não pausa para interação
**Solução:** Verifique se `page.pause()` está no código do teste.

---

## 📚 Recursos Adicionais

- **Playwright Docs:** https://playwright.dev/docs/debug
- **Playwright Inspector:** https://playwright.dev/docs/inspector
- **Playwright Codegen:** `npx playwright codegen http://localhost:3000`
- **Playwright Trace Viewer:** `npx playwright show-trace`

---

**Criado por:** Lia AI Agent
**Data:** 2025-01-16
**Versão:** 1.0.0
**Sistema:** Quayer WhatsApp API Platform
