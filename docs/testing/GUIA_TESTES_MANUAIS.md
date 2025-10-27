# 🧪 GUIA COMPLETO DE TESTES MANUAIS - App Quayer

**Data**: 2025-10-16
**Status do Servidor**: Iniciando em http://localhost:3000
**Objetivo**: Validar todas as funcionalidades após correções brutais

---

## 🎯 PRÉ-REQUISITOS

### Antes de Começar
- ✅ Servidor rodando: `npm run dev`
- ✅ Banco de dados rodando (PostgreSQL)
- ✅ Redis rodando (opcional para cache)
- ✅ Navegador aberto em: http://localhost:3000

### Credenciais de Teste
```
Admin:
- Email: admin@quayer.com
- OTP: 123456 (código padrão de teste)

Master (Organização):
- Email: master@acme.com
- OTP: 123456
```

---

## 📋 CHECKLIST DE TESTES MANUAIS

## CATEGORIA 1: AUTENTICAÇÃO (10 testes)

### 1.1 ✅ Login Passwordless com OTP
**URL**: http://localhost:3000/login

**Passos**:
1. Acesse a página de login
2. Digite: `admin@quayer.com`
3. Clique em "Continuar"
4. Verifique que foi redirecionado para `/login/verify`
5. Digite o código OTP: `123456`
6. Clique em "Verificar"
7. Deve redirecionar para o dashboard

**✅ Sucesso se**:
- Login realizado sem senha
- Redirecionamento correto
- Não há erros no console

**❌ Erro se**:
- Página trava
- Código OTP não aceito
- Erro 401/403

---

### 1.2 ✅ Signup com OTP
**URL**: http://localhost:3000/signup

**Passos**:
1. Acesse a página de signup
2. Digite nome: "Teste Usuario"
3. Digite email único: `teste{timestamp}@example.com`
4. Clique em "Criar conta"
5. Verifique redirecionamento para `/signup/verify`
6. Digite código OTP: `123456`
7. Clique em "Verificar"

**✅ Sucesso se**:
- Conta criada com sucesso
- Redirecionamento para onboarding
- Email único aceito

---

### 1.3 ✅ Magic Link
**URL**: http://localhost:3000/login

**Passos**:
1. Digite email: `admin@quayer.com`
2. Clique em "Enviar link mágico"
3. Verifique console do servidor para o link
4. Copie o token do link
5. Acesse: `http://localhost:3000/login/verify-magic?token={TOKEN}`

**✅ Sucesso se**:
- Link gerado
- Login automático funciona

---

### 1.4 ✅ Google OAuth
**URL**: http://localhost:3000/login

**Passos**:
1. Clique no botão "Continuar com Google"
2. Verifique redirecionamento para Google
3. Faça login com conta Google
4. Verifique callback e redirecionamento

**⚠️ Nota**: Requer `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` configurados

---

### 1.5 ✅ Logout
**Passos**:
1. Estando logado, clique no avatar no canto superior direito
2. Clique em "Sair"
3. Verifique redirecionamento para `/login`
4. Tente acessar uma página protegida

**✅ Sucesso se**:
- Logout realizado
- Redirecionamento para login
- Não consegue acessar páginas protegidas

---

### 1.6 ✅ Recuperação de Senha
**URL**: http://localhost:3000/forgot-password

**Passos**:
1. Digite email: `admin@quayer.com`
2. Clique em "Enviar link de recuperação"
3. Verifique console para o link
4. Acesse o link de reset
5. Digite nova senha

**✅ Sucesso se**: Link gerado e senha resetada

---

### 1.7 ✅ Verificação de Email
**URL**: http://localhost:3000/verify-email

**Passos**:
1. Acesse com token de verificação
2. Verifique que email foi marcado como verificado

---

### 1.8 ✅ Onboarding de Novo Usuário
**URL**: http://localhost:3000/onboarding

**Passos**:
1. Após signup, você deve ser redirecionado automaticamente
2. Preencha informações da organização:
   - Nome da organização: "Minha Empresa"
   - Telefone: (11) 99999-9999
3. Configure horários de atendimento
4. Clique em "Concluir"

**✅ Sucesso se**:
- Onboarding completo
- Organização criada
- Redirecionamento para dashboard

---

### 1.9 ✅ Proteção de Rotas
**Passos**:
1. Faça logout
2. Tente acessar: http://localhost:3000/admin
3. Deve redirecionar para `/login`

**✅ Sucesso se**: Rotas protegidas funcionam

---

