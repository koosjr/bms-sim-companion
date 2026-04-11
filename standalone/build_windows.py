#!/usr/bin/env python3
"""
Build script — creates a standalone Windows .exe using PyInstaller.

Usage:
    pip install pyinstaller pymodbus bacpypes3
    python build_windows.py

Output:
    dist/bms-simulator.exe
"""
import subprocess
import sys

def main():
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "bms-simulator",
        "--console",                    # keep console for log output
        "--icon", "NONE",               # no custom icon (add .ico later if desired)
        "--clean",
        # Hidden imports that PyInstaller may miss
        "--hidden-import", "pymodbus",
        "--hidden-import", "pymodbus.server",
        "--hidden-import", "pymodbus.datastore",
        "--hidden-import", "pymodbus.datastore.context",
        "--hidden-import", "bacpypes3",
        "--hidden-import", "bacpypes3.ipv4",
        "--hidden-import", "bacpypes3.ipv4.app",
        "--hidden-import", "bacpypes3.local.device",
        "--hidden-import", "bacpypes3.local.analog",
        "--hidden-import", "bacpypes3.local.binary",
        "--hidden-import", "bacpypes3.pdu",
        "--hidden-import", "bacpypes3.primitivedata",
        "simulator.py",
    ]

    print("Building bms-simulator.exe ...")
    print(" ".join(cmd))
    result = subprocess.run(cmd, cwd=".")
    if result.returncode != 0:
        print("Build FAILED.")
        sys.exit(1)

    print()
    print("=" * 50)
    print("  BUILD SUCCESSFUL")
    print("  Output: dist/bms-simulator.exe")
    print()
    print("  To ship to a contractor, zip:")
    print("    dist/bms-simulator.exe")
    print("    config_<device>.json  (one per device)")
    print("=" * 50)


if __name__ == "__main__":
    main()
