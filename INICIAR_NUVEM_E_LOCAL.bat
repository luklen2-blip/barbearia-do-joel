@echo off
title Barbearia do Joel - Deploy Nuvem e Servidor Local
cd /d "C:\Users\luciano\.gemini\antigravity\scratch\barbearia-do-joel"
echo ===================================================================
echo   BARBEARIA DO JOEL - INICIALIZADOR DE NUVEM E SERVIDOR LOCAL
echo ===================================================================
echo.
echo 1. Iniciando servidor Node.js local na porta 3000...
start "Servidor Node" /min node server.js
timeout /t 2 /nobreak >nul

echo 2. Iniciando Tunel de Nuvem Cloudflare 24/7 (HTTPS)...
start "Tunel Cloudflare" /min .\cloudflared.exe tunnel --url http://localhost:3000 --no-prechecks --logfile cloudflare.log
timeout /t 3 /nobreak >nul

echo.
echo [OK] Servidor e Tunel em Nuvem ativos!
echo Acesse localmente: http://localhost:3000
echo Para ver a URL publica da nuvem, consulte o arquivo cloudflare.log
echo.
start http://localhost:3000
echo Pressione qualquer tecla para encerrar...
pause >nul