### 1.10 ✅ Refresh Token
**Passos**:
1. Faça login
2. Abra DevTools → Application → Local Storage
3. Verifique que `refreshToken` está armazenado
4. Aguarde expiração do accessToken (15min)
5. Faça uma ação que requer autenticação
6. Token deve ser renovado automaticamente

**✅ Sucesso se**: Sessão mantida após expiração

---

## CATEGORIA 2: ADMIN (8 testes)

### 2.1 ✅ Dashboard Admin
**URL**: http://localhost:3000/admin

**Passos**:
1. Faça login como admin
2. Verifique métricas gerais:
   - Total de organizações
   - Total de usuários
   - Total de instâncias
3. Verifique gráficos carregando

**✅ Sucesso se**:
- Dashboard carrega
- Métricas aparecem
- Gráficos renderizam

---

### 2.2 ✅ Gerenciar Organizações
**URL**: http://localhost:3000/admin/organizations

**Passos**:
1. Veja lista de organizações
2. Clique em "Nova Organização"
3. Preencha dados
4. Salve
5. Edite uma organização existente
6. Delete uma organização (se permitido)

**✅ Sucesso se**: CRUD completo funciona

---

### 2.3 ✅ Gerenciar Instâncias (Admin)
**URL**: http://localhost:3000/admin/integracoes

**Passos**:
1. Veja todas as instâncias de todas as organizações
2. Filtre por organização
3. Filtre por status
4. Veja detalhes de uma instância
5. Desconecte uma instância (se permitido)

**✅ Sucesso se**:
- Lista todas instâncias
- Filtros funcionam
- Ações administrativas funcionam

---

### 2.4 ✅ Logs do Sistema
**URL**: http://localhost:3000/admin/logs

**Passos**:
1. Veja logs de sistema
2. Filtre por nível (info, error, warn)
3. Filtre por data
4. Busque por texto

**✅ Sucesso se**:
- Logs aparecem
- Filtros funcionam
- Busca funciona

---

### 2.5 ✅ Webhooks Admin
**URL**: http://localhost:3000/admin/webhooks

**Passos**:
1. Veja webhooks de todas organizações
2. Crie webhook global
3. Teste webhook
4. Veja histórico de entregas

**✅ Sucesso se**: Gerenciamento global funciona

---

### 2.6 ✅ Permissões
**URL**: http://localhost:3000/admin/permissions

**Passos**:
1. Veja matriz de permissões
2. Edite permissões por role
3. Salve alterações

**✅ Sucesso se**: Permissões atualizadas

---

### 2.7 ✅ Clientes (Admin)
**URL**: http://localhost:3000/admin/clients

**Passos**:
1. Veja lista de todos os clientes/contatos
2. Filtre por organização
3. Exporte lista
4. Veja detalhes de um cliente

**✅ Sucesso se**: Visão global funciona

---

### 2.8 ✅ Brokers
**URL**: http://localhost:3000/admin/brokers

**Passos**:
1. Veja status dos brokers UAZapi
2. Verifique health checks
3. Reinicie broker (se disponível)

**✅ Sucesso se**: Monitoramento funciona

---

## CATEGORIA 3: INTEGRAÇÕES (7 testes)

### 3.1 ✅ Dashboard Integrações
**URL**: http://localhost:3000/integracoes

**Passos**:
1. Faça login como master/manager
2. Veja resumo de instâncias:
   - Total conectadas
   - Total desconectadas
   - Mensagens enviadas hoje
3. Veja gráficos de atividade

**✅ Sucesso se**:
- Dashboard carrega
- Métricas corretas
- Gráficos aparecem

---

### 3.2 ✅ Criar Nova Instância
**URL**: http://localhost:3000/integracoes

**Passos**:
1. Clique em "Nova Instância"
2. Preencha:
   - Nome: "WhatsApp Vendas"
   - Descrição: "Atendimento de vendas"
3. Clique em "Criar"
4. Aguarde QR Code aparecer
5. Escaneie QR Code com WhatsApp
6. Aguarde status mudar para "Conectado"

**✅ Sucesso se**:
- Instância criada
- QR Code gerado
- Conexão estabelecida

**⚠️ Nota**: Requer UAZapi configurado

---

### 3.3 ✅ Detalhes da Instância
**Passos**:
1. Clique em uma instância
2. Veja informações:
   - Status
   - Número conectado
   - Nome do perfil
   - Última atividade
3. Veja tabs:
   - Configurações
   - Webhooks
   - Logs

**✅ Sucesso se**: Todas informações aparecem

