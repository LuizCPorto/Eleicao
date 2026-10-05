@echo off
rem Abre o site no computador. Duplo clique neste arquivo; para fechar, feche esta janela.
cd /d "%~dp0"
where python >nul 2>nul || (echo Python nao encontrado. Instale em https://www.python.org/downloads/ e tente de novo. & pause & exit /b)
start "" http://localhost:8000/
echo Site rodando em http://localhost:8000/  (feche esta janela para parar)
python -m http.server 8000 --bind 127.0.0.1 --directory public
