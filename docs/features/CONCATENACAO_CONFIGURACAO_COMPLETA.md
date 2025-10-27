# ⚙️ Configuração de Concatenação - Opções Disponíveis

**Data**: 2025-10-16

---

## 🎯 Sua Dúvida

> "Ele concatena toda mensagem, então espera 7 segundos se não receber mais nada daquele mesmo contato ele envia o webhook, independente o formato?"

---

## 📋 Resposta Rápida

**Atualmente**: ❌ NÃO concatena formatos diferentes (configuração padrão)
**Podemos mudar**: ✅ SIM, facilmente via variável de ambiente!

---

## 🔧 Duas Opções de Configuração

### Opção 1: Apenas MESMO TIPO (PADRÃO ATUAL) ⚙️

**Configuração**: `MESSAGE_CONCAT_SAME_TYPE=true` (ou não definir)

**Comportamento**:
```
Cliente envia:
10:05:00 - "Oi" (TEXTO)
10:05:02 - "Tudo bem?" (TEXTO)
10:05:04 - [Áudio] (ÁUDIO)
10:05:06 - "Quanto custa?" (TEXTO)
... 8 segundos sem mensagem ...

Sistema cria 3 mensagens:
1. "[10:05] Oi\n\n[10:05] Tudo bem?" (TEXTO concatenado)
2. "Eu queria fazer um pedido..." (ÁUDIO transcrito - única mensagem)
3. "Quanto custa?" (TEXTO - única mensagem)
```

**Por que separar?**
- ✅ **Melhor organização visual**: Áudio, imagem, texto separados
- ✅ **Contexto preservado**: Cliente enviou áudio entre textos por um motivo
- ✅ **UX tradicional**: Comportamento esperado em apps de mensagem

---

### Opção 2: TODOS OS FORMATOS JUNTOS ✅

**Configuração**: `MESSAGE_CONCAT_SAME_TYPE=false`

**Comportamento**:
```
Cliente envia:
10:05:00 - "Oi" (TEXTO)
10:05:02 - "Tudo bem?" (TEXTO)
10:05:04 - [Áudio: "Eu queria fazer um pedido"] (ÁUDIO)
10:05:06 - "Quanto custa?" (TEXTO)
10:05:08 - [Imagem: "Nota fiscal R$ 1.500"] (IMAGEM)
... 8 segundos sem mensagem ...

Sistema cria 1 ÚNICA mensagem:
"[10:05] Oi

[10:05] Tudo bem?

[10:05] Eu queria fazer um pedido

[10:05] Quanto custa?

[10:05] A imagem mostra uma nota fiscal da empresa ABC. Valor total: R$ 1.500,00"
```

**Vantagens**:
- ✅ **1 webhook** ao invés de múltiplos
- ✅ **Contexto completo** em uma mensagem
- ✅ **Menos notificações** para atendente
- ✅ **IA consegue analisar contexto completo** em uma conversa

**Desvantagens**:
- ⚠️ **Menos visual**: Perde separação natural de tipos
- ⚠️ **Pode ficar longo**: 10 mensagens de tipos diferentes = texto muito grande

---

## 🚀 Como Configurar

### Arquivo `.env`

```bash
# ============================================
# MESSAGE CONCATENATION CONFIG
# ============================================

# Timeout entre mensagens (milissegundos)
MESSAGE_CONCAT_TIMEOUT=8000  # 8 segundos (padrão: 6000)

# Máximo de mensagens por bloco
MESSAGE_CONCAT_MAX=10  # 10 mensagens (padrão: 10)

# Apenas mesmo remetente? (sempre true, não alterar)
MESSAGE_CONCAT_SAME_SENDER=true

# ⚡ OPÇÃO CRÍTICA: Apenas mesmo tipo?
# true  = Separa texto, áudio, imagem (PADRÃO ATUAL)
# false = Concatena TUDO junto (INDEPENDENTE do formato)
MESSAGE_CONCAT_SAME_TYPE=false  # ← MUDAR AQUI!
```

