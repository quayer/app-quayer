# 🛠️ Ferramentas do Claude Code - Guia Completo

**Atualizado:** 18 de outubro de 2025
**Versão Claude Code:** 2.0.22

---

## 📚 Índice

1. [Ferramentas Nativas (Built-in)](#ferramentas-nativas)
2. [Ferramentas MCP (Model Context Protocol)](#ferramentas-mcp)
3. [Claude Skills](#claude-skills)
4. [Hooks e Customização](#hooks-e-customização)
5. [Comandos de Slash](#comandos-de-slash)
6. [Agentes e Subagentes](#agentes-e-subagentes)

---

## 🔧 Ferramentas Nativas (Built-in)

O Claude Code vem com um conjunto robusto de ferramentas integradas:

### 📁 Manipulação de Arquivos

| Ferramenta | Descrição | Exemplo |
|------------|-----------|---------|
| **Read** | Ler conteúdo de arquivos | `Read src/app.ts` |
| **Write** | Criar ou sobrescrever arquivos | `Write new-file.ts` |
| **Edit** | Editar arquivos existentes (substituição precisa) | `Edit src/config.ts` |
| **Glob** | Buscar arquivos por padrão | `Glob **/*.tsx` |
| **Grep** | Buscar conteúdo em arquivos (ripgrep) | `Grep "function.*export"` |

### 💻 Execução de Comandos

| Ferramenta | Descrição | Exemplo |
|------------|-----------|---------|
| **Bash** | Executar comandos shell | `Bash npm install` |
| **BashOutput** | Ler saída de comandos em background | `BashOutput <shell_id>` |
| **KillShell** | Terminar shell em background | `KillShell <shell_id>` |

### 📝 Gestão de Tarefas

| Ferramenta | Descrição | Exemplo |
|------------|-----------|---------|
| **TodoWrite** | Gerenciar lista de tarefas | Criar, atualizar status de todos |
| **Task** | Delegar tarefas a subagentes especializados | `Task subagent_type=Explore` |

### 🌐 Web e Rede

| Ferramenta | Descrição | Exemplo |
|------------|-----------|---------|
| **WebFetch** | Buscar e processar conteúdo de URLs | `WebFetch https://example.com` |
| **WebSearch** | Pesquisar na web (disponível nos EUA) | `WebSearch "Next.js 15 features"` |

### 🔍 Navegação e Exploração

| Ferramenta | Descrição | Exemplo |
|------------|-----------|---------|
| **Skill** | Executar skills especializadas | `Skill command="pdf"` |
| **SlashCommand** | Executar comandos de barra customizados | `SlashCommand /review-pr 123` |

---

## 🔌 Ferramentas MCP (Model Context Protocol)

O Claude Code suporta **Model Context Protocol (MCP)** - um protocolo aberto que permite adicionar ferramentas customizadas.

### O que é MCP?

MCP permite que Claude Code se conecte a servidores externos que fornecem:
- **Tools (Ferramentas):** Operações que Claude pode executar
- **Resources (Recursos):** Dados que Claude pode acessar
- **Prompts:** Templates pré-configurados

### Como Adicionar Servidores MCP

```bash
# Adicionar servidor MCP local
claude mcp add <nome> <comando>

# Exemplo: Servidor filesystem
claude mcp add filesystem npx @modelcontextprotocol/server-filesystem /path/to/dir

# Listar servidores configurados
claude mcp list

# Remover servidor
claude mcp remove <nome>
```

### Servidores MCP Populares

| Servidor | Descrição | Instalação |
|----------|-----------|------------|
| **filesystem** | Acesso seguro ao sistema de arquivos | `npx @modelcontextprotocol/server-filesystem` |
| **github** | Integração com GitHub API | `npx @modelcontextprotocol/server-github` |
| **postgres** | Consultas PostgreSQL | `npx @modelcontextprotocol/server-postgres` |
| **sqlite** | Consultas SQLite | `npx @modelcontextprotocol/server-sqlite` |
| **puppeteer** | Automação de navegador | `npx @modelcontextprotocol/server-puppeteer` |
| **brave-search** | Busca com Brave Search API | `npx @modelcontextprotocol/server-brave-search` |

### Marketplace MCP

Explore servidores oficiais em:
- **GitHub:** https://github.com/modelcontextprotocol/servers
- **Documentação:** https://modelcontextprotocol.io/

### Configuração Manual (`.claude.json`)

```json
{
  "mcpServers": {
    "local": {
      "meu-servidor": {
        "type": "stdio",
        "command": "npx",
        "args": ["@meu-pacote/mcp-server"],
        "env": {
          "API_KEY": "${MCP_API_KEY}"
        }
      }
    }
  }
}
```

---

## 🎓 Claude Skills

**Claude Skills** são capacidades especializadas que podem ser adicionadas ao Claude Code através do **Plugin System**.

### O que são Skills?

Skills são módulos pré-construídos que adicionam funcionalidades específicas:
- Processamento de PDFs
- Manipulação de planilhas (xlsx)
- Análise de imagens
- E muito mais

### Como Usar Skills

```bash
# Listar skills disponíveis
/plugin marketplace

# Instalar um plugin com skills
/plugin install <plugin-url>

# Ativar skill
/plugin enable <plugin-name>

# Invocar skill
Skill command="pdf"
Skill command="xlsx"
```

### Skills Disponíveis (Exemplo)

| Skill | Descrição | Uso |
|-------|-----------|-----|
| **pdf** | Processar e extrair texto de PDFs | `Skill command="pdf"` |
| **xlsx** | Ler e manipular planilhas Excel | `Skill command="xlsx"` |
| **image-analysis** | Análise avançada de imagens | `Skill command="image-analysis"` |

**Nota:** A disponibilidade de skills depende dos plugins instalados no seu sistema.

---

## 🪝 Hooks e Customização

Hooks permitem executar scripts customizados em resposta a eventos do Claude Code.

### Tipos de Hooks Disponíveis

| Hook | Quando Dispara | Uso |
|------|----------------|-----|
| **SessionStart** | Início de nova sessão | Configuração inicial, validações |
| **SessionEnd** | Fim de sessão | Cleanup, logging |
| **UserPromptSubmit** | Após envio de prompt | Validação, contexto adicional |
| **PreToolUse** | Antes de usar ferramenta | Modificar inputs, validação |
| **PostToolUse** | Após uso de ferramenta | Logging, pós-processamento |
| **PreCompact** | Antes de compactar conversa | Salvar contexto importante |
| **Stop** | Quando conversa para | Relatórios, análises |
| **SubagentStop** | Quando subagente termina | Validação de resultados |

### Configurar Hooks (`.claude/settings.json`)

```json
{
  "hooks": {
    "SessionStart": {
      "command": "echo 'Session started at $(date)'",
      "enabled": true
    },
    "PostToolUse": {
      "command": "./scripts/log-tool-use.sh",
      "enabled": true,
      "timeout": 5000
    }
  }
}
```

### Variáveis de Ambiente nos Hooks

- `CLAUDE_PROJECT_DIR` - Diretório do projeto
- `CLAUDE_HOOK_EVENT` - Nome do evento hook

---

## ⚡ Comandos de Slash

Comandos customizados criados em `.claude/commands/`.

### Comandos Built-in

| Comando | Descrição |
|---------|-----------|
| `/help` | Ajuda geral |
| `/model` | Trocar modelo (Sonnet, Opus, Haiku) |
| `/clear` | Limpar conversa |
| `/resume` | Retomar conversa anterior |
| `/continue` | Continuar última conversa |
| `/export` | Exportar conversa |
| `/mcp` | Gerenciar servidores MCP |
| `/permissions` | Gerenciar permissões |
| `/config` | Configurações |
| `/status` | Status do sistema |
| `/doctor` | Diagnóstico de problemas |
| `/upgrade` | Upgrade para Claude Max |

### Criar Comandos Customizados

Crie arquivos `.md` em `.claude/commands/`:

**`.claude/commands/review-pr.md`:**
```markdown
---
description: Revisa um Pull Request do GitHub
argument-hint: <PR number>
---

Revise o Pull Request #{{arg1}} do repositório atual.
Analise:
- Qualidade do código
- Testes adequados
- Documentação
- Breaking changes
```

**Uso:**
```bash
/review-pr 123
```

---

## 🤖 Agentes e Subagentes

Claude Code suporta delegação de tarefas para agentes especializados.

### Agentes Built-in

| Agente | Descrição | Quando Usar |
|--------|-----------|-------------|
| **general-purpose** | Agente geral para tarefas complexas | Pesquisa, multi-step tasks |
| **Explore** | Especializado em exploração de código | Buscar padrões, entender estrutura |
| **code-reviewer** | Revisar código | Após implementações significativas |
| **test-runner** | Executar testes | Validação de código |

### Usar Subagentes

```typescript
// Via Task tool
Task {
  subagent_type: "Explore",
  description: "Find authentication implementation",
  prompt: "Locate all files related to user authentication..."
}
```

### Criar Agentes Customizados

Crie arquivos em `.claude/agents/`:

**`.claude/agents/api-tester.md`:**
```markdown
---
name: API Tester
model: sonnet
---

You are an expert API testing agent. Your role is to:
- Test all endpoints thoroughly
- Validate response schemas
- Check error handling
- Verify authentication
```

**Uso:**
```bash
@api-tester Test the user authentication endpoints
```

---

## 📊 Comparação de Ferramentas

### Quando Usar Cada Ferramenta?

| Necessidade | Ferramenta Recomendada | Alternativa |
|-------------|------------------------|-------------|
| Ler arquivo específico | `Read` | `Bash cat` |
| Buscar arquivos por nome | `Glob` | `Bash find` |
| Buscar texto em arquivos | `Grep` | `Bash grep` |
| Editar arquivo | `Edit` | `Write` |
| Executar comando | `Bash` | - |
| Buscar na web | `WebSearch` | `WebFetch` |
| Processar URL | `WebFetch` | - |
| Gerenciar tarefas | `TodoWrite` | - |
| Delegar trabalho | `Task` | Agentes |
| Explorar código | Task (Explore) | `Grep` + `Read` |

---

## 🔐 Permissões e Segurança

### Configurar Permissões

**`.claude/settings.json`:**
```json
{
  "allowedTools": [
    "Read(*)",
    "Bash(npm:*)",
    "Bash(git:*)",
    "Grep(*)"
  ],
  "disallowedTools": [
    "Bash(rm -rf:*)",
    "Bash(sudo:*)"
  ]
}
```

### Escopo de Permissões

- `*` - Qualquer valor
- `Bash(npm:*)` - npm com qualquer argumento
- `Read(src/**/*.ts)` - Apenas arquivos .ts em src/
- `Write(/tmp/*)` - Apenas em /tmp/

---

## 🚀 Dicas de Uso

### Performance

1. **Use Explore para buscas complexas:**
   ```typescript
   Task {
     subagent_type: "Explore",
     thoroughness: "very thorough"
   }
   ```

2. **Prefira ferramentas nativas:**
   - `Read` é mais rápido que `Bash cat`
   - `Grep` é otimizado para busca

3. **Background para comandos longos:**
   ```bash
   Bash(npm run dev, run_in_background=true)
   ```

### Organização

1. **Use TodoWrite para tarefas complexas**
2. **Crie slash commands para workflows repetitivos**
3. **Configure hooks para automação**
4. **Use agentes para especialização**

---

## 📚 Recursos Adicionais

### Documentação Oficial

- **Claude Code Docs:** https://docs.claude.com/en/docs/claude-code
- **MCP Protocol:** https://modelcontextprotocol.io/
- **GitHub Repository:** https://github.com/anthropics/claude-code

### Comunidade

- **GitHub Issues:** https://github.com/anthropics/claude-code/issues
- **Discussions:** https://github.com/anthropics/claude-code/discussions

---

## 🔄 Atualizações Recentes (v2.0.22)

**Novidades:**
- ✅ Suporte a Claude Skills (via plugin system)
- ✅ Agente Explore para busca eficiente
- ✅ Haiku 4.5 disponível
- ✅ Melhorias em hooks e permissões
- ✅ Suporte a MCP `structuredContent`

**Próximas Features:**
- Integração com mais marketplaces
- Skills adicionais
- Melhorias de performance

---

**Mantido por:** Lia AI Agent
**Última atualização:** 18/10/2025
**Status:** ✅ Completo e Atualizado
