#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Build a .deb package for Raspberry Pi / Debian / Ubuntu
#
# Prerequisites (on the build machine):
#   sudo apt install python3 python3-pip python3-venv dpkg-dev
#   pip3 install pymodbus bacpypes3
#
# Usage:
#   chmod +x build_deb.sh
#   ./build_deb.sh                # builds bms-simulator_1.0_armhf.deb
#   ./build_deb.sh 1.2            # set version to 1.2
#
# Install on Pi:
#   sudo dpkg -i bms-simulator_1.0_armhf.deb
#   sudo systemctl enable bms-simulator
#   sudo systemctl start bms-simulator
#
# The service looks for config*.json in /opt/bms-simulator/
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="${1:-1.0}"
PKG_NAME="bms-simulator"
ARCH="all"    # pure Python — runs on any arch
BUILD_DIR="build_deb_pkg"

echo "Building ${PKG_NAME}_${VERSION}_${ARCH}.deb ..."

rm -rf "$BUILD_DIR"

# ── Directory structure ──
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/opt/bms-simulator"
mkdir -p "$BUILD_DIR/etc/systemd/system"

# ── Copy simulator ──
cp simulator.py "$BUILD_DIR/opt/bms-simulator/simulator.py"
chmod 755       "$BUILD_DIR/opt/bms-simulator/simulator.py"

# ── DEBIAN/control ──
cat > "$BUILD_DIR/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Depends: python3 (>= 3.9), python3-pip
Maintainer: BMS Hub <support@bmshub.co.za>
Description: BMS Modbus/BACnet point simulator
 Standalone simulator for building management systems.
 Reads config*.json files and exposes Modbus TCP and/or
 BACnet/IP endpoints with realistic simulated values.
EOF

# ── DEBIAN/postinst — install pip deps on first install ──
cat > "$BUILD_DIR/DEBIAN/postinst" <<'EOF'
#!/bin/bash
set -e
echo "Installing Python dependencies..."
pip3 install --break-system-packages pymodbus bacpypes3 2>/dev/null \
  || pip3 install pymodbus bacpypes3
echo "BMS Simulator installed to /opt/bms-simulator/"
echo "Place your config*.json files in /opt/bms-simulator/"
echo "Then: sudo systemctl enable --now bms-simulator"
EOF
chmod 755 "$BUILD_DIR/DEBIAN/postinst"

# ── systemd service ──
cat > "$BUILD_DIR/etc/systemd/system/bms-simulator.service" <<EOF
[Unit]
Description=BMS Modbus/BACnet Simulator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/bms-simulator
ExecStart=/usr/bin/python3 /opt/bms-simulator/simulator.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── Build .deb ──
dpkg-deb --build "$BUILD_DIR" "${PKG_NAME}_${VERSION}_${ARCH}.deb"

rm -rf "$BUILD_DIR"

echo ""
echo "================================================"
echo "  BUILD SUCCESSFUL"
echo "  Output: ${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo ""
echo "  Install on Pi:"
echo "    sudo dpkg -i ${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo "    # copy config*.json to /opt/bms-simulator/"
echo "    sudo systemctl enable --now bms-simulator"
echo "================================================"
