# Windows Health Monitor

A comprehensive Windows monitoring solution that performs health checks on URLs and IP addresses with configurable timeouts, Windows notifications, and multiple interface options.

## Features

- **URL Monitoring**: HTTP/HTTPS endpoint monitoring with configurable timeouts and expected status codes
- **IP Monitoring**: Ping-based connectivity testing with configurable timeouts
- **Windows Notifications**: Native Windows balloon tip notifications for alerts
- **HTML Dashboard**: Modern web-based dashboard with auto-refresh capability
- **Configurable Alerts**: Alert cooldown periods to prevent notification spam
- **Logging**: Comprehensive logging with configurable levels and retention
- **Task Scheduler Integration**: Automated monitoring via Windows Task Scheduler
- **Multiple Execution Modes**: Run once, continuous monitoring, or dashboard generation

## Quick Start

1. **Configure Resources**: Edit `config.json` to define your monitoring targets
2. **Run Health Check**: Execute `.\HealthMonitor.ps1` for immediate monitoring
3. **Setup Automation**: Run `.\setup-task-scheduler.ps1` to schedule automatic monitoring
4. **View Dashboard**: Use `.\HealthMonitor.ps1 -Dashboard` to open web dashboard

## Configuration

### config.json Structure

```json
{
  "settings": {
    "checkInterval": 60,          // Seconds between checks (continuous mode)
    "urlTimeout": 10,             // Default URL timeout in seconds
    "pingTimeout": 5,             // Default ping timeout in seconds
    "retryAttempts": 3,           // Number of retry attempts
    "retryDelay": 2,              // Delay between retries in seconds
    "alertCooldown": 300,         // Seconds before re-alerting for same resource
    "logLevel": "INFO",           // Logging level: DEBUG, INFO, WARNING, ERROR
    "enableNotifications": true,   // Enable Windows notifications
    "enableLogging": true,        // Enable file logging
    "logRetentionDays": 30        // Log file retention period
  },
  "resources": [
    {
      "name": "Google",           // Display name for the resource
      "type": "url",              // Type: "url" or "ping"
      "target": "https://www.google.com",  // URL or IP address
      "timeout": 10,              // Override default timeout
      "expectedStatus": 200,      // Expected HTTP status code (URL only)
      "enabled": true             // Enable/disable this resource
    }
  ]
}
```

### Resource Types

#### URL Resources
- **type**: `"url"`
- **target**: Full HTTP/HTTPS URL
- **expectedStatus**: HTTP status code to expect (default: 200)
- **timeout**: Request timeout in seconds

#### Ping Resources
- **type**: `"ping"`
- **target**: IP address or hostname
- **timeout**: Ping timeout in seconds

## Usage

### PowerShell Script Options

```powershell
# Run once and exit
.\HealthMonitor.ps1 -RunOnce

# Run continuously with console output
.\HealthMonitor.ps1

# Run silently (no console output)
.\HealthMonitor.ps1 -Silent

# Generate and open HTML dashboard
.\HealthMonitor.ps1 -Dashboard

# Use custom config file
.\HealthMonitor.ps1 -ConfigPath ".\custom-config.json"
```

### Task Scheduler Setup

```powershell
# Setup automated monitoring (every 5 minutes)
.\setup-task-scheduler.ps1

# Setup with custom interval (every 10 minutes)
.\setup-task-scheduler.ps1 -IntervalMinutes 10

# Remove scheduled task
.\setup-task-scheduler.ps1 -Remove

# Setup with custom task name
.\setup-task-scheduler.ps1 -TaskName "MyHealthMonitor"
```

### HTML Dashboard

The HTML dashboard provides:
- Real-time health status visualization
- Auto-refresh capability (30-second intervals)
- Responsive design for desktop and mobile
- Resource details including response times and error messages
- Manual refresh option

Access the dashboard by:
1. Running `.\HealthMonitor.ps1 -Dashboard`
2. Opening `.\dashboard\index.html` directly in your browser

## Windows Integration

### Notifications

The monitor uses Windows balloon tip notifications to alert you when resources become unavailable. Notifications include:
- Resource name and status
- Error details
- Automatic cooldown to prevent spam

### Task Scheduler

Automated monitoring via Windows Task Scheduler provides:
- Background execution without user login
- Configurable intervals
- Automatic startup after system reboot
- Logging of execution results

## File Structure

```
monitoring/
├── config.json                    # Main configuration file
├── HealthMonitor.ps1              # Main PowerShell script
├── setup-task-scheduler.ps1       # Task Scheduler setup script
├── dashboard/
│   └── index.html                 # HTML dashboard
├── logs/
│   ├── health-monitor.log         # Health check logs
│   └── task-scheduler.log         # Task scheduler logs
└── README.md                      # This documentation
```

## Troubleshooting

### Common Issues

1. **PowerShell Execution Policy**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Task Scheduler Permissions**
   - Run PowerShell as Administrator for task creation
   - Ensure the script path is accessible to the scheduled task

3. **Network Connectivity**
   - Verify firewall settings allow outbound connections
   - Check proxy settings if behind corporate firewall

4. **Notifications Not Showing**
   - Ensure Windows notifications are enabled in system settings
   - Check if focus assist is blocking notifications

### Logging

Logs are stored in the `logs/` directory:
- `health-monitor.log`: Health check results and errors
- `task-scheduler.log`: Task scheduler setup and execution logs

Log levels:
- **DEBUG**: Detailed execution information
- **INFO**: General operational messages
- **WARNING**: Non-critical issues
- **ERROR**: Critical failures

### Performance Considerations

- **Timeout Settings**: Balance between responsiveness and false positives
- **Check Intervals**: Consider network load and resource sensitivity
- **Log Retention**: Monitor disk space usage for long-running deployments

## Advanced Configuration

### Custom Notification Handling

Modify the `ShowNotification` method in `HealthMonitor.ps1` to integrate with:
- Email notifications
- Slack/Teams webhooks
- SMS services
- Custom alerting systems

### Dashboard Customization

The HTML dashboard can be customized by:
- Modifying CSS styles in `dashboard/index.html`
- Adding custom JavaScript for additional functionality
- Integrating with external monitoring systems

### Integration with Other Tools

The health monitor can be integrated with:
- **SCOM/SCCM**: Use PowerShell output for system monitoring
- **Nagios/Zabbix**: Parse log files for external monitoring
- **PowerBI**: Import log data for reporting and analytics

## Security Considerations

- Store sensitive URLs in environment variables
- Use HTTPS for all web-based monitoring
- Implement proper access controls for configuration files
- Consider network segmentation for monitoring traffic

## License

This tool is part of the cloud-tools suite and follows the same licensing terms.
