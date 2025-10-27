# 🎯 PASSO A PASSO MANUAL - Trocar Domínio Easypanel

## ⚠️ IMPORTANTE SOBRE A SENHA NO SSH
Quando você digita a senha no SSH/CMD/PowerShell, **OS CARACTERES NÃO APARECEM** por motivos de segurança. Isso é NORMAL! Digite a senha normalmente e aperte ENTER.

---

## 📝 MÉTODO 1: Usando PowerShell (MAIS FÁCIL)

### Passo 1: Abra o PowerShell
- Pressione `Win + X`
- Escolha "Windows PowerShell" ou "Terminal"

### Passo 2: Execute ESTES 6 COMANDOS (um de cada vez)

```powershell
# Comando 1: Backup
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 'cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup'
```

**Aguarde terminar**, depois execute:

```powershell
# Comando 2: Substituir domínio
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 "sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml"
```

**Aguarde terminar**, depois execute:

```powershell
# Comando 3: Verificar mudança
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 'grep painel.quayer.com /etc/easypanel/traefik/config/main.yaml'
```

**Deve mostrar linhas com "painel.quayer.com"**, depois execute:

```powershell
# Comando 4: Reiniciar Traefik
wsl sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 'docker restart $(docker ps -q --filter name=traefik)'
```

**Aguarde 20 segundos**, depois execute:

```powershell
# Comando 5: Testar acesso
curl -I https://painel.quayer.com
```

---

## 📝 MÉTODO 2: Usando PuTTY (SE NÃO TIVER, BAIXE)

### Passo 1: Baixar PuTTY (se não tiver)
- Acesse: https://www.putty.org/
- Baixe e instale

### Passo 2: Conectar ao Servidor
1. Abra o PuTTY
2. Em "Host Name": `5.161.177.117`
3. Port: `22`
4. Clique em "Open"
5. Se perguntar sobre certificado, clique "Yes"
6. Login: `root`
7. Password: `bi7xsUMsMJhXpxxNUxaf` (NÃO VAI APARECER QUANDO DIGITAR - é normal!)

### Passo 3: Copie e Cole no PuTTY

**DICA:** No PuTTY, você cola com **botão direito do mouse**!

Cole este comando:

```bash
cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup && sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml && grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml && docker restart $(docker ps -q --filter name=traefik) && sleep 15 && curl -I https://painel.quayer.com
```

Aperte ENTER e aguarde!

---

## 📝 MÉTODO 3: Usando Ubuntu WSL Diretamente

### Passo 1: Abrir Ubuntu
- Pressione `Win + R`
- Digite: `wsl`
- Aperte ENTER

### Passo 2: Executar Comando SSH

```bash
sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117
```

**Você entrará no servidor**. Agora cole:

```bash
cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup
sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml
grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml
docker restart $(docker ps -q --filter name=traefik)
sleep 15
curl -I https://painel.quayer.com
```

---

## 📝 MÉTODO 4: Terminal Windows (CMD)

### Passo 1: Abrir CMD
- Pressione `Win + R`
- Digite: `cmd`
- Aperte ENTER

### Passo 2: Conectar via SSH Puro

```cmd
ssh root@5.161.177.117
```

Quando pedir a senha, digite:
```
bi7xsUMsMJhXpxxNUxaf
```

**LEMBRE-SE: A senha NÃO APARECE quando você digita! Continue digitando e aperte ENTER**

### Passo 3: Após Conectado

Cole este comando:

```bash
cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup && sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml && grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml && docker restart $(docker ps -q --filter name=traefik) && sleep 15 && curl -I https://painel.quayer.com
```

---

## ✅ O QUE ESPERAR

Quando funcionar, você verá:

```
✅ Backup criado
✅ Arquivo substituído
✅ Linhas mostrando "painel.quayer.com"
✅ Container Traefik reiniciado
✅ HTTP/1.1 200 OK (ou 301/302 - ok também!)
```

---

## ❌ SE DER ERRO 404

1. Aguarde 2-3 minutos
2. Limpe cache do navegador (Ctrl + Shift + Delete)
3. Tente em aba anônima
4. Verifique DNS:
   ```
   nslookup painel.quayer.com
   ```

---

## 🆘 PROBLEMAS COMUNS

### "Connection timed out"
- Verifique sua internet
- Tente novamente em alguns minutos
- O servidor pode estar com firewall bloqueando

### "Permission denied"
- Verifique se digitou a senha correta
- Lembre que a senha NÃO aparece quando digita

### "sshpass: command not found"
- Instale sshpass no WSL:
  ```bash
  wsl
  sudo apt update
  sudo apt install sshpass -y
  ```

---

## 🎉 SUCESSO!

Quando funcionar, acesse:
**https://painel.quayer.com**

E você verá o Easypanel funcionando! 🚀
