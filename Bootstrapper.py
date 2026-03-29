import os
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent

def run(cmd, **kw):
    return subprocess.run(cmd, shell=True, cwd=ROOT, **kw)

def check(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True).returncode == 0

print("=" * 40)
print("  Nitron Bootstrapper")
print("=" * 40)

# 1. Check Node
print("\n[1/3] Checking Node.js...")
if not check("node -v"):
    print("  ERROR: Node.js not found.")
    print("  Download: https://nodejs.org")
    input("\nPress Enter to exit...")
    sys.exit(1)
v = subprocess.check_output("node -v", shell=True).decode().strip()
print(f"  OK: Node.js {v}")

# 2. Install deps
print("\n[2/3] Checking dependencies...")
electron_bin = ROOT / "node_modules" / ".bin" / "electron.cmd"
if not electron_bin.exists():
    print("  Running npm install...")
    r = run("npm install --prefer-offline --no-audit --no-fund")
    if r.returncode != 0:
        print("  ERROR: npm install failed.")
        input("\nPress Enter to exit...")
        sys.exit(1)
    print("  OK: Dependencies installed.")
else:
    print("  OK: node_modules found.")

# 3. Launch
print("\n[3/3] Launching Nitron...")
subprocess.Popen(
    [str(electron_bin), "."],
    cwd=ROOT,
    creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
)
print("Nitron is ready! Use npm start to launch!")
print("\nYou can close this window.")
