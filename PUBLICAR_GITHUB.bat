@echo off
title Publicar Barbearia do Joel no GitHub
cd /d "C:\Users\luciano\.gemini\antigravity\scratch\barbearia-do-joel"
echo ===================================================================
echo   BARBEARIA DO JOEL - PUBLICACAO NO GITHUB E DEPLOY RENDER 24/7
echo ===================================================================
echo.
echo 1. Verificando repositorio remoto no GitHub...
git remote -v
echo.
echo 2. Enviando branch main para https://github.com/luklen2-blip/barbearia-do-joel.git...
git branch -M main
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ===================================================================
    echo [SUCESSO] Repositorio publicado no GitHub!
    echo Agora no Render.com:
    echo 1. Acesse: https://dashboard.render.com/select-repo?type=blueprint
    echo 2. Selecione o repositorio: barbearia-do-joel
    echo 3. O Render ira ler o render.yaml e implantar com 1 clique 24/7!
    echo ===================================================================
) else (
    echo ===================================================================
    echo [ATENCAO] Se o repositorio ainda nao existir no GitHub:
    echo 1. Abra: https://github.com/new?name=barbearia-do-joel
    echo 2. Clique em "Create repository"
    echo 3. Execute este script novamente para finalizar o push!
    echo ===================================================================
)
echo.
pause
