# 🧪 Guia Rápido - Testes Manuais

## 📧 E-mails para Teste

Use estes e-mails reais para validação:
- `gabrielrizzatto@hotmail.com`
- `mart.gabrielrizzatto@gmail.com`
- `contato.gabrielrizzatto@gmail.com`

---

## 🚀 Como Testar

### 1. Preparação do Ambiente

```bash
# Garantir que servidor está rodando
npm run dev

# Em outro terminal, verificar PostgreSQL
# Porta: 5432
# Database: docker
```

### 2. Fluxo de Teste - Novo Usuário

#### Passo 1: Criar Conta
1. Acessar: `http://localhost:3000/signup`
2. Preencher nome e e-mail
3. Clicar em "Continuar com Email"
4. **Verificar logs**: E-mail deve ser enviado
5. Copiar código de 6 dígitos do terminal/e-mail
6. Inserir código na tela de verificação
7. **Validar**: Organização criada automaticamente
8. **Validar**: Usuário redirecionado para dashboard

#### Passo 2: Explorar Dashboard Usuário
1. Verificar métricas (devem estar em 0)
2. Clicar em "Nova Integração"
3. **Validar**: Modal abre com Step 1/5
4. **Validar**: Progress bar visível
5. **Validar**: Card WhatsApp Business destacado

#### Passo 3: Criar Primeira Integração
1. Clicar no card WhatsApp Business
2. Clicar em "Próximo"
3. **Step 2**: Preencher nome e descrição
4. Clicar em "Próximo"
5. **Step 3**: Aguardar criação
6. **Validar**: QR code gerado
7. **Step 4**: Copiar link de compartilhamento
8. **Validar**: Link copiado com sucesso
9. **Step 5**: Ver mensagem de sucesso
10. **Validar**: Redirecionado para lista de integrações

---

### 3. Fluxo de Teste - Admin

#### Passo 1: Login como Admin
1. Acessar: `http://localhost:3000/login`
2. Usar: `admin@quayer.com` (ou criar primeiro admin)
3. Inserir código do e-mail
4. **Validar**: Redirecionado para `/admin`

#### Passo 2: Validar Sidebar Admin
- [ ] Ver menu "Administração" expandido
- [ ] Itens: Dashboard, Organizações, Clientes, Integrações, Webhooks, Brokers, Logs, Permissões
- [ ] Clicar em cada item
- [ ] **Validar**: Página carrega sem erros
- [ ] **Validar**: Item ativo destacado

#### Passo 3: Dashboard Admin
- [ ] Ver métricas globais
- [ ] **Validar**: Dados reais do banco
- [ ] Testar filtros de período
- [ ] Ver gráficos de uso

#### Passo 4: Organizações
- [ ] Listar organizações
- [ ] **Validar**: Mostrar org do primeiro usuário
- [ ] Clicar em "Nova Organização"
- [ ] Preencher formulário
- [ ] **Validar**: Organização criada
- [ ] Editar organização
- [ ] **Validar**: Dados salvos
- [ ] Deletar organização teste
- [ ] **Validar**: Soft delete funcional

#### Passo 5: Clientes
- [ ] Listar todos os usuários
- [ ] Filtrar por status
- [ ] Pesquisar por nome/email
- [ ] **Validar**: Dados reais exibidos

#### Passo 6: Integrações Admin
- [ ] Ver todas as instâncias (todas orgs)
- [ ] Filtrar por organização
- [ ] Filtrar por status
- [ ] **Validar**: Permissões admin funcionais

#### Passo 7: Webhooks
- [ ] Listar webhooks
- [ ] Criar novo webhook
- [ ] Testar webhook (send test event)
- [ ] Ver histórico de deliveries
- [ ] **Validar**: Apenas admin pode configurar

#### Passo 8: Brokers
- [ ] Ver mensagem de estado vazio
- [ ] **Validar**: UI preparada para dados futuros

#### Passo 9: Logs
- [ ] Listar logs do sistema
- [ ] Filtrar por tipo
- [ ] Filtrar por data
- [ ] **Validar**: Dados reais exibidos

#### Passo 10: Permissões
- [ ] Ver roles do sistema
- [ ] Ver roles de organização
- [ ] Ver todas as permissões
- [ ] **Validar**: Documentação clara

---

### 4. Fluxo de Teste - Compartilhamento Público

