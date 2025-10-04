import subprocess
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

def execute_command(command_list):
    try:
        print(f"Executing command: {command_list}")
        result = subprocess.check_output(command_list, stderr=subprocess.STDOUT)
        output = result.decode()
        print(f"Command output: {output}")

        # Determine success or failure from the output
        status = "success" if "Success" in output or "EXECUTED" in output else "failed"
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
    result = execute_command(cmd)
    print(f"Result from execute_command: {result}")
    return result

@app.get("/bmw/list")
async def list_vehicles():
    print("Received request to list vehicles.")
    bmw_login()
    print("Logged in successfully. Executing 'bmw list' command.")
    result = execute_command(["bmw", "list"])
    print(f"Result from list command: {result}")
    return result
    
@app.get("/mitsubishi/status")
def mitsubishi_status():
    return {
        "battery": subprocess.check_output(["phevctl", "battery"], text=True),
        "chargestatus": subprocess.check_output(["phevctl", "chargestatus"], text=True),
        "lockstatus": subprocess.check_output(["phevctl", "lockstatus"], text=True),
        "hvac": subprocess.check_output(["phevctl", "hvac"], text=True),
    }

@app.get("/mitsubishi/battery")
def mitsubishi_battery():
    return subprocess.check_output(["phevctl", "battery"], text=True)

@app.get("/mitsubishi/chargestatus")
def mitsubishi_chargestatus():
    return subprocess.check_output(["phevctl", "chargestatus"], text=True)

@app.get("/mitsubishi/lockstatus")
def mitsubishi_lockstatus():
    return subprocess.check_output(["phevctl", "lockstatus"], text=True)

@app.get("/mitsubishi/hvac")
def mitsubishi_hvac():
    return subprocess.check_output(["phevctl", "hvac"], text=True)

@app.post("/mitsubishi/aircon/{state}")
def mitsubishi_aircon(state: str):
    return subprocess.check_output(["phevctl", "aircon", state], text=True)

@app.post("/mitsubishi/acmode/{mode}/{minutes}")
def mitsubishi_acmode(mode: str, minutes: int):
    return subprocess.check_output(["phevctl", "acmode", mode, str(minutes)], text=True)

# Mount static files after API routes
app.mount("/", StaticFiles(directory="static", html=True), name="static")
