@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title ARCANE BEASTS server

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。
  echo https://nodejs.org から「LTS」版をインストールして、もう一度実行してください。
  pause
  exit /b 1
)

if not exist node_modules (
  echo 初回セットアップをしています... ^(数分かかります^)
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

echo ゲームをビルドしています...
call npm run build:web
if errorlevel 1 ( pause & exit /b 1 )

echo.
echo ---------------------------------------------------------------
echo  サーバーを起動します。このウィンドウは閉じないでください。
echo  止めるときは Ctrl+C か、ウィンドウを閉じます。
echo ---------------------------------------------------------------
call npm run server
pause
