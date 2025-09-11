# Windows Health Monitor
# Monitors URLs and IPs with configurable timeouts and Windows notifications

param(
    [string]$ConfigPath = ".\config.json",
    [switch]$RunOnce = $false,
    [switch]$Silent = $false,
    [switch]$Dashboard = $false
)

# Store parameters in script scope for class access
$script:RunOnce = $RunOnce
$script:Silent = $Silent
$script:Dashboard = $Dashboard

# Check platform and available notification methods
$script:PlatformIsWindows = $PSVersionTable.Platform -eq 'Win32NT' -or $PSVersionTable.PSEdition -eq 'Desktop'
$script:PlatformIsMacOS = $PSVersionTable.Platform -eq 'Unix' -and [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
$script:PlatformIsLinux = $PSVersionTable.Platform -eq 'Unix' -and -not $script:PlatformIsMacOS

# Import required modules for Windows integration (Windows only)
if ($script:PlatformIsWindows) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName PresentationFramework
    } catch {
        Write-Warning "Some Windows-specific assemblies could not be loaded. Notifications may be limited."
    }
}

class HealthMonitor {
    [hashtable]$Config
    [hashtable]$LastAlerts
    [string]$LogPath
    
    HealthMonitor([string]$configPath) {
        $this.LoadConfig($configPath)
        $this.LastAlerts = @{}
        $this.LogPath = Join-Path "logs" "health-monitor.log"
        $this.EnsureLogDirectory()
    }
    
    [void]LoadConfig([string]$path) {
        if (-not (Test-Path $path)) {
            throw "Configuration file not found: $path"
        }
        try {
            $configContent = Get-Content $path -Raw
            $this.Config = $configContent | ConvertFrom-Json -AsHashtable
        } catch {
            throw "Invalid JSON in configuration file: $($_.Exception.Message)"
        }
    }
    
    [void]EnsureLogDirectory() {
        $logDir = Split-Path $this.LogPath -Parent
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
    }
    
    [void]WriteLog([string]$level, [string]$message) {
        if (-not $this.Config.settings.enableLogging) { return }
        
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $logEntry = "[$timestamp] [$level] $message"
        
        Add-Content -Path $this.LogPath -Value $logEntry
        
        if ($level -eq "ERROR" -or $this.Config.settings.logLevel -eq "DEBUG") {
            Write-Host $logEntry -ForegroundColor $(if($level -eq "ERROR") {"Red"} else {"Gray"})
        }
    }
    
    [hashtable]TestUrl([hashtable]$resource) {
        $result = @{
            Success = $false
            ResponseTime = 0
            StatusCode = 0
            Error = $null
        }
        
        try {
            $timeout = if ($resource.timeout) { $resource.timeout } else { $this.Config.settings.urlTimeout }
            $expectedStatus = if ($resource.expectedStatus) { $resource.expectedStatus } else { 200 }
            
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            
            $response = Invoke-WebRequest -Uri $resource.target -TimeoutSec $timeout -UseBasicParsing
            
            $stopwatch.Stop()
            $result.ResponseTime = $stopwatch.ElapsedMilliseconds
            $result.StatusCode = $response.StatusCode
            
            if ($response.StatusCode -eq $expectedStatus) {
                $result.Success = $true
                $this.WriteLog("INFO", "URL check passed: $($resource.name) - $($result.ResponseTime)ms")
            } else {
                $result.Error = "Unexpected status code: $($response.StatusCode), expected: $expectedStatus"
                $this.WriteLog("ERROR", "URL check failed: $($resource.name) - $($result.Error)")
            }
        }
        catch {
            $result.Error = $_.Exception.Message
            $this.WriteLog("ERROR", "URL check failed: $($resource.name) - $($result.Error)")
        }
        
        return $result
    }
    
    [hashtable]TestPing([hashtable]$resource) {
        $result = @{
            Success = $false
            ResponseTime = 0
            Error = $null
        }
        
        try {
            $timeout = if ($resource.timeout) { $resource.timeout * 1000 } else { $this.Config.settings.pingTimeout * 1000 }
            
            $ping = New-Object System.Net.NetworkInformation.Ping
            $reply = $ping.Send($resource.target, $timeout)
            
            if ($reply.Status -eq "Success") {
                $result.Success = $true
                $result.ResponseTime = $reply.RoundtripTime
                $this.WriteLog("INFO", "Ping check passed: $($resource.name) - $($result.ResponseTime)ms")
            } else {
                $result.Error = "Ping failed: $($reply.Status)"
                $this.WriteLog("ERROR", "Ping check failed: $($resource.name) - $($result.Error)")
            }
        }
        catch {
            $result.Error = $_.Exception.Message
            $this.WriteLog("ERROR", "Ping check failed: $($resource.name) - $($result.Error)")
        }
        
        return $result
    }
    
