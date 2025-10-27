#!/bin/bash

echo "🚀 Executando troca de domínio no servidor..."

# Executar comandos no servidor remoto via SSH com sshpass
sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no root@5.161.177.117 << 'ENDSSH'

echo "1️⃣ Criando backup..."
cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup-$(date +%Y%m%d-%H%M%S)
echo "✅ Backup criado"

echo ""
echo "2️⃣ Mostrando configuração ANTES:"
grep "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml

echo ""
echo "3️⃣ Substituindo domínio para o NOVO (painel.quayer.com)..."
sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml
echo "✅ Substituição feita"

echo ""
echo "4️⃣ Mostrando configuração DEPOIS:"
grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml

echo ""
echo "5️⃣ Reiniciando serviços para aplicar a mudança..."
docker restart $(docker ps -q --filter name=traefik)
echo "✅ Traefik reiniciado."
docker restart $(docker ps -q --filter name=easypanel)
echo "✅ Easypanel reiniciado."

echo ""
echo "6️⃣ Aguardando 15 segundos para os serviços estabilizarem..."
sleep 15

echo ""
echo "7️⃣ Testando acesso ao novo domínio..."
curl -I https://painel.quayer.com 2>&1 | head -n 5

echo ""
echo "✨ CONCLUÍDO!"

ENDSSH

echo ""
echo "🎉 Processo finalizado! Verifique o resultado do teste acima."
echo "Tente acessar: https://painel.quayer.com"