---

## 📊 Comparação Detalhada

### Cenário: Cliente envia 5 mensagens em 10 segundos

```
10:05:00 - "Oi"                    (texto)
10:05:02 - "Olha isso"             (texto)
10:05:04 - [Áudio 10s]             (áudio)
10:05:06 - [Imagem nota fiscal]    (imagem)
10:05:08 - "Confirma o pedido?"    (texto)
... 8 segundos de silêncio ...
```

### Com `MESSAGE_CONCAT_SAME_TYPE=true` (Padrão)

**Mensagens criadas**: 4

```json
[
  {
    "id": "msg-1",
    "type": "concatenated",
    "content": "[10:05] Oi\n\n[10:05] Olha isso",
    "metadata": {
      "concatenated": true,
      "originalMessagesCount": 2
    }
  },
  {
    "id": "msg-2",
    "type": "audio",
    "content": "Eu queria fazer um pedido de 10 unidades do produto X",
    "metadata": {
      "transcribed": true,
      "provider": "openai-whisper"
    }
  },
  {
    "id": "msg-3",
    "type": "image",
    "content": "A imagem mostra uma nota fiscal da empresa ABC Ltda. Produto: Notebook. Quantidade: 10 unidades. Valor total: R$ 15.000,00",
    "metadata": {
      "ocr": true,
      "provider": "openai-vision"
    }
  },
  {
    "id": "msg-4",
    "type": "text",
    "content": "Confirma o pedido?",
    "metadata": {}
  }
]
```

**Webhooks enviados**: 4 webhooks

---

### Com `MESSAGE_CONCAT_SAME_TYPE=false` ✅

**Mensagens criadas**: 1

```json
[
  {
    "id": "msg-1",
    "type": "concatenated",
    "content": "[10:05] Oi\n\n[10:05] Olha isso\n\n[10:05] Eu queria fazer um pedido de 10 unidades do produto X\n\n[10:05] A imagem mostra uma nota fiscal da empresa ABC Ltda. Produto: Notebook. Quantidade: 10 unidades. Valor total: R$ 15.000,00\n\n[10:05] Confirma o pedido?",
    "metadata": {
      "concatenated": true,
      "originalMessagesCount": 5,
      "mixedTypes": true,
      "types": ["text", "text", "audio", "image", "text"]
    }
  }
]
```

**Webhooks enviados**: 1 webhook

**Redução**: 4 webhooks → 1 webhook (75% menos!)

---

## 💡 Recomendação

### Para Atendimento Humano
**Use**: `MESSAGE_CONCAT_SAME_TYPE=true` (padrão)

**Por que?**
- ✅ Atendente vê separação natural de tipos
- ✅ Mais fácil de ler e responder
- ✅ Contexto visual preservado

### Para IA/Automação
**Use**: `MESSAGE_CONCAT_SAME_TYPE=false`

**Por que?**
- ✅ IA analisa contexto completo de uma vez
- ✅ Menos requisições HTTP
- ✅ Redução de custos de webhook
- ✅ Chatbot processa tudo junto

---

## 🔄 Fluxo Técnico Completo

### Com `MESSAGE_CONCAT_SAME_TYPE=false`

