#!/bin/bash
# Health Monitor Startup Script for Windows (Git Bash/WSL/Cygwin)
# This script provides a convenient way to start the health monitor

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEALTH_MONITOR_SCRIPT="$SCRIPT_DIR/HealthMonitor.ps1"
CONFIG_FILE="$SCRIPT_DIR/config.json"
CONFIG_SAMPLE="$SCRIPT_DIR/config.json.sample"

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if PowerShell is available
check_powershell() {
    if command -v powershell.exe &> /dev/null; then
        return 0
    elif command -v pwsh &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to get PowerShell command
get_powershell_cmd() {
    if command -v powershell.exe &> /dev/null; then
        echo "powershell.exe"
    elif command -v pwsh &> /dev/null; then
        echo "pwsh"
    else
        echo ""
    fi
}

# Function to check if config file exists
check_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        if [[ -f "$CONFIG_SAMPLE" ]]; then
            print_message $YELLOW "Config file not found. Creating from sample..."
            cp "$CONFIG_SAMPLE" "$CONFIG_FILE"
            print_message $GREEN "Created config.json from sample. Please edit it with your monitoring targets."
            return 1
        else
            print_message $RED "Error: Neither config.json nor config.json.sample found!"
            return 2
        fi
    fi
    return 0
}

# Function to show usage
show_usage() {
    print_message $BLUE "Health Monitor Startup Script"
    print_message $BLUE "============================="
    echo ""
    print_message $GREEN "Usage: $0 [option]"
    echo ""
    print_message $YELLOW "Options:"
    echo "  dashboard    - Open HTML dashboard in browser"
    echo "  once         - Run health check once and exit"
    echo "  continuous   - Run continuous monitoring (default)"
    echo "  silent       - Run silently without console output"
    echo "  setup        - Setup Windows Task Scheduler"
    echo "  help         - Show this help message"
    echo ""
    print_message $YELLOW "Examples:"
    echo "  ./start.sh dashboard    # Open web dashboard"
    echo "  ./start.sh once         # Single health check"
    echo "  ./start.sh              # Continuous monitoring"
}

# Function to run PowerShell script
run_health_monitor() {
    local args="$1"
    local ps_cmd=$(get_powershell_cmd)
    
    print_message $BLUE "Starting Health Monitor..."
    print_message $YELLOW "Working directory: $SCRIPT_DIR"
    print_message $YELLOW "PowerShell command: $ps_cmd"
    
    cd "$SCRIPT_DIR"
    
    if [[ "$args" == *"-Dashboard"* ]]; then
        print_message $GREEN "Opening dashboard in browser..."
    fi
    
    $ps_cmd -ExecutionPolicy Bypass -File "$HEALTH_MONITOR_SCRIPT" $args
}

# Main execution
main() {
    local mode="$1"
    
    print_message $BLUE "🏥 Health Monitor Startup Script"
    print_message $BLUE "================================"
    
    # Check if PowerShell is available
    if ! check_powershell; then
        print_message $RED "Error: PowerShell not found!"
        print_message $YELLOW "Please install PowerShell or run this script from:"
        print_message $YELLOW "  - Git Bash for Windows"
        print_message $YELLOW "  - Windows Subsystem for Linux (WSL)"
        print_message $YELLOW "  - Cygwin"
        exit 1
    fi
    
    # Check configuration
    check_config
    config_status=$?
    
    if [[ $config_status -eq 2 ]]; then
        exit 1
    elif [[ $config_status -eq 1 ]]; then
        print_message $YELLOW "Please edit config.json before running the monitor."
        print_message $YELLOW "Opening config file..."
        
        # Try to open config file in default editor
        if command -v code &> /dev/null; then
            code "$CONFIG_FILE"
        elif command -v notepad.exe &> /dev/null; then
            notepad.exe "$CONFIG_FILE"
        else
            print_message $YELLOW "Please manually edit: $CONFIG_FILE"
        fi
        
        read -p "Press Enter after editing the config file to continue..."
    fi
    
    # Handle different modes
    case "$mode" in
        "dashboard")
            run_health_monitor "-Dashboard"
            ;;
        "once")
            run_health_monitor "-RunOnce"
            ;;
        "continuous"|"")
            print_message $GREEN "Starting continuous monitoring (Press Ctrl+C to stop)..."
            run_health_monitor ""
            ;;
        "silent")
            run_health_monitor "-Silent"
            ;;
        "setup")
            print_message $BLUE "Setting up Windows Task Scheduler..."
            cd "$SCRIPT_DIR"
            $(get_powershell_cmd) -ExecutionPolicy Bypass -File "$SCRIPT_DIR/setup-task-scheduler.ps1"
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            print_message $RED "Unknown option: $mode"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
