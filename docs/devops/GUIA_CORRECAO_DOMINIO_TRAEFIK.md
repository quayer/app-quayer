# 🔧 Guia de Correção - Domínio Traefik Easypanel

## ⚠️ Problema Identificado
O domínio `painel.quayer.com` está retornando **404** porque o Traefik ainda está configurado com `panel.quayer.tech`.

---

## 📍 Passo a Passo - Correção Manual

### 1️⃣ Acesse o Servidor via SSH

```bash
ssh root@5.161.177.117
# Senha: bi7xsUMsMJhXpxxNUxaf
```

---

### 2️⃣ Localize o Projeto Quayer

```bash
# Listar todos os projetos
ls -la /etc/easypanel/projects/

# Encontrar o projeto (provavelmente algo como 'quayer' ou ID único)
cd /etc/easypanel/projects/
ls -la
```

---

### 3️⃣ Encontre o Arquivo de Configuração

```bash
# Exemplo (ajuste o nome do projeto)
cd /etc/easypanel/projects/<NOME_DO_PROJETO>/services/<NOME_DO_SERVICO>/

# Ver arquivos
ls -la

# Procurar por app.yaml ou config.yaml
cat app.yaml
```

---

### 4️⃣ Editar Configuração do Domínio

**Procure por estas seções no arquivo `app.yaml`:**

```yaml
domains:
  - name: panel.quayer.tech    # ❌ TROCAR ESTA LINHA
    # OU
  - host: panel.quayer.tech    # ❌ TROCAR ESTA LINHA
```

**Substitua por:**

```yaml
domains:
  - name: painel.quayer.com    # ✅ NOVO DOMÍNIO
    # OU
  - host: painel.quayer.com    # ✅ NOVO DOMÍNIO
```

**Comandos para editar:**

```bash
# Backup do arquivo original
cp app.yaml app.yaml.backup

# Editar com nano
nano app.yaml

# OU editar com sed (automático)
sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' app.yaml

# Verificar mudanças
diff app.yaml.backup app.yaml
```

---

### 5️⃣ Atualizar Variáveis de Ambiente

**Procure seção `env` ou `environment` no `app.yaml`:**

```yaml
env:
  - name: NEXT_PUBLIC_APP_URL
    value: https://panel.quayer.tech    # ❌ TROCAR
  - name: APP_URL
    value: https://panel.quayer.tech    # ❌ TROCAR
  - name: NEXTAUTH_URL
    value: https://panel.quayer.tech    # ❌ TROCAR
```

**Substitua por:**

```yaml
env:
  - name: NEXT_PUBLIC_APP_URL
    value: https://painel.quayer.com    # ✅ NOVO
  - name: APP_URL
    value: https://painel.quayer.com    # ✅ NOVO
  - name: NEXTAUTH_URL
    value: https://painel.quayer.com    # ✅ NOVO
```

**Comando automático:**

```bash
sed -i 's|https://panel\.quayer\.tech|https://painel.quayer.com|g' app.yaml
```

---

### 6️⃣ Verificar Configuração do Traefik

```bash
# Procurar referências ao domínio antigo
grep -r "panel.quayer.tech" /etc/easypanel/traefik/config/

# Se encontrar arquivos, edite-os:
find /etc/easypanel/traefik/config/ -type f -name "*.yml" -o -name "*.yaml" | while read file; do
    sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' "$file"
done
```

---

### 7️⃣ Reiniciar Serviços

```bash
# Opção 1: Reiniciar via Easypanel CLI (se disponível)
easypanel deploy <NOME_DO_PROJETO>

# Opção 2: Reiniciar Docker Compose
cd /etc/easypanel/projects/<NOME_DO_PROJETO>/
docker-compose down
docker-compose up -d

# Opção 3: Reiniciar apenas o container
docker ps | grep quayer
docker restart <CONTAINER_ID>

# Reiniciar Traefik
docker restart $(docker ps | grep traefik | awk '{print $1}')
```

---

### 8️⃣ Verificar Logs

```bash
# Ver logs do container da aplicação
docker logs -f $(docker ps | grep quayer | awk '{print $1}')

# Ver logs do Traefik
docker logs -f $(docker ps | grep traefik | awk '{print $1}')
```

---

### 9️⃣ Testar Acesso

```bash
# Do próprio servidor
curl -I http://localhost:3000

# Testar com o domínio
curl -I http://localhost:3000 -H "Host: painel.quayer.com"

# Testar HTTPS externo (da sua máquina)
curl -I https://painel.quayer.com
```

---

## 🔍 Comandos de Diagnóstico Úteis

```bash
# Ver todos os containers
docker ps -a

# Ver configuração de rede do container
docker inspect <CONTAINER_ID> | grep -A 20 "Labels"

# Ver rotas do Traefik
docker exec $(docker ps | grep traefik | awk '{print $1}') traefik healthcheck

# Verificar DNS
nslookup painel.quayer.com
dig painel.quayer.com
```

---

## 📋 Checklist de Verificação

- [ ] Arquivo `app.yaml` atualizado com novo domínio
- [ ] Variáveis de ambiente atualizadas
- [ ] Configuração do Traefik atualizada
- [ ] Containers reiniciados
- [ ] Traefik reiniciado
- [ ] DNS resolvendo corretamente
- [ ] Teste local com curl funcionando
- [ ] HTTPS externo funcionando

---

## 🆘 Se ainda não funcionar

### Verificar Easypanel via Interface Web

1. Acesse: `https://panel.quayer.tech` (interface do Easypanel)
2. Vá no projeto → **Settings** → **Domains**
3. Adicione manualmente `painel.quayer.com`
4. Remova `panel.quayer.tech`
5. Clique em **Deploy**

---

## 📞 Próximos Passos

Após fazer as correções:

1. Me envie a saída dos comandos de verificação
2. Cole o conteúdo do `app.yaml` (sem senhas)
3. Mostre os logs se houver erros

Estou pronto para ajudar com qualquer erro que aparecer! 🚀