---

### 3.4 ✅ Desconectar/Reconectar
**Passos**:
1. Clique em "Desconectar" na instância
2. Confirme desconexão
3. Verifique status muda para "Desconectado"
4. Clique em "Reconectar"
5. Novo QR Code deve aparecer

**✅ Sucesso se**:
- Desconexão funciona
- Reconexão disponível

---

### 3.5 ✅ Deletar Instância
**Passos**:
1. Clique em ⋮ (menu) → "Deletar"
2. Confirme deleção
3. Instância deve ser removida da lista

**✅ Sucesso se**:
- Confirmação aparece
- Instância deletada
- Lista atualiza

---

### 3.6 ✅ Compartilhar Sessão
**URL**: http://localhost:3000/integracoes/compartilhar

**Passos**:
1. Clique em "Compartilhar" em uma instância
2. Copie link gerado
3. Abra em aba anônima
4. Verifique que consegue ver conversas (read-only)

**✅ Sucesso se**:
- Link gerado
- Acesso público funciona
- Apenas leitura

---

### 3.7 ✅ Configurações da Instância
**Passos**:
1. Entre em detalhes da instância
2. Vá para tab "Configurações"
3. Configure:
   - Webhook URL
   - Eventos para escutar
   - Timeout
   - Retry policy
4. Salve alterações

**✅ Sucesso se**: Configurações salvas

---

## CATEGORIA 4: CRM (4 testes)

### 4.1 ✅ Lista de Contatos
**URL**: http://localhost:3000/crm/contatos

**Passos**:
1. Veja lista de contatos
2. Use busca para filtrar
3. Filtre por tags/labels
4. Ordene por nome/data
5. Clique em um contato

**✅ Sucesso se**:
- Lista carrega
- Busca funciona
- Filtros funcionam

---

### 4.2 ✅ Detalhes do Contato
**URL**: http://localhost:3000/crm/contatos/[id]

**Passos**:
1. Veja informações do contato:
   - Nome
   - Telefone
   - Email
   - Tags
   - Observações
2. Edite informações
3. Adicione tags
4. Adicione observação
5. Veja histórico de conversas

**✅ Sucesso se**:
- Detalhes aparecem
- Edição funciona
- Histórico carrega

---

### 4.3 ✅ Kanban CRM
**URL**: http://localhost:3000/crm/kanban

**Passos**:
1. Veja colunas do kanban:
   - Lead
   - Negociação
   - Fechado
2. Arraste card entre colunas
3. Clique em card para ver detalhes
4. Crie novo card
5. Delete card

**✅ Sucesso se**:
- Drag & drop funciona
- Cards atualizam
- Ações funcionam

---

### 4.4 ✅ Detalhes do Card Kanban
**URL**: http://localhost:3000/crm/kanban/[id]

**Passos**:
1. Clique em card no kanban
2. Veja modal/página com:
   - Cliente
   - Valor
   - Status
   - Observações
3. Edite informações
4. Mova para outra coluna

**✅ Sucesso se**:
- Modal abre
- Edição funciona
- Mudança de coluna funciona

---

## CATEGORIA 5: CONVERSAS (3 testes)

### 5.1 ✅ Lista de Conversas
**URL**: http://localhost:3000/conversas

**Passos**:
1. Veja lista de conversas ativas
2. Filtre por:
   - Não lidas
   - Arquivadas
   - Por atendente
3. Use busca
4. Clique em uma conversa

**✅ Sucesso se**:
- Lista carrega
- Filtros funcionam
- Busca funciona

---

### 5.2 ✅ Chat em Tempo Real
**URL**: http://localhost:3000/conversas/[sessionId]

**Passos**:
1. Abra uma conversa
2. Veja histórico de mensagens
3. Digite mensagem de teste
4. Envie
5. Aguarde confirmação de envio
6. Envie imagem/arquivo
7. Use emojis
8. Use respostas rápidas (se disponível)

**✅ Sucesso se**:
- Mensagens carregam
- Envio funciona
- Mídia funciona
- Interface responsiva

---

### 5.3 ✅ Ações na Conversa
**Passos**:
1. Durante conversa, teste:
   - Transferir para outro atendente
   - Adicionar tags
   - Arquivar conversa
   - Marcar como não lida
   - Criar observação
   - Ver informações do contato

**✅ Sucesso se**: Todas ações funcionam

---

## CATEGORIA 6: CONFIGURAÇÕES (4 testes)

### 6.1 ✅ Tabulações
**URL**: http://localhost:3000/configuracoes/tabulacoes

