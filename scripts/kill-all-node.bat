@echo off
echo Matando todos os processos Node.js...
taskkill /F /IM node.exe /T 2>nul
if %errorlevel% equ 0 (
    echo Processos Node.js encerrados com sucesso!
) else (
    echo Nenhum processo Node.js encontrado ou erro ao encerrar.
)
timeout /t 2 /nobreak >nul
echo Verificando processos restantes...
tasklist | findstr "node.exe"
if %errorlevel% equ 1 (
    echo Nenhum processo Node.js encontrado. Tudo limpo!
) else (
    echo AVISO: Ainda existem processos Node.js rodando!
)
