# Setup Windows Task Scheduler for Health Monitor
# This script creates a scheduled task to run the health monitor automatically

param(
    [string]$TaskName = "HealthMonitor",
    [string]$ScriptPath = ".\HealthMonitor.ps1",
    [int]$IntervalMinutes = 5,
    [string]$LogPath = ".\logs\task-scheduler.log",
    [switch]$Remove = $false,
    [switch]$Silent = $false
)

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    if (-not $Silent) {
        $color = switch ($Level) {
            "ERROR" { "Red" }
            "WARNING" { "Yellow" }
            "SUCCESS" { "Green" }
            default { "White" }
        }
        Write-Host $logEntry -ForegroundColor $color
    }
    
    # Ensure log directory exists
    $logDir = Split-Path $LogPath -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    
    Add-Content -Path $LogPath -Value $logEntry
}

function Test-AdminRights {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Remove-HealthMonitorTask {
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        
        if ($task) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Log "Successfully removed scheduled task: $TaskName" "SUCCESS"
        } else {
            Write-Log "Scheduled task '$TaskName' not found" "WARNING"
        }
    }
    catch {
        Write-Log "Failed to remove scheduled task: $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Create-HealthMonitorTask {
    try {
        # Check if task already exists
        $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existingTask) {
            Write-Log "Task '$TaskName' already exists. Removing it first..." "WARNING"
            Remove-HealthMonitorTask
        }
        
        # Get full path to script
        $fullScriptPath = Resolve-Path $ScriptPath -ErrorAction Stop
        $workingDirectory = Split-Path $fullScriptPath -Parent
        
        Write-Log "Creating scheduled task: $TaskName"
        Write-Log "Script path: $fullScriptPath"
        Write-Log "Working directory: $workingDirectory"
        Write-Log "Interval: $IntervalMinutes minutes"
        
        # Create the action
        $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$fullScriptPath`" -RunOnce -Silent" -WorkingDirectory $workingDirectory
        
        # Create the trigger (repeat every X minutes)
        $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 365)
        
        # Create the settings
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -DontStopOnIdleEnd
        
        # Create the principal (run as current user)
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
        
        # Register the task
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Automated health monitoring for URLs and IP addresses"
        
        Write-Log "Successfully created scheduled task: $TaskName" "SUCCESS"
        
        # Start the task immediately for testing
        Start-ScheduledTask -TaskName $TaskName
        Write-Log "Started task for immediate execution" "SUCCESS"
        
        return $true
    }
    catch {
        Write-Log "Failed to create scheduled task: $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Show-TaskInfo {
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        
        if ($task) {
            Write-Log "Task Information:" "INFO"
            Write-Log "  Name: $($task.TaskName)" "INFO"
            Write-Log "  State: $($task.State)" "INFO"
            Write-Log "  Last Run Time: $($task.LastRunTime)" "INFO"
            Write-Log "  Next Run Time: $($task.NextRunTime)" "INFO"
            
            $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
            Write-Log "  Last Result: $($taskInfo.LastTaskResult)" "INFO"
            Write-Log "  Number of Missed Runs: $($taskInfo.NumberOfMissedRuns)" "INFO"
        } else {
            Write-Log "Scheduled task '$TaskName' not found" "WARNING"
        }
    }
    catch {
        Write-Log "Failed to get task information: $($_.Exception.Message)" "ERROR"
    }
}

# Main execution
try {
    Write-Log "Health Monitor Task Scheduler Setup" "INFO"
    Write-Log "=====================================" "INFO"
    
    # Check if running as administrator
    if (-not (Test-AdminRights)) {
        Write-Log "Warning: Not running as administrator. Some operations may fail." "WARNING"
        Write-Log "Consider running PowerShell as Administrator for full functionality." "WARNING"
    }
    
    if ($Remove) {
        Write-Log "Removing scheduled task..." "INFO"
        Remove-HealthMonitorTask
    } else {
        # Validate script path
        if (-not (Test-Path $ScriptPath)) {
            throw "Health Monitor script not found at: $ScriptPath"
        }
        
        Write-Log "Setting up scheduled task..." "INFO"
        Create-HealthMonitorTask
        
        Write-Log "" "INFO"
        Show-TaskInfo
        
        Write-Log "" "INFO"
        Write-Log "Setup completed successfully!" "SUCCESS"
        Write-Log "The health monitor will now run every $IntervalMinutes minutes." "SUCCESS"
        Write-Log "You can manage the task using:" "INFO"
        Write-Log "  - Task Scheduler GUI (taskschd.msc)" "INFO"
        Write-Log "  - PowerShell: Get-ScheduledTask -TaskName '$TaskName'" "INFO"
        Write-Log "  - This script with -Remove switch to uninstall" "INFO"
    }
}
catch {
    Write-Log "Setup failed: $($_.Exception.Message)" "ERROR"
    exit 1
}
