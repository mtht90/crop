@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "ARCANE BEASTS server" cmd /k "%~dp0start-server.bat"
echo サーバーの準備ができるまで少し待ちます...
timeout /t 25 /nobreak >nul
start "Cloudflare Tunnel" cmd /k "%~dp0start-tunnel.bat"
echo.
echo 「Cloudflare Tunnel」のウィンドウに出る https://xxxx.trycloudflare.com をブラウザで開いてください。
echo ^(このウィンドウは閉じてかまいません^)
pause
