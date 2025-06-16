# Simple script to start the backend and frontend.

# Set Python binary (use environment variable or default to python)
$PythonBin = if ($env:PYTHON) { $env:PYTHON } else { "python" }

# Start the Python backend in background
$BackendProcess = Start-Process -FilePath $PythonBin -ArgumentList "main/appflow.py" -PassThru -NoNewWindow

# Function to cleanup backend process
function Stop-Backend {
    if ($BackendProcess -and !$BackendProcess.HasExited) {
        Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Backend process stopped."
    }
}

# Register cleanup function to run on script exit
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-Backend }

# Also handle Ctrl+C
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-Backend }

try {
    # Launch the Electron frontend
    Set-Location frontend
    npm start
}
finally {
    # Ensure cleanup happens
    Stop-Backend
}