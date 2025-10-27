#!/bin/bash

echo "🔄 Reiniciando Easypanel e Serviços Relacionados..."
echo "=================================================="

# 1. Reiniciar Easypanel
echo -e "\n1️⃣ Reiniciando Easypanel..."
docker restart $(docker ps -q --filter name=easypanel)
sleep 5

# 2. Reiniciar Traefik
echo -e "\n2️⃣ Reiniciando Traefik..."
docker restart $(docker ps -q --filter name=traefik)
sleep 5

# 3. Reiniciar aplicação Quayer
echo -e "\n3️⃣ Reiniciando aplicação Quayer..."
docker restart $(docker ps -q --filter name=quayer)
sleep 3

# 4. Verificar status
echo -e "\n✅ Status dos containers:"
docker ps --filter name=easypanel --format "table {{.Names}}\t{{.Status}}"
docker ps --filter name=traefik --format "table {{.Names}}\t{{.Status}}"
docker ps --filter name=quayer --format "table {{.Names}}\t{{.Status}}"

# 5. Testar acesso
echo -e "\n🌐 Testando acesso ao domínio..."
sleep 10
curl -I https://painel.quayer.com 2>&1 | head -5

echo -e "\n✨ Reinicialização completa!"
