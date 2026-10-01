@echo off
chcp 65001 >nul
title Cloudflare Tunnel
if "%PORT%"=="" set PORT=8787

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared が見つかりません。次のコマンドでインストールできます:
  echo.
  echo     winget install --id Cloudflare.cloudflared
  echo.
  echo インストール後、このウィンドウを閉じて、もう一度実行してください。
  pause
  exit /b 1
)

echo ---------------------------------------------------------------
echo  下に表示される  https://xxxx.trycloudflare.com  が公開URLです。
echo  ★ホストのあなたも、このURLでゲームを開いてください。
echo    （QRコードがこのURLで作られます）
echo ---------------------------------------------------------------
cloudflared tunnel --url http://localhost:%PORT%
pause
