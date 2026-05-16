@echo off
title Diamond Deluxe - Slot Server
cd /d "%~dp0"
echo.
echo  ==========================================
echo   DIAMOND DELUXE - LOCAL SLOT SERVER
echo  ==========================================
echo.
echo   Open on this PC:    http://localhost:8080
echo   Open on phone/LAN:  http://192.168.1.95:8080
echo.
echo   Phone must be on the same WiFi network.
echo   Press CTRL+C to stop the server.
echo.
python -m http.server 8080
pause