**Passos**:
1. Veja lista de tabulações
2. Crie nova tabulação:
   - Nome: "Vendas"
   - Cor: Verde
3. Edite tabulação
4. Delete tabulação

**✅ Sucesso se**: CRUD completo funciona

---

### 6.2 ✅ Labels/Tags
**URL**: http://localhost:3000/configuracoes/labels

**Passos**:
1. Veja labels existentes
2. Crie nova label:
   - Nome: "Urgente"
   - Cor: Vermelho
3. Edite label
4. Delete label

**✅ Sucesso se**: CRUD completo funciona

---

### 6.3 ✅ Departamentos
**URL**: http://localhost:3000/configuracoes/departamentos

**Passos**:
1. Veja departamentos
2. Crie departamento:
   - Nome: "Suporte"
   - Atendentes: Selecione usuários
3. Edite departamento
4. Delete departamento

**✅ Sucesso se**: CRUD completo funciona

---

### 6.4 ✅ Webhooks
**URL**: http://localhost:3000/configuracoes/webhooks

**Passos**:
1. Veja webhooks configurados
2. Crie webhook:
   - URL: https://webhook.site/{id}
   - Eventos: message.received
   - Secret: abc123
3. Teste webhook
4. Veja histórico de entregas
5. Veja payload de exemplo

**✅ Sucesso se**:
- Webhook criado
- Teste enviado
- Histórico aparece

---

## CATEGORIA 7: USUÁRIOS (2 testes)

### 7.1 ✅ Dashboard do Usuário
**URL**: http://localhost:3000/user/dashboard

**Passos**:
1. Faça login como user (agent)
2. Veja métricas pessoais:
   - Conversas atendidas hoje
   - Tempo médio de resposta
   - Satisfação do cliente
3. Veja conversas atribuídas

**✅ Sucesso se**: Dashboard carrega

---

### 7.2 ✅ Trocar de Organização
**Passos**:
1. Clique no seletor de organização (topo)
2. Veja organizações que você faz parte
3. Troque para outra organização
4. Verifique que contexto mudou
5. Verifique dados diferentes

**✅ Sucesso se**:
- Troca funciona
- Contexto atualiza
- Dados corretos

---

## CATEGORIA 8: UX/UI (5 testes)

### 8.1 ✅ Responsividade
**Passos**:
1. Abra DevTools (F12)
2. Ative modo responsivo (Ctrl+Shift+M)
3. Teste resoluções:
   - 320px (Mobile S)
   - 375px (Mobile M)
   - 768px (Tablet)
   - 1024px (Desktop)
4. Verifique que layout adapta

**✅ Sucesso se**:
- Sem overflow horizontal
- Elementos reposicionam
- Menu mobile funciona

---

### 8.2 ✅ Tema Claro/Escuro
**Passos**:
1. Clique no botão de tema (lua/sol)
2. Alterne entre temas
3. Verifique que preferência é salva
4. Recarregue página
5. Tema deve persistir

**✅ Sucesso se**:
- Troca instantânea
- Sem flash de conteúdo
- Persiste após reload

---

### 8.3 ✅ Loading States
**Passos**:
1. Em páginas com dados:
2. Recarregue (F5)
3. Verifique skeleton loaders aparecem
4. Aguarde dados carregarem
5. Skeleton deve desaparecer suavemente

**✅ Sucesso se**:
- Skeleton aparece
- Transição suave
- Sem layout shift

---

### 8.4 ✅ Estados de Erro
**Passos**:
1. Simule erro (desligue servidor)
2. Tente fazer uma ação
3. Verifique mensagem de erro clara
4. Verifique botão "Tentar novamente"
5. Reative servidor
6. Clique em "Tentar novamente"

**✅ Sucesso se**:
- Erro exibido claramente
- Recovery funciona
- Não trava aplicação

---

### 8.5 ✅ Acessibilidade
**Passos**:
1. Use navegação por teclado (Tab)
2. Verifique que focus é visível
3. Use Esc para fechar modais
4. Use Enter para confirmar ações
5. Teste com leitor de tela (NVDA/JAWS)

**✅ Sucesso se**:
- Navegação por teclado funciona
- Focus visível
- Shortcuts funcionam
- Semântica HTML correta

---

## CATEGORIA 9: PERFORMANCE (3 testes)

### 9.1 ✅ Tempo de Carregamento
**Passos**:
1. Abra DevTools → Network
2. Recarregue página principal
3. Verifique métricas:
   - First Paint < 1s
   - Time to Interactive < 3s
   - Total Load < 5s