    [void]ShowNotification([string]$title, [string]$message, [string]$icon = "Warning") {
        if (-not $this.Config.settings.enableNotifications) { return }
        
        try {
            # Determine platform and use appropriate notification method
            if ($script:PlatformIsWindows) {
                $this.ShowWindowsNotification($title, $message, $icon)
            } elseif ($script:PlatformIsMacOS) {
                $this.ShowMacNotification($title, $message, $icon)
            } elseif ($script:PlatformIsLinux) {
                $this.ShowLinuxNotification($title, $message, $icon)
            } else {
                $this.ShowConsoleNotification($title, $message, $icon)
            }
            
            $this.WriteLog("INFO", "Notification sent: $title - $message")
        }
        catch {
            $this.WriteLog("ERROR", "Failed to send notification: $($_.Exception.Message)")
            $this.ShowConsoleNotification($title, $message, $icon)
        }
    }
    
    [void]ShowWindowsNotification([string]$title, [string]$message, [string]$icon) {
        # Skip Windows-specific notifications on non-Windows platforms
        if (-not $script:PlatformIsWindows) {
            throw "Windows notifications not available on this platform"
        }
        
        try {
            # Simple console notification as fallback since Windows Forms isn't available
            $this.ShowConsoleNotification($title, $message, $icon)
        } catch {
            throw "Windows notification failed: $($_.Exception.Message)"
        }
    }
    
    [void]ShowMacNotification([string]$title, [string]$message, [string]$icon) {
        try {
            $script = "display notification `"$message`" with title `"$title`""
            & osascript -e $script
        } catch {
            throw "macOS notification failed: $($_.Exception.Message)"
        }
    }
    
    [void]ShowLinuxNotification([string]$title, [string]$message, [string]$icon) {
        try {
            $iconArg = switch ($icon.ToLower()) {
                "error" { "error" }
                "warning" { "warning" }
                "info" { "info" }
                default { "dialog-information" }
            }
            & notify-send --icon=$iconArg "$title" "$message"
        } catch {
            throw "Linux notification failed: $($_.Exception.Message)"
        }
    }
    
    [void]ShowConsoleNotification([string]$title, [string]$message, [string]$icon) {
        $iconSymbol = switch ($icon.ToLower()) {
            "error" { "[X]" }
            "warning" { "[!]" }
            "info" { "[i]" }
            default { "[*]" }
        }
        
        $color = switch ($icon.ToLower()) {
            "error" { "Red" }
            "warning" { "Yellow" }
            "info" { "Cyan" }
            default { "White" }
        }
        
        Write-Host "`n$iconSymbol $title" -ForegroundColor $color
        Write-Host "   $message" -ForegroundColor Gray
        Write-Host ""
    }
    
    [bool]ShouldAlert([string]$resourceName) {
        $now = Get-Date
        $cooldown = $this.Config.settings.alertCooldown
        
        if ($this.LastAlerts.ContainsKey($resourceName)) {
            $lastAlert = $this.LastAlerts[$resourceName]
            $timeDiff = ($now - $lastAlert).TotalSeconds
            
            if ($timeDiff -lt $cooldown) {
                return $false
            }
        }
        
        return $true
    }
    
    [void]RecordAlert([string]$resourceName) {
        $this.LastAlerts[$resourceName] = Get-Date
    }
    
    [hashtable]CheckResource([hashtable]$resource) {
        if (-not $resource.enabled) {
            return @{ Success = $true; Skipped = $true }
        }
        
        $result = $null
        
        switch ($resource.type.ToLower()) {
            "url" { $result = $this.TestUrl($resource) }
            "ping" { $result = $this.TestPing($resource) }
            default { 
                $this.WriteLog("ERROR", "Unknown resource type: $($resource.type)")
                return @{ Success = $false; Error = "Unknown resource type" }
            }
        }
        
        if (-not $result.Success -and $this.ShouldAlert($resource.name)) {
            $this.ShowNotification(
                "Health Monitor Alert",
                "$($resource.name) is DOWN`n$($result.Error)",
                "Error"
            )
            $this.RecordAlert($resource.name)
        }
        
        return $result
    }
    
