#!/usr/bin/env python3
"""
Flowstack Orchestrator - Runs all PCS AI invoice processing components
"""

import os
import sys
import time
import subprocess
import threading
from datetime import datetime

# Component paths
EMAIL_AGENT = "email_ingestion_agent.py"
QUEUE_WRITER = "invoice_queue_writer.py"
UI_UPLOAD_SERVICE = "ui_upload_service.py"

LOG_PATH = os.path.join(os.path.dirname(__file__), "flowstack.log")

def log(msg):
    """Log messages with timestamp"""
    timestamp = datetime.now().isoformat()
    with open(LOG_PATH, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

def run_component(component_name, script_path):
    """Run a component in a separate process"""
    log(f"🚀 Starting {component_name}...")
    try:
        process = subprocess.Popen(
            [sys.executable, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        log(f"✅ {component_name} started (PID: {process.pid})")
        return process
    except Exception as e:
        log(f"❌ Failed to start {component_name}: {e}")
        return None

def monitor_process(component_name, process):
    """Monitor a process and restart if it dies"""
    while True:
        if process.poll() is not None:
            log(f"⚠️ {component_name} stopped, restarting...")
            process = run_component(component_name, process.args[1])
            if not process:
                log(f"❌ Failed to restart {component_name}")
                break
        time.sleep(5)

def create_directories():
    """Create necessary directories"""
    directories = [
        "email_invoices",
        "output_jsons", 
        "processed_invoices"
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        log(f"📁 Created directory: {directory}")

def main():
    """Main orchestrator function"""
    log("🎯 Starting PCS AI Flowstack Orchestrator...")
    
    # Create necessary directories
    create_directories()
    
    # Start all components
    components = [
        ("Email Ingestion Agent", EMAIL_AGENT),
        ("Invoice Queue Writer", QUEUE_WRITER),
        ("UI Upload Service", UI_UPLOAD_SERVICE)
    ]
    
    processes = {}
    threads = {}
    
    # Start each component
    for name, script in components:
        if os.path.exists(script):
            process = run_component(name, script)
            if process:
                processes[name] = process
                # Start monitoring thread
                thread = threading.Thread(
                    target=monitor_process,
                    args=(name, process),
                    daemon=True
                )
                thread.start()
                threads[name] = thread
        else:
            log(f"❌ Script not found: {script}")
    
    log(f"🎉 Flowstack started with {len(processes)} components")
    log("📋 Components running:")
    for name in processes.keys():
        log(f"   - {name}")
    
    log("\n🔄 Flowstack is now running...")
    log("📧 Email Ingestion Agent: Monitoring invoices@pcsmilesai.com")
    log("📝 Invoice Queue Writer: Watching for new JSON files")
    log("📤 UI Upload Service: Uploading to PCS AI UI")
    log("\n🛑 Press Ctrl+C to stop all components")
    
    try:
        while True:
            time.sleep(10)
            # Check if all processes are still running
            for name, process in processes.items():
                if process.poll() is not None:
                    log(f"⚠️ {name} has stopped unexpectedly")
    except KeyboardInterrupt:
        log("\n🛑 Stopping all components...")
        
        # Stop all processes
        for name, process in processes.items():
            log(f"🛑 Stopping {name}...")
            process.terminate()
            try:
                process.wait(timeout=5)
                log(f"✅ {name} stopped gracefully")
            except subprocess.TimeoutExpired:
                log(f"⚠️ Force killing {name}...")
                process.kill()
        
        log("🎯 Flowstack Orchestrator stopped")

if __name__ == "__main__":
    main() 