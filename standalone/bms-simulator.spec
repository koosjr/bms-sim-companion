# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['simulator.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=['pymodbus', 'pymodbus.server', 'pymodbus.datastore', 'pymodbus.datastore.context', 'bacpypes3', 'bacpypes3.ipv4', 'bacpypes3.ipv4.app', 'bacpypes3.local.device', 'bacpypes3.local.analog', 'bacpypes3.local.binary', 'bacpypes3.pdu', 'bacpypes3.primitivedata'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='bms-simulator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='NONE',
)
