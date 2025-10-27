# Caderno de Teste - WhatsApp Instance Manager

**Data:** 2025-09-30
**Versão:** 1.0.0
**Aplicação:** WhatsApp Instance Management System
**Ambiente:** Development (localhost:3000)

---

## 1. Informações do Sistema

### Tecnologias
- **Frontend:** Next.js 15.3.5 + React 19
- **Backend:** Igniter.js Framework
- **Database:** Prisma + PostgreSQL
- **Cache:** Redis
- **Jobs:** BullMQ
- **UI:** Shadcn/UI + Tailwind CSS 4
- **Real-time:** Server-Sent Events (SSE)

### Funcionalidades Principais
1. Gerenciamento de instâncias WhatsApp
2. Conexão via QR Code
3. Sistema de temas (4 variações)
4. Real-time updates
5. CRUD completo de instâncias

---

## 2. Cenários de Teste

### 🧪 Teste 1: Inicialização do Sistema

**Objetivo:** Verificar se o sistema inicia corretamente

**Pré-requisitos:**
- Node.js instalado
- Dependências instaladas (npm install)
- Banco de dados PostgreSQL rodando
- Redis rodando (opcional para cache)

**Passos:**
1. Executar `npm run dev`
2. Acessar `http://localhost:3000`
3. Verificar console do servidor (sem erros críticos)
4. Verificar console do browser (sem erros críticos)

**Resultado Esperado:**
- ✅ Servidor compila sem erros
- ✅ Página carrega em < 3 segundos
- ✅ UI renderiza corretamente
- ✅ Sem erros 500 no console

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Tempo de compilação: _____ms
Tempo de carregamento: _____ms
Erros encontrados: _____
```

---

### 🧪 Teste 2: Teste Unitário/Integração

**Objetivo:** Executar suite de testes automatizados

**Comando:** `npm test`

**Resultado Esperado:**
- ✅ Todos os testes passam (100%)
- ✅ Sem falhas ou erros
- ✅ Coverage adequado (se aplicável)

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Total de testes: _____
Testes passados: _____
Testes falhos: _____
Tempo de execução: _____
```

---

### 🧪 Teste 3: Criar Nova Instância

**Objetivo:** Criar uma instância WhatsApp com sucesso

**Passos:**
1. Na página inicial, clicar em "Nova Instância" (botão azul no topo)
2. Preencher o formulário:
   - Nome: "Teste Instância 01"
   - Broker: "uazapi" (padrão)
3. Clicar em "Criar"
4. Aguardar resposta

**Resultado Esperado:**
- ✅ Modal abre corretamente
- ✅ Formulário valida campos obrigatórios
- ✅ POST /api/v1/instances retorna 201
- ✅ Nova instância aparece na lista
- ✅ Status inicial: "disconnected" (vermelho)
- ✅ Card mostra informações corretas (nome, broker, status)

**API Validation:**
```
POST /api/v1/instances
Body: { "name": "Teste Instância 01", "brokerType": "uazapi" }
Expected: 201 Created
Response: { "id": "uuid", "name": "...", "status": "disconnected", ... }
```

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Instance ID: _____
Tempo de criação: _____ms
Problemas encontrados: _____
```

---

### 🧪 Teste 4: Conectar Instância via QR Code

**Objetivo:** Conectar instância WhatsApp escaneando QR Code

**Pré-requisitos:**
- Instância criada (Teste 3)
- WhatsApp instalado no celular

**Passos:**
1. No card da instância, clicar em "Conectar" (botão verde)
2. Modal de conexão abre
3. Aguardar geração do QR Code (step 1 → step 2)
4. Verificar timer de expiração (120 segundos)
5. Abrir WhatsApp no celular
6. Ir em Menu > Dispositivos conectados > Conectar dispositivo
7. Escanear QR Code
8. Aguardar confirmação

**Resultado Esperado:**
- ✅ Modal abre com step 1 "Gerando QR Code..."
- ✅ POST /api/v1/instances/:id/connect retorna 200
- ✅ QR Code aparece (step 2)
- ✅ Timer começa contagem regressiva
- ✅ Instruções claras visíveis
- ✅ Após scan: status muda para "connected" (verde)
- ✅ Modal fecha automaticamente
- ✅ Card atualiza para status conectado
- ✅ GET /api/v1/instances/:id/status retorna "connected"

**API Validation:**
```
POST /api/v1/instances/:id/connect
Expected: 200 OK
Response: { "qrCode": "data:image/png;base64,...", "pairingCode": "...", "expires": 120000 }

