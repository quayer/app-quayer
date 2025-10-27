#!/bin/bash

echo "🔄 MUDANÇA DE DOMÍNIO: panel.quayer.tech → painel.quayer.com"
echo "=============================================================="

# 1. Backup do arquivo de configuração
echo -e "\n1️⃣ Criando backup do main.yaml..."
BACKUP_FILE="/etc/easypanel/traefik/config/main.yaml.backup-$(date +%Y%m%d-%H%M%S)"
cp /etc/easypanel/traefik/config/main.yaml "$BACKUP_FILE"
echo "✅ Backup criado: $BACKUP_FILE"

# 2. Mostrar configuração atual
echo -e "\n2️⃣ Configuração ATUAL (antes da mudança):"
grep "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml

# 3. Substituir domínio
echo -e "\n3️⃣ Substituindo panel.quayer.tech por painel.quayer.com..."
sed -i 's/panel\.quayer\.tech/painel.quayer.com/g' /etc/easypanel/traefik/config/main.yaml

# 4. Verificar mudança
echo -e "\n4️⃣ Configuração NOVA (depois da mudança):"
grep "painel.quayer.com" /etc/easypanel/traefik/config/main.yaml

# 5. Verificar se ainda existe referência ao domínio antigo
echo -e "\n5️⃣ Verificando se ainda existe 'panel.quayer.tech'..."
if grep -q "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml; then
    echo "❌ ATENÇÃO: Ainda existem referências ao domínio antigo!"
    grep "panel.quayer.tech" /etc/easypanel/traefik/config/main.yaml
else
    echo "✅ Todas as referências foram substituídas com sucesso!"
fi

# 6. Mostrar diff do arquivo
echo -e "\n6️⃣ Diferenças entre backup e novo arquivo:"
diff "$BACKUP_FILE" /etc/easypanel/traefik/config/main.yaml || true

# 7. Reiniciar Traefik
echo -e "\n7️⃣ Reiniciando Traefik..."
docker restart $(docker ps -q --filter name=traefik)
sleep 5

# 8. Verificar status do Traefik
echo -e "\n8️⃣ Status do Traefik:"
docker ps --filter name=traefik --format "table {{.Names}}\t{{.Status}}"

# 9. Aguardar Traefik inicializar
echo -e "\n9️⃣ Aguardando Traefik inicializar (10 segundos)..."
sleep 10

# 10. Testar novo domínio
echo -e "\n🔟 Testando acesso ao novo domínio..."
echo "Teste interno (localhost):"
curl -I http://localhost -H "Host: painel.quayer.com" 2>&1 | head -5

echo -e "\nTeste externo (HTTPS):"
curl -I https://painel.quayer.com 2>&1 | head -5

echo -e "\n✨ CONCLUÍDO!"
echo "================================================"
echo "📋 Próximos passos:"
echo "1. Acesse: https://painel.quayer.com"
echo "2. Se ainda der 404, aguarde 1-2 minutos para propagação"
echo "3. Limpe o cache do navegador (Ctrl+F5)"
echo ""
echo "🔄 Para reverter: cp $BACKUP_FILE /etc/easypanel/traefik/config/main.yaml"
