# 🔄 Comandos para Trocar Domínio Easypanel

## ⚡ EXECUÇÃO RÁPIDA (Copie e Cole no Terminal)

### Método 1: Conectar ao Servidor e Executar

```bash
# 1. Conecte ao servidor
ssh root@5.161.177.117
# Senha: bi7xsUMsMJhXpxxNUxaf
```

Depois de conectado, **copie e cole tudo de uma vez**:

```bash
# Backup
cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup-$(date +%Y%m%d-%H%M%S)

# Mostrar antes
echo "ANTES:" && grep "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml

# Substituir
sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml

# Mostrar depois
echo "DEPOIS:" && grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml

# Reiniciar Traefik
docker restart $(docker ps -q --filter name=traefik)

# Aguardar
sleep 15

# Testar
curl -I https://painel.quayer.com
```

---

### Método 2: Comandos Individuais SSH (da sua máquina Windows)

Execute **um de cada vez** no PowerShell/CMD:

```powershell
# 1. Backup
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 'cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup'

# 2. Substituir domínio
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 "sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml"

# 3. Verificar mudança
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 'grep painel.quayer.com /etc/easypanel/traefik/config/main.yaml'

# 4. Reiniciar Traefik
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 'docker restart $(docker ps -q --filter name=traefik)'

# 5. Aguardar 15 segundos
timeout /t 15

# 6. Testar acesso
curl -I https://painel.quayer.com
```

---

### Método 3: Script Único (Mais Confiável)

Salve este conteúdo em um arquivo `troca.sh` no servidor:

```bash
#!/bin/bash
cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup
sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml
grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml
docker restart $(docker ps -q --filter name=traefik)
sleep 15
curl -I https://painel.quayer.com
```

Depois execute:
```bash
ssh root@5.161.177.117 'bash -s' < troca.sh
```

---

## 🔍 Verificações Importantes

### Antes de Executar

```bash
# Ver configuração atual
ssh root@5.161.177.117 'grep "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml'
```

### Depois de Executar

```bash
# Verificar se mudou
ssh root@5.161.177.117 'grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml'

# Verificar se ainda tem o antigo
ssh root@5.161.177.117 'grep "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml'
```

---

## 🆘 Solução de Problemas

### Se ainda der 404 após as mudanças:

1. **Aguarde 2-3 minutos** para propagação
2. **Limpe cache do navegador**: Ctrl + F5
3. **Verifique DNS**:
   ```bash
   nslookup painel.quayer.com
   ```

4. **Veja logs do Traefik**:
   ```bash
   ssh root@5.161.177.117 'docker logs $(docker ps -q --filter name=traefik) --tail 50'
   ```

5. **Reinicie o Easypanel também**:
   ```bash
   ssh root@5.161.177.117 'docker restart $(docker ps -q --filter name=easypanel)'
   ```

---

## 🔙 Para Reverter

Se algo der errado:

```bash
ssh root@5.161.177.117 'cp /etc/easypanel/traefik/config/main.yaml.backup /etc/easypanel/traefik/config/main.yaml && docker restart $(docker ps -q --filter name=traefik)'
```

---

## ✅ Checklist Final

- [ ] Backup criado
- [ ] Domínio substituído no main.yaml
- [ ] Verificado que mudança foi aplicada
- [ ] Traefik reiniciado
- [ ] Aguardado 15 segundos
- [ ] Testado acesso a https://painel.quayer.com
- [ ] Cache do navegador limpo
- [ ] Acesso funcionando! 🎉
