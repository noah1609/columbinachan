@echo off
chcp 65001 >nul
title Columbina bot
cd /d "%~dp0"
rem Nếu máy chưa có node trong PATH thì dùng node.exe ở thư mục cha (D:\code)
where node >nul 2>nul || set "PATH=%~dp0..;%PATH%"

:loop
echo [%date% %time%] Dang khoi dong bot...
node index.js
echo [%date% %time%] Bot bi tat hoac loi. Tu khoi dong lai sau 5 giay... (Ctrl+C de dung han)
timeout /t 5 /nobreak >nul
goto loop
