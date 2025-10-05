import subprocess
import os
import sys
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Allow only localhost origins
origins = [
    "http://localhost:8990",
    "http://127.0.0.1:8990"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# List of supported BMW commands that require VIN
ALLOWED_COMMANDS = [
    "charge", "climate", "lock", "unlock", "flash", "honk",
    "info", "status", "trips", "charging"
]

def bmw_login():
    try:
        print("Attempting to log in to BMW API...")
        result = subprocess.check_output(["bmw", "login"])
        print("Login successful.")
    except subprocess.CalledProcessError as e:
        print(f"Login failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

def execute_command(command_list, check_output=True):
    try:
        print(f"Executing command: {command_list}")
        result = subprocess.check_output(command_list, stderr=subprocess.STDOUT)
        output = result.decode()
        print(f"Command output: {output}")

        # Check for BMW API blocking (489 status)
        if "Blocked" in output or "489" in output:
            print(f"BMW API blocked the request")
            return {"status": "failed", "output": output, "error": "BMW API blocked (rate limited or region restricted)"}

        # For commands that modify state, check for success indicators
        # For read-only commands (list, status, info), successful execution means success
        if check_output:
            status = "success" if "Success" in output or "EXECUTED" in output else "failed"
        else:
            # If command executed without exception, it's successful
            status = "success"
        return {"status": status, "output": output}
    except subprocess.CalledProcessError as e:
        print(f"Command failed with error: {e.output.decode()}")
        return {"status": "failed", "output": e.output.decode(), "error": str(e)}

@app.post("/bmw/{command}/{vin}")
async def control_bmw(command: str, vin: str):
    print(f"Received command: {command} for VIN: {vin}")
    if command not in ALLOWED_COMMANDS:
        print(f"Invalid command: {command}")
        raise HTTPException(status_code=400, detail="Invalid command")
    print("Logging in...")
    bmw_login()
    cmd = ["bmw", command, vin]
    print(f"Command to execute: {cmd}")

    # Read-only commands don't need output validation
    read_only_commands = ["info", "status", "trips", "charging"]
    check_output = command not in read_only_commands

    result = execute_command(cmd, check_output=check_output)
    print(f"Result from execute_command: {result}")

    # Return proper HTTP error code if command failed
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result)

    return result

@app.get("/bmw/list")
async def list_vehicles():
    print("Received request to list vehicles.")
    bmw_login()
    print("Logged in successfully. Executing 'bmw list' command.")
    result = execute_command(["bmw", "list"], check_output=False)
    print(f"Result from list command: {result}")

    # Return proper HTTP error code if command failed
    if result.get("status") == "failed":
        raise HTTPException(status_code=500, detail=result)

    return result
    
def execute_mitsubishi_command(command_list):
    try:
        print(f"Executing Mitsubishi command: {command_list}")
        result = subprocess.check_output(command_list, stderr=subprocess.STDOUT, text=True)
        print(f"Command output: {result}")
        return {"status": "success", "output": result}
    except subprocess.CalledProcessError as e:
        print(f"Mitsubishi command failed with error: {e.output}")
        raise HTTPException(status_code=500, detail={"status": "failed", "output": e.output, "error": str(e)})

@app.get("/mitsubishi/status")
def mitsubishi_status():
    try:
        return {
            "battery": subprocess.check_output(["phevctl", "battery"], stderr=subprocess.STDOUT, text=True),
            "chargestatus": subprocess.check_output(["phevctl", "chargestatus"], stderr=subprocess.STDOUT, text=True),
            "lockstatus": subprocess.check_output(["phevctl", "lockstatus"], stderr=subprocess.STDOUT, text=True),
            "hvac": subprocess.check_output(["phevctl", "hvac"], stderr=subprocess.STDOUT, text=True),
        }
    except subprocess.CalledProcessError as e:
        print(f"Mitsubishi status failed with error: {e.output}")
        raise HTTPException(status_code=500, detail={"status": "failed", "output": e.output, "error": str(e)})

@app.get("/mitsubishi/battery")
def mitsubishi_battery():
    result = execute_mitsubishi_command(["phevctl", "battery"])
    return result["output"]

@app.get("/mitsubishi/chargestatus")
def mitsubishi_chargestatus():
    result = execute_mitsubishi_command(["phevctl", "chargestatus"])
    return result["output"]

@app.get("/mitsubishi/lockstatus")
def mitsubishi_lockstatus():
    result = execute_mitsubishi_command(["phevctl", "lockstatus"])
    return result["output"]

@app.get("/mitsubishi/hvac")
def mitsubishi_hvac():
    result = execute_mitsubishi_command(["phevctl", "hvac"])
    return result["output"]

@app.post("/mitsubishi/aircon/{state}")
def mitsubishi_aircon(state: str):
    result = execute_mitsubishi_command(["phevctl", "aircon", state])
    return result

@app.post("/mitsubishi/acmode/{mode}/{minutes}")
def mitsubishi_acmode(mode: str, minutes: int):
    result = execute_mitsubishi_command(["phevctl", "acmode", mode, str(minutes)])
    return result

@app.get("/api/healthcheck")
def healthcheck():
    return {"status": "ok"}

@app.post("/api/reboot")
def reboot_system():
    try:
        subprocess.Popen(["sudo", "systemctl", "reboot"])
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "failed", "error": str(e)})

@app.post("/api/update")
def update_app():
    try:
        # Git pull
        result = subprocess.run(
            ["sudo", "git", "-C", "/home/pi/home-display", "pull", "--rebase"],
            check=True,
            capture_output=True,
            text=True
        )
        print(f"Git pull output: {result.stdout}")

        # Restart service
        subprocess.run(["sudo", "systemctl", "restart", "uvicorn.service"], check=True)
        return {"status": "ok"}
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr if e.stderr else str(e)
        print(f"Update failed: {error_msg}")
        raise HTTPException(status_code=500, detail={"status": "failed", "error": error_msg})
    except Exception as e:
        error_msg = str(e)
        print(f"Update failed: {error_msg}")
        raise HTTPException(status_code=500, detail={"status": "failed", "error": error_msg})

@app.post("/api/kill-browser")
def kill_browser():
    try:
        subprocess.run(["pkill", "-TERM", "chromium-browser"])
        subprocess.run(["pkill", "-TERM", "chromium"])
        time.sleep(1)
        subprocess.run(["pkill", "-KILL", "chromium-browser"])
        subprocess.run(["pkill", "-KILL", "chromium"])
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "failed", "error": str(e)})

# Mount static files after API routes
app.mount("/", StaticFiles(directory="static", html=True), name="static")