**✅ Sucesso se**: Métricas dentro do esperado

---

### 9.2 ✅ Lighthouse Score
**Passos**:
1. Abra DevTools → Lighthouse
2. Execute audit (Desktop)
3. Verifique scores:
   - Performance > 80
   - Accessibility > 90
   - Best Practices > 80
   - SEO > 80

**✅ Sucesso se**: Scores aceitáveis

---

### 9.3 ✅ Otimização de Imagens
**Passos**:
1. Veja Network ao carregar página com imagens
2. Verifique:
   - Imagens em formato WebP/AVIF
   - Lazy loading funcionando
   - Tamanhos corretos

**✅ Sucesso se**: Otimizações aplicadas

---

## CATEGORIA 10: EDGE CASES (5 testes)

### 10.1 ✅ Sessão Expirada
**Passos**:
1. Faça login
2. Abra DevTools → Application
3. Delete refreshToken do localStorage
4. Tente fazer uma ação
5. Deve redirecionar para login

**✅ Sucesso se**: Tratamento gracioso

---

### 10.2 ✅ Conexão Perdida
**Passos**:
1. Durante uso, desligue WiFi
2. Tente enviar mensagem
3. Deve mostrar indicador "offline"
4. Reative WiFi
5. Mensagem deve ser enviada automaticamente

**✅ Sucesso se**:
- Indicador offline aparece
- Retry automático funciona

---

### 10.3 ✅ Dados Inválidos
**Passos**:
1. Em formulário, digite dados inválidos:
   - Email sem @
   - Telefone com letras
   - Campo vazio obrigatório
2. Tente salvar
3. Deve mostrar erros claros

**✅ Sucesso se**:
- Validação client-side funciona
- Mensagens claras
- Campos marcados em vermelho

---

### 10.4 ✅ Permissões Insuficientes
**Passos**:
1. Faça login como user (agent)
2. Tente acessar: http://localhost:3000/admin
3. Deve ser bloqueado
4. Mensagem de permissão negada

**✅ Sucesso se**:
- Acesso bloqueado
- Mensagem clara
- Não quebra aplicação

---

### 10.5 ✅ Concorrência
**Passos**:
1. Abra mesma conversa em 2 abas
2. Envie mensagem na aba 1
3. Verifique que aparece na aba 2 (real-time)
4. Edite contato na aba 1
5. Verifique atualização na aba 2

**✅ Sucesso se**:
- Real-time funciona
- Dados sincronizados
- Sem conflitos

---

## 📊 FORMATO DE FEEDBACK

### Para Cada Teste, Me Informe:

```
TESTE: [Número e Nome]
STATUS: ✅ PASSOU | ❌ FALHOU | ⚠️ PARCIAL
OBSERVAÇÕES: [O que funcionou ou não funcionou]
ERROS: [Se houver, cole mensagem de erro ou screenshot]
CONSOLE: [Erros no console do browser?]
```

### Exemplo:
```
TESTE: 1.1 Login Passwordless com OTP
STATUS: ✅ PASSOU
OBSERVAÇÕES: Login funcionou perfeitamente, redirecionamento correto
ERROS: Nenhum
CONSOLE: Limpo

TESTE: 3.2 Criar Nova Instância
STATUS: ❌ FALHOU
OBSERVAÇÕES: QR Code não apareceu após criar instância
ERROS: "Error: UAZapi service unavailable"
CONSOLE: Erro 500 em /api/v1/instances/connect
```

---

## 🎯 PRIORIDADE DE TESTES

### CRÍTICO (Teste Primeiro) 🔴
- 1.1 Login Passwordless
- 1.2 Signup
- 3.1 Dashboard Integrações
- 5.2 Chat em Tempo Real

### ALTA (Teste Depois) 🟡
- 2.1 Dashboard Admin
- 3.2 Criar Instância
- 4.1 Lista de Contatos
- 6.1-6.4 Configurações

### MÉDIA (Se Tiver Tempo) 🟢
- 8.1-8.5 UX/UI
- 9.1-9.3 Performance
- 10.1-10.5 Edge Cases

---

## 🚀 COMEÇE AQUI

1. ✅ Verifique que servidor está rodando: http://localhost:3000
2. ✅ Faça primeiro teste: **1.1 Login Passwordless**
3. ✅ Me envie feedback de cada teste conforme avança
4. ✅ Priorize testes CRÍTICOS primeiro

**Estou aguardando seu feedback para cada teste! 🎯**
