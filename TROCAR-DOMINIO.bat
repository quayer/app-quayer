@echo off
echo ============================================
echo    TROCAR DOMINIO EASYPANEL
echo    panel.quayer.tech -> painel.quayer.com
echo ============================================
echo.

echo Conectando ao servidor...
echo.

wsl bash -c "sshpass -p 'bi7xsUMsMJhXpxxNUxaf' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 root@5.161.177.117 'cp /etc/easypanel/traefik/config/main.yaml /etc/easypanel/traefik/config/main.yaml.backup && echo Backup criado && sed -i \"s/panel\.quayer\.tech/painel.quayer.com/g\" /etc/easypanel/traefik/config/main.yaml && echo Dominio substituido && grep \"painel.quayer.com\" /etc/easypanel/traefik/config/main.yaml && docker restart $(docker ps -q --filter name=traefik) && echo Traefik reiniciado && sleep 15 && curl -I https://painel.quayer.com'"

echo.
echo ============================================
echo Processo concluido!
echo Teste acessar: https://painel.quayer.com
echo ============================================
echo.
pause
