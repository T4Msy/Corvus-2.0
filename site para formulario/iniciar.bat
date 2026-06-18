@echo off
REM Inicia o Painel do Banco do Corvus localmente.
cd /d "%~dp0"
echo Iniciando o Painel do Banco do Corvus...
node "server.js"
pause