GET /api/v1/instances/:id/status
Expected: 200 OK
Response: { "status": "connected", ... }
```

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Tempo para gerar QR: _____ms
Tempo total de conexão: _____s
QR Code expirou? [ ] Sim [ ] Não
Problemas encontrados: _____
```

---

### 🧪 Teste 5: Tratamento de Erro - Instância Já Conectada

**Objetivo:** Verificar tratamento de erro ao tentar reconectar instância já conectada

**Pré-requisitos:**
- Instância conectada (Teste 4)

**Passos:**
1. No card da instância conectada, verificar que botão "Conectar" não aparece
2. Se tentar forçar reconexão via API direta ou bug de UI:
   - POST /api/v1/instances/:id/connect novamente

**Resultado Esperado:**
- ✅ Botão "Conectar" não aparece em instâncias conectadas
- ✅ Botão "Desconectar" aparece (vermelho)
- ✅ Se tentar via API: POST retorna 400 Bad Request
- ✅ Mensagem de erro clara: "Instância já está conectada"
- ✅ UI mostra erro específico (não mostra "{}")

**API Validation:**
```
POST /api/v1/instances/:id/connect (instância já conectada)
Expected: 400 Bad Request
Response: { "message": "Instância já está conectada." }
```

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Mensagem de erro mostrada: _____
UI tratou corretamente? [ ] Sim [ ] Não
Problemas encontrados: _____
```

---

### 🧪 Teste 6: QR Code Expirado e Refresh

**Objetivo:** Testar expiração do QR Code e funcionalidade de refresh

**Pré-requisitos:**
- Instância desconectada

**Passos:**
1. Clicar em "Conectar"
2. Aguardar QR Code ser gerado
3. **NÃO escanear** - esperar timer chegar a 0
4. Verificar UI quando QR expira (step 3)
5. Clicar em "Atualizar QR"
6. Verificar se novo QR Code é gerado

**Resultado Esperado:**
- ✅ Timer decrementa de 120 até 0
- ✅ Quando expira: step muda para 3 "QR Code Expirado"
- ✅ Botão "Atualizar QR" aparece
- ✅ Ao clicar: novo QR é gerado (volta para step 2)
- ✅ Timer reseta para 120 segundos
- ✅ Novo QR é diferente do anterior

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Timer funcionou corretamente? [ ] Sim [ ] Não
Refresh gerou novo QR? [ ] Sim [ ] Não
Problemas encontrados: _____
```

---

### 🧪 Teste 7: Desconectar Instância

**Objetivo:** Desconectar instância WhatsApp conectada

**Pré-requisitos:**
- Instância conectada (Teste 4)

**Passos:**
1. No card da instância conectada, clicar em "Desconectar" (botão vermelho)
2. Aguardar confirmação/resposta
3. Verificar mudança de status

**Resultado Esperado:**
- ✅ POST /api/v1/instances/:id/disconnect retorna 200
- ✅ Status muda para "disconnected" (vermelho)
- ✅ Card atualiza visualmente
- ✅ Botão "Conectar" volta a aparecer
- ✅ Botão "Desconectar" desaparece
- ✅ WhatsApp no celular desconecta sessão

**API Validation:**
```
POST /api/v1/instances/:id/disconnect
Expected: 200 OK
Response: { "message": "Instância desconectada com sucesso" }
```

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Tempo para desconectar: _____ms
WhatsApp desconectou? [ ] Sim [ ] Não
Problemas encontrados: _____
```

---

### 🧪 Teste 8: Deletar Instância

**Objetivo:** Deletar instância do sistema

**Pré-requisitos:**
- Instância criada (pode estar conectada ou desconectada)

**Passos:**
1. No card da instância, clicar no menu (três pontos verticais)
2. Selecionar "Deletar"
3. Confirmar exclusão no dialog de confirmação
4. Aguardar resposta

**Resultado Esperado:**
- ✅ Menu dropdown abre corretamente
- ✅ Dialog de confirmação aparece
- ✅ Mensagem de confirmação clara
- ✅ DELETE /api/v1/instances/:id retorna 200
- ✅ Card desaparece da lista com animação
- ✅ Lista atualiza (se ficar vazia, mostra estado vazio)
- ✅ Instância removida do banco de dados

**API Validation:**
```
DELETE /api/v1/instances/:id
Expected: 200 OK
Response: { "message": "Instância deletada com sucesso" }
```

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Tempo para deletar: _____ms
Animação funcionou? [ ] Sim [ ] Não
Problemas encontrados: _____
```

---

### 🧪 Teste 9: Sistema de Temas (Theme Switcher)