```
1. Cliente envia "Oi" (texto)
   ↓
2. Webhook Receiver:
   - shouldConcatenate() → false (primeira mensagem)
   - addToBlock() → Cria bloco no Redis
   - Timer: 8 segundos
   ↓
3. Cliente envia "Olha isso" (texto)
   ↓
4. Webhook Receiver:
   - shouldConcatenate() → true (dentro de 8s, qualquer tipo!)
   - addToBlock() → Adiciona ao bloco
   - Timer resetado: 8 segundos
   ↓
5. Cliente envia [Áudio]
   ↓
6. Webhook Receiver:
   - Processa áudio com OpenAI → "Eu queria fazer um pedido..."
   - shouldConcatenate() → true (dentro de 8s, qualquer tipo!)
   - addToBlock() → Adiciona ao bloco
   - Timer resetado: 8 segundos
   ↓
7. Cliente envia [Imagem]
   ↓
8. Webhook Receiver:
   - Processa imagem com OpenAI → "Nota fiscal R$ 15.000"
   - shouldConcatenate() → true
   - addToBlock() → Adiciona ao bloco
   - Timer resetado: 8 segundos
   ↓
9. Cliente envia "Confirma?"
   ↓
10. Webhook Receiver:
   - shouldConcatenate() → true
   - addToBlock() → Adiciona ao bloco (5 msgs total)
   - Timer resetado: 8 segundos
   ↓
11. ... 8 segundos de silêncio ...
   ↓
12. Timer expira → finalizeBlock()
   ↓
13. Cria 1 mensagem concatenada com TODAS as 5 mensagens
   ↓
14. Deleta bloco do Redis
   ↓
15. Envia 1 webhook para cliente ✅
```

---

## 🎯 Código Responsável

**Arquivo**: `src/lib/concatenation/message-concatenator.service.ts`

### Trecho Crítico (linhas 96-104)

```typescript
// Verificar se é o mesmo tipo (se configurado)
if (this.config.sameTypeOnly) {  // ← Lê do env
  const lastType = block.messages[block.messages.length - 1].type;
  if (lastType !== params.messageType) {
    // Tipo diferente → Finalizar e começar novo
    await this.finalizeBlock(blockKey, block);
    return { shouldConcat: false };
  }
}

// ✅ Pode concatenar!
return {
  shouldConcat: true,
  blockId: blockKey,
};
```

### Configuração (linhas 52-57)

```typescript
constructor() {
  this.config = {
    timeoutMs: parseInt(process.env.MESSAGE_CONCAT_TIMEOUT || '6000', 10),
    maxMessages: parseInt(process.env.MESSAGE_CONCAT_MAX || '10', 10),
    sameSenderOnly: process.env.MESSAGE_CONCAT_SAME_SENDER !== 'false',
    sameTypeOnly: process.env.MESSAGE_CONCAT_SAME_TYPE !== 'false', // ← AQUI!
  };
}
```

---

## ✅ Resumo Final

### Pergunta Original
> "Concatena toda mensagem independente do formato?"

### Resposta
**Por padrão**: ❌ NÃO (apenas mesmo tipo)
**Configurável**: ✅ SIM (basta definir `MESSAGE_CONCAT_SAME_TYPE=false`)

### Como Ativar Concatenação TOTAL

**Arquivo `.env`**:
```bash
MESSAGE_CONCAT_SAME_TYPE=false  # ← Adicionar esta linha
```

**Restart do servidor**:
```bash
npm run dev
```

**Resultado**:
- ✅ TODAS as mensagens concatenadas (texto, áudio, imagem, vídeo, documento)
- ✅ Espera 8 segundos sem mensagem
- ✅ Envia 1 webhook com tudo junto
- ✅ Independente do formato! 🎉

---

## 🎯 Qual Usar?

| Caso de Uso | Configuração Recomendada |
|-------------|--------------------------|
| **Atendimento humano** | `MESSAGE_CONCAT_SAME_TYPE=true` (padrão) |
| **Chatbot/IA** | `MESSAGE_CONCAT_SAME_TYPE=false` |
| **Híbrido** | `MESSAGE_CONCAT_SAME_TYPE=true` (padrão é mais seguro) |
| **Reduzir webhooks ao máximo** | `MESSAGE_CONCAT_SAME_TYPE=false` |
| **Melhor UX visual** | `MESSAGE_CONCAT_SAME_TYPE=true` |

---

**Autor**: Lia AI Agent
**Data**: 2025-10-16
**Status**: ✅ Documentado e Pronto para Uso