#### Passo 1: Gerar Link
1. Como usuário logado, acessar `/integracoes`
2. Clicar no menu da integração (três pontos)
3. Clicar em "Compartilhar Link"
4. **Validar**: Toast "Link copiado!"
5. **Validar**: URL no formato `/integracoes/compartilhar/share_...`

#### Passo 2: Acessar Link Público (Sem Login)
1. Abrir navegador anônimo ou logout
2. Acessar URL copiada
3. **Validar**: Página carrega sem necessidade de login
4. **Validar**: QR code grande e visível
5. **Validar**: Timer de expiração funcionando
6. **Validar**: Informações da instância exibidas
7. **Validar**: Nome da organização visível

#### Passo 3: Refresh de QR Code
1. Clicar em "Atualizar QR Code"
2. **Validar**: Novo QR code gerado
3. **Validar**: Timer resetado para 1h
4. **Validar**: Toast de confirmação

#### Passo 4: Testar Expiração
1. Aguardar 1h (ou modificar tempo em dev)
2. Tentar acessar link expirado
3. **Validar**: Mensagem "Link expirado"
4. **Validar**: QR code não é exibido

---

### 5. Fluxo de Teste - Troca de Organização

#### Passo 1: Criar Segunda Organização
1. Login como admin
2. Ir para `/admin/organizations`
3. Clicar em "Nova Organização"
4. Preencher dados da segunda org
5. **Validar**: Organização criada

#### Passo 2: Associar Usuário à Segunda Org
1. Ir para `/admin/clients`
2. Selecionar um usuário
3. Adicionar à segunda organização
4. **Validar**: Usuário associado

#### Passo 3: Alternar Organizações
1. Fazer logout
2. Login como usuário da Step 2
3. Procurar selector de organização
4. Alternar entre organizações
5. **Validar**: Dados isolados por org
6. **Validar**: Instâncias diferentes por org

---

## 📸 Screenshots Esperados

Capturar evidências de:
1. ✅ Signup - tela de verificação
2. ✅ Nova UX - modal Step 1
3. ⏳ Admin dashboard - métricas
4. ⏳ Sidebar admin - menu completo
5. ⏳ Organizações - lista e CRUD
6. ⏳ Integrações - cards e modal completo
7. ⏳ Compartilhamento - página pública
8. ⏳ Troca de org - selector

---

## ⚠️ Issues para Observar

### Durante os Testes

1. **Erro 401**: Requisições fetch sem token
   - **O que fazer**: Ignorar por enquanto, UI funciona
   - **Quando corrigir**: Após validações completas

2. **Console warnings**: BullMQ dependency warnings
   - **O que fazer**: Ignorar, não afeta funcionalidade
   - **Quando corrigir**: Futura otimização

3. **SSE connection errors**: Keep-alive failures
   - **O que fazer**: Ignorar, feature opcional
   - **Quando corrigir**: Implementação de real-time

### Validações Críticas

- ✅ **Todos os dados devem ser reais**
- ✅ **Nenhum mock deve aparecer**
- ✅ **Estados vazios devem ter mensagens adequadas**
- ✅ **Erros devem ser tratados graciosamente**
- ✅ **Loading states devem ser exibidos**

---

## 🎯 Checklist Rápido

### Antes de Cada Teste
- [ ] Servidor rodando (`npm run dev`)
- [ ] PostgreSQL ativo
- [ ] E-mails de teste disponíveis
- [ ] Browser limpo (cache cleared)

### Durante os Testes
- [ ] Capturar screenshots importantes
- [ ] Anotar bugs/melhorias
- [ ] Verificar console do browser
- [ ] Monitorar logs do servidor

### Após Cada Teste
- [ ] Documentar resultados
- [ ] Atualizar TODOs
- [ ] Reportar issues críticos
- [ ] Sugerir melhorias UX

---

## 📝 Template de Relatório de Teste

```markdown
## Teste: [Nome da Funcionalidade]

**Data**: [Data e Hora]
**Testador**: Lia (AI Agent)
**Página**: [URL]

### Resultado
- [ ] ✅ PASSOU
- [ ] ⚠️ PASSOU COM RESSALVAS
- [ ] ❌ FALHOU

### Observações
- [Anotar comportamentos]
- [Issues encontrados]
- [Sugestões de melhoria]

### Screenshots
- [Lista de screenshots capturados]

### Próximos Passos
- [Ações necessárias]
```

---

**Guia atualizado em**: 12 de outubro de 2025, 21:09  
**Status**: Pronto para execução dos testes manuais! ✅