    [hashtable]RunHealthCheck() {
        $this.WriteLog("INFO", "Starting health check cycle")
        
        $results = @{}
        $totalResources = 0
        $successCount = 0
        $failureCount = 0
        
        foreach ($resource in $this.Config.resources) {
            $totalResources++
            
            $result = $this.CheckResource($resource)
            $results[$resource.name] = $result
            
            if ($result.Success) {
                $successCount++
            } else {
                $failureCount++
            }
        }
        
        $summary = @{
            Timestamp = Get-Date
            Total = $totalResources
            Success = $successCount
            Failures = $failureCount
            Results = $results
        }
        
        $this.WriteLog("INFO", "Health check completed: $successCount/$totalResources resources healthy")
        
        return $summary
    }
    
    [void]StartMonitoring() {
        $this.WriteLog("INFO", "Health Monitor started")
        
        do {
            try {
                $summary = $this.RunHealthCheck()
                
                if ($summary.Failures -eq 0) {
                    Write-Host "[OK] All $($summary.Total) resources are healthy" -ForegroundColor Green
                } else {
                    Write-Host "[WARN] $($summary.Failures) of $($summary.Total) resources are down" -ForegroundColor Red
                }
                
                if (-not $script:RunOnce) {
                    $interval = $this.Config.settings.checkInterval
                    Write-Host "Next check in $interval seconds..." -ForegroundColor Gray
                    Start-Sleep -Seconds $interval
                }
            }
            catch {
                $this.WriteLog("ERROR", "Monitoring cycle failed: $($_.Exception.Message)")
                Write-Host "Error in monitoring cycle: $($_.Exception.Message)" -ForegroundColor Red
                
                if (-not $script:RunOnce) {
                    Start-Sleep -Seconds 30
                }
            }
        } while (-not $script:RunOnce)
    }
    
    [void]GenerateDashboard() {
        $summary = $this.RunHealthCheck()
        $dashboardPath = Join-Path "dashboard" "index.html"
        
        $this.EnsureDashboardDirectory()
        $this.CreateDashboardFiles($summary)
        
        Write-Host "Dashboard generated at: $dashboardPath" -ForegroundColor Green
        
        # Get absolute path for browser opening
        $absolutePath = Resolve-Path $dashboardPath -ErrorAction SilentlyContinue
        if (-not $absolutePath) {
            $absolutePath = Join-Path (Get-Location) $dashboardPath
        }
        
        # Open in default browser (cross-platform)
        if ($script:PlatformIsMacOS) {
            & open $absolutePath
        } elseif ($script:PlatformIsLinux) {
            & xdg-open $absolutePath
        } elseif ($script:PlatformIsWindows) {
            Start-Process $absolutePath
        } else {
            Write-Host "Please open the dashboard manually: $absolutePath" -ForegroundColor Yellow
        }
    }
    
    [void]EnsureDashboardDirectory() {
        $dashboardDir = "dashboard"
        if (-not (Test-Path $dashboardDir)) {
            New-Item -ItemType Directory -Path $dashboardDir -Force | Out-Null
        }
    }
    
    [void]CreateDashboardFiles([hashtable]$summary) {
        # Generate real-time data for dashboard
        $dashboardData = @{
            timestamp = $summary.Timestamp.ToString("yyyy-MM-dd HH:mm:ss")
            total = $summary.Total
            success = $summary.Success
            failures = $summary.Failures
            results = $summary.Results
        }
        
        $jsonData = $dashboardData | ConvertTo-Json -Depth 10
        $dataFile = Join-Path "dashboard" "data.json"
        
        # Write current status to JSON file for dashboard consumption
        Set-Content -Path $dataFile -Value $jsonData -Encoding UTF8
        
        $this.WriteLog("INFO", "Dashboard data updated: $dataFile")
    }
}

# Main execution
try {
    if (-not (Test-Path $ConfigPath)) {
        Write-Host "Configuration file not found: $ConfigPath" -ForegroundColor Red
        Write-Host "Please create a config.json file with your monitoring configuration." -ForegroundColor Yellow
        exit 1
    }
    
    $monitor = [HealthMonitor]::new($ConfigPath)
    
    if ($Dashboard) {
        $monitor.GenerateDashboard()
    } else {
        if (-not $Silent) {
            Write-Host "Windows Health Monitor Starting..." -ForegroundColor Cyan
            Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Gray
        }
        
        $monitor.StartMonitoring()
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
