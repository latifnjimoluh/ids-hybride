# Lance le backend (FastAPI) et le frontend (Vite) dans deux fenêtres PowerShell.
# Usage :  .\start-dev.ps1

$root = $PSScriptRoot

Write-Host "Demarrage du backend FastAPI (http://127.0.0.1:8000) ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
)

Start-Sleep -Seconds 2

Write-Host "Demarrage du frontend Vite (http://localhost:5173) ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Dashboard : http://localhost:5173" -ForegroundColor Green
Write-Host "API docs  : http://127.0.0.1:8000/docs" -ForegroundColor Green
