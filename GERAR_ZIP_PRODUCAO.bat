@echo off
title Gerador de Pacote de Deploy - Barbearia do Joel
cd /d "C:\Users\luciano\.gemini\antigravity\scratch\barbearia-do-joel"
echo Gerando pacote limpo de deploy para a nuvem...
powershell -Command "Compress-Archive -Path 'package.json', 'package-lock.json', 'server.js', 'database.js', 'render.yaml', 'Dockerfile', '.gitignore', '.dockerignore', 'README.md', 'RELATORIO_HOMOLOGACAO_FINAL.md', 'public', 'tests', 'data', 'scripts' -DestinationPath 'C:\Users\luciano\OneDrive\Desktop\barbearia-do-joel-deploy.zip' -Force"
echo.
echo ========================================================
echo [OK] Pacote gerado com sucesso: barbearia-do-joel-deploy.zip
echo Pronto para upload no Render, Railway ou GitHub!
echo ========================================================
pause
