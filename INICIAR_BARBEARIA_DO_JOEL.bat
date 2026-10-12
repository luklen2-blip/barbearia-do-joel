@echo off
title Barbearia do Joel - Servidor Web
cd /d "C:\Users\luciano\.gemini\antigravity\scratch\barbearia-do-joel"
echo ========================================================
echo   BARBEARIA DO JOEL - DESDE 1992
echo   Servidor Oficial e Sistema de Agendamento Online
echo ========================================================
echo.
echo Iniciando servidor na porta 3000...
echo Acesse no navegador: http://localhost:3000
echo Health check: http://localhost:3000/api/health
echo.
start http://localhost:3000
node server.js
pause