**Objetivo:** Verificar funcionalidade do seletor de temas

**Passos:**
1. Localizar o Theme Switcher no topo da página (ao lado de "Nova Instância")
2. Clicar no dropdown de temas
3. Verificar 4 opções disponíveis:
   - **v1-base:** Blue + WhatsApp Green
   - **v2-pro:** Purple + Cyan
   - **v3-premium:** Gold + Deep Blue
   - **v4-marketing:** Gradient colors
4. Selecionar cada tema um por um
5. Verificar mudanças visuais em:
   - Botão "Nova Instância"
   - Ícone de smartphone no header
   - Botões "Conectar" nos cards
   - Timer no modal de conexão
   - Instruções no modal de conexão
   - Botão "Atualizar QR"

**Resultado Esperado:**
- ✅ Dropdown abre com 4 opções
- ✅ Cada tema tem preview visual (ícone colorido)
- ✅ Ao selecionar tema: `data-theme` attribute muda no HTML
- ✅ Cores primárias mudam visualmente
- ✅ Cores secundárias mudam visualmente
- ✅ Cores de acento mudam visualmente
- ✅ Transições suaves entre temas
- ✅ Tema persiste após refresh da página (localStorage)

**Temas para Validar:**

**v1-base (Blue + Green):**
- Primary: Azul (#2563eb)
- Secondary: Verde WhatsApp (#25D366)
- Accent: Verde claro

**v2-pro (Purple + Cyan):**
- Primary: Roxo (#9333ea)
- Secondary: Cyan (#06b6d4)
- Accent: Cyan claro

**v3-premium (Gold + Deep Blue):**
- Primary: Dourado (#f59e0b)
- Secondary: Azul escuro (#1e40af)
- Accent: Dourado claro

**v4-marketing (Gradients):**
- Primary: Gradiente rosa/laranja
- Secondary: Gradiente roxo/azul
- Accent: Gradiente variado

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
v1-base funcionou? [ ] Sim [ ] Não
v2-pro funcionou? [ ] Sim [ ] Não
v3-premium funcionou? [ ] Sim [ ] Não
v4-marketing funcionou? [ ] Sim [ ] Não
Persistência funcionou? [ ] Sim [ ] Não
Problemas encontrados: _____
```

---

### 🧪 Teste 10: Múltiplas Instâncias

**Objetivo:** Testar gerenciamento de múltiplas instâncias simultaneamente

**Passos:**
1. Criar 3 instâncias diferentes:
   - "Instância Vendas"
   - "Instância Suporte"
   - "Instância Marketing"
2. Conectar 2 delas
3. Deixar 1 desconectada
4. Verificar lista e status de cada uma
5. Desconectar 1 conectada
6. Deletar 1 instância

**Resultado Esperado:**
- ✅ Todas as 3 instâncias criadas com sucesso
- ✅ Cards aparecem em grid responsivo
- ✅ Status de cada instância independente
- ✅ Não há conflito entre instâncias
- ✅ GET /api/v1/instances retorna todas as instâncias
- ✅ Operações em uma instância não afetam outras
- ✅ Real-time updates funcionam para todas

**API Validation:**
```
GET /api/v1/instances
Expected: 200 OK
Response: [
  { "id": "uuid1", "name": "Instância Vendas", "status": "connected" },
  { "id": "uuid2", "name": "Instância Suporte", "status": "connected" },
  { "id": "uuid3", "name": "Instância Marketing", "status": "disconnected" }
]
```

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Total de instâncias criadas: _____
Total conectadas: _____
Conflitos encontrados: _____
Problemas encontrados: _____
```

---

### 🧪 Teste 11: Responsividade (Mobile/Desktop)

**Objetivo:** Verificar responsividade da interface

**Passos:**
1. Testar em Desktop (1920x1080)
2. Testar em Tablet (768x1024)
3. Testar em Mobile (375x667)
4. Verificar:
   - Layout de cards
   - Header e botões
   - Modal de conexão
   - QR Code display
   - Theme switcher

**Resultado Esperado:**
- ✅ Desktop: Grid de 3 colunas
- ✅ Tablet: Grid de 2 colunas
- ✅ Mobile: Grid de 1 coluna
- ✅ Todos os botões acessíveis
- ✅ QR Code legível em todas as telas
- ✅ Modal responsivo
- ✅ Sem overflow horizontal
- ✅ Touch targets adequados (min 44px)

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
Desktop: [ ] OK [ ] Problemas
Tablet: [ ] OK [ ] Problemas
Mobile: [ ] OK [ ] Problemas
Problemas encontrados: _____
```

---

### 🧪 Teste 12: Performance e Loading States

**Objetivo:** Verificar estados de loading e performance

**Aspectos a Verificar:**
1. Loading na listagem inicial
2. Loading ao criar instância
3. Loading ao conectar (QR Code generation)
4. Loading ao desconectar
5. Loading ao deletar
6. Tempo de resposta das APIs

**Resultado Esperado:**
- ✅ Skeleton loaders aparecem quando apropriado
- ✅ Spinners visíveis durante operações
- ✅ Botões desabilitados durante loading
- ✅ Sem race conditions
- ✅ APIs respondem em < 5 segundos
- ✅ UI nunca trava ou congela

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
GET /instances: _____ms
POST /instances: _____ms
POST /connect: _____ms
POST /disconnect: _____ms
DELETE /instances: _____ms
Problemas de UX: _____
```

---

### 🧪 Teste 13: Real-time Updates (SSE)

**Objetivo:** Verificar updates em tempo real via Server-Sent Events

**Passos:**
1. Abrir aplicação em 2 abas diferentes do browser
2. Na aba 1: criar nova instância
3. Verificar se aba 2 atualiza automaticamente
4. Na aba 1: conectar instância
5. Verificar se aba 2 mostra status "connected"
6. Na aba 1: desconectar instância
7. Verificar se aba 2 atualiza

**Resultado Esperado:**
- ✅ SSE connection estabelecida
- ✅ GET /api/v1/sse/events retorna 200
- ✅ Mudanças em uma aba refletem em outras
- ✅ Sem necessidade de refresh manual
- ✅ Latência < 2 segundos

**Status:** [ ] Passou [ ] Falhou [ ] Bloqueado

**Observações:**
```
SSE funcionou? [ ] Sim [ ] Não
Latência observada: _____s
Problemas encontrados: _____
```

---

## 3. Checklist Final

### Funcionalidades Principais
- [ ] Criar instância
- [ ] Listar instâncias
- [ ] Conectar via QR Code
- [ ] Desconectar instância
- [ ] Deletar instância
- [ ] Atualizar QR Code expirado
- [ ] Trocar tema visual
- [ ] Real-time updates

### Tratamento de Erros
- [ ] Erro de validação (campos vazios)
- [ ] Erro de instância já conectada
- [ ] Erro de QR Code expirado
- [ ] Erro de conexão com API
- [ ] Mensagens de erro claras (não mostra "{}")

### Performance
- [ ] Página carrega em < 3s
- [ ] APIs respondem em < 5s
- [ ] Sem memory leaks
- [ ] Sem erros no console

### UI/UX
- [ ] Layout responsivo
- [ ] Animações suaves
- [ ] Loading states claros
- [ ] Feedback visual adequado
- [ ] Temas funcionam corretamente

### Qualidade de Código
- [ ] Testes automatizados passam
- [ ] Sem warnings no build
- [ ] TypeScript sem erros
- [ ] ESLint sem erros

---

## 4. Bugs Encontrados

### Bug #1
**Descrição:** _____
**Severidade:** [ ] Crítico [ ] Alto [ ] Médio [ ] Baixo
**Passos para reproduzir:** _____
**Resultado esperado:** _____
**Resultado obtido:** _____
**Status:** [ ] Aberto [ ] Em correção [ ] Resolvido

### Bug #2
**Descrição:** _____
**Severidade:** [ ] Crítico [ ] Alto [ ] Médio [ ] Baixo
**Passos para reproduzir:** _____
**Resultado esperado:** _____
**Resultado obtido:** _____
**Status:** [ ] Aberto [ ] Em correção [ ] Resolvido

---

## 5. Conclusão

**Data de Execução:** _____
**Testador:** _____
**Resultado Geral:** [ ] Aprovado [ ] Aprovado com Ressalvas [ ] Reprovado

**Total de Testes:** 13
**Testes Passados:** _____
**Testes Falhos:** _____
**Cobertura:** ____%

**Observações Finais:**
```
_____
```

**Recomendações:**
```
_____
```

**Próximos Passos:**
```
_____
```

---

## Apêndice: Comandos Úteis

```bash
# Iniciar desenvolvimento
npm run dev

# Executar testes
npm test

# Build de produção
npm run build

# Verificar tipos TypeScript
npm run type-check

# Lint
npm run lint

# Limpar cache do Next.js
rm -rf .next

# Resetar banco de dados (cuidado!)
npx prisma migrate reset

# Ver logs do Redis
redis-cli monitor

# Ver status do banco
npx prisma studio
```