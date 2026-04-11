#!/usr/bin/env python3
"""
BMS Standalone Simulator
========================
Reads one or more config_*.json files from its own directory and starts
a Modbus TCP and/or BACnet/IP simulator for each device.

Usage:
    simulator.exe                       # auto-discovers all config_*.json
    simulator.exe config_chiller.json   # run a specific config only

No Python, Docker, or ThingsBoard required on the target machine.
"""
import asyncio
import json
import glob
import logging
import os
import random
import struct
import sys
import signal
from pathlib import Path

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("bms-sim")


# =====================================================================
#  Shared helpers
# =====================================================================

def noisy_value(base_raw: float, noise_pct: float) -> int:
    """Return base value with random noise, always as integer."""
    if noise_pct == 0:
        return int(round(base_raw))
    delta = base_raw * (noise_pct / 100.0)
    return int(round(base_raw + random.uniform(-delta, delta)))


# =====================================================================
#  Modbus simulator
# =====================================================================

def encode_value(raw: float, data_type: str,
                 byte_order: str = "big", word_order: str = "big") -> list[int]:
    """Return a list of 16-bit register words representing the value."""
    if data_type == "bool":
        return [1 if raw >= 1 else 0]
    if data_type == "16int":
        val = max(-32768, min(32767, int(raw))) & 0xFFFF
        if byte_order == "little":
            val = ((val & 0xFF) << 8) | ((val >> 8) & 0xFF)
        return [val]
    if data_type == "16uint":
        val = max(0, min(65535, int(raw)))
        if byte_order == "little":
            val = ((val & 0xFF) << 8) | ((val >> 8) & 0xFF)
        return [val]
    if data_type in ("32float", "32int", "32uint"):
        if data_type == "32float":
            packed = struct.pack(">f", float(raw))
        elif data_type == "32int":
            packed = struct.pack(">i", int(raw))
        else:
            packed = struct.pack(">I", max(0, int(raw)))
        b0, b1, b2, b3 = packed[0], packed[1], packed[2], packed[3]
        if byte_order == "little":
            hi = (b1 << 8) | b0
            lo = (b3 << 8) | b2
        else:
            hi = (b0 << 8) | b1
            lo = (b2 << 8) | b3
        return [lo, hi] if word_order == "little" else [hi, lo]
    return [int(raw) & 0xFFFF]


async def run_modbus_device(config: dict) -> None:
    """Start a Modbus TCP simulator for one device."""
    from pymodbus.datastore import ModbusSequentialDataBlock
    try:
        # pymodbus >= 3.7
        from pymodbus.datastore.context import ModbusDeviceContext as _Ctx, ModbusServerContext
        _CTX_KW = "devices"
    except ImportError:
        # pymodbus 3.6.x
        from pymodbus.datastore import ModbusSlaveContext as _Ctx, ModbusServerContext
        _CTX_KW = "slaves"
    from pymodbus.server import StartAsyncTcpServer

    device_name = config["device_name"]
    unit_id = config["unit_id"]
    bind_ip = config.get("ip_address", "0.0.0.0")
    port = config.get("port", 502)
    bo = config.get("byte_order", "big")
    wo = config.get("word_order", "big")

    log.info("MODBUS  %-30s  %s:%d  unit=%d  byte=%s  word=%s",
             device_name, bind_ip, port, unit_id, bo, wo)

    coils    = ModbusSequentialDataBlock(0, [0] * 10000)
    discrete = ModbusSequentialDataBlock(0, [0] * 10000)
    holding  = ModbusSequentialDataBlock(0, [0] * 10000)
    input_r  = ModbusSequentialDataBlock(0, [0] * 10000)

    slave = _Ctx(di=discrete, co=coils, hr=holding, ir=input_r)
    context = ModbusServerContext(**{_CTX_KW: {unit_id: slave}}, single=False)

    # Write initial clean values
    for point in config["points"]:
        words = encode_value(point["base_value_raw"], point["data_type"], bo, wo)
        fc = point["function_code"]
        if fc in (1, 5, 15):
            slave.setValues(1, point["register"], words)
        elif fc in (2,):
            slave.setValues(2, point["register"], words)
        elif fc in (3, 6, 16):
            slave.setValues(3, point["register"], words)
        elif fc in (4,):
            slave.setValues(4, point["register"], words)

    for point in config["points"]:
        log.info("  %-40s  reg=%-5d  type=%-8s  base_raw=%s",
                 point["tag"], point["register"], point["data_type"],
                 point["base_value_raw"])

    def write_point(point: dict) -> None:
        fc = point["function_code"]
        reg = point["register"]
        raw = noisy_value(point["base_value_raw"], point["noise_pct"])
        words = encode_value(raw, point["data_type"], bo, wo)
        if fc in (1, 5, 15):
            slave.setValues(1, reg, words)
        elif fc in (2,):
            slave.setValues(2, reg, words)
        elif fc in (3, 6, 16):
            slave.setValues(3, reg, words)
        elif fc in (4,):
            slave.setValues(4, reg, words)

    async def av_loop() -> None:
        interval = config.get("av_interval_seconds", 30)
        while True:
            await asyncio.sleep(interval)
            for point in config["points"]:
                if point["data_type"] != "bool":
                    write_point(point)

    async def bv_loop() -> None:
        interval = config.get("bv_interval_seconds", 120)
        while True:
            await asyncio.sleep(interval)
            for point in config["points"]:
                if point["data_type"] == "bool":
                    point["base_value_raw"] = 1 if random.randint(0, 100) >= 50 else 0
                    write_point(point)

    asyncio.create_task(av_loop())
    asyncio.create_task(bv_loop())

    await StartAsyncTcpServer(context=context, address=(bind_ip, port))


# =====================================================================
#  BACnet simulator
# =====================================================================

async def run_bacnet_device(config: dict) -> None:
    """Start a BACnet/IP simulator for one device."""
    from bacpypes3.ipv4.app import NormalApplication
    from bacpypes3.local.device import DeviceObject
    from bacpypes3.local.analog import (
        AnalogInputObject, AnalogOutputObject, AnalogValueObject,
    )
    from bacpypes3.local.binary import (
        BinaryInputObject, BinaryOutputObject, BinaryValueObject,
    )
    from bacpypes3.pdu import Address
    from bacpypes3.primitivedata import Real, Boolean

    OBJECT_CLASSES = {
        "analogInput":  AnalogInputObject,
        "analogOutput": AnalogOutputObject,
        "analogValue":  AnalogValueObject,
        "binaryInput":  BinaryInputObject,
        "binaryOutput": BinaryOutputObject,
        "binaryValue":  BinaryValueObject,
    }

    device_name = config["device_name"]
    device_instance = config["device_instance"]
    bind_ip = config.get("ip_address", "0.0.0.0")
    port = config.get("bacnet_port", 47808)

    log.info("BACNET  %-30s  %s:%d  instance=%d",
             device_name, bind_ip, port, device_instance)

    device_obj = DeviceObject(
        objectIdentifier=("device", device_instance),
        objectName=device_name,
        vendorIdentifier=config.get("vendor_id", 999),
        maxApduLengthAccepted=1024,
        segmentationSupported="segmentedBoth",
    )

    app = NormalApplication(device_obj, Address(f"{bind_ip}:{port}"))

    def is_binary(obj_type: str) -> bool:
        return obj_type in ("binaryInput", "binaryOutput", "binaryValue")

    bac_objects: list[tuple[object, dict]] = []
    for point in config["points"]:
        obj_type = point["object_type"]
        cls = OBJECT_CLASSES.get(obj_type)
        if cls is None:
            log.warning("Unknown object type %s for %s — skipping",
                        obj_type, point["tag"])
            continue

        init_raw = point["base_value_raw"]
        init_val = (
            Boolean(init_raw >= 1) if is_binary(obj_type) else Real(float(init_raw))
        )

        obj = cls(
            objectIdentifier=(obj_type, point["object_instance"]),
            objectName=point["tag"],
            description=point.get("description", ""),
            presentValue=init_val,
        )
        if hasattr(obj, "units") and not is_binary(obj_type):
            obj.units = point.get("units", "noUnits")

        app.add_object(obj)
        bac_objects.append((obj, point))
        log.info("  %-40s  instance=%-5d  type=%-14s  base_raw=%s",
                 point["tag"], point["object_instance"], obj_type,
                 point["base_value_raw"])

    av_interval = config.get("av_interval_seconds", 30)
    bv_interval = config.get("bv_interval_seconds", 120)

    async def av_loop() -> None:
        while True:
            await asyncio.sleep(av_interval)
            for obj, point in bac_objects:
                if not is_binary(point["object_type"]):
                    raw = noisy_value(point["base_value_raw"], point["noise_pct"])
                    obj.presentValue = Real(float(raw))

    async def bv_loop() -> None:
        while True:
            await asyncio.sleep(bv_interval)
            for obj, point in bac_objects:
                if is_binary(point["object_type"]):
                    point["base_value_raw"] = 1 if random.randint(0, 100) >= 50 else 0
                    obj.presentValue = Boolean(point["base_value_raw"] >= 1)

    asyncio.create_task(av_loop())
    asyncio.create_task(bv_loop())

    await asyncio.get_event_loop().create_future()  # run forever


# =====================================================================
#  Config discovery & main
# =====================================================================

def find_configs() -> list[str]:
    """Find config files — either from CLI args or auto-discover."""
    if len(sys.argv) > 1:
        return sys.argv[1:]

    # Look next to the executable (PyInstaller) or script
    if getattr(sys, "frozen", False):
        base_dir = Path(sys.executable).parent
    else:
        base_dir = Path(__file__).parent

    configs = sorted(base_dir.glob("config*.json"))
    if not configs:
        log.error("No config*.json files found in %s", base_dir)
        log.error("Place config files next to the simulator executable.")
        sys.exit(1)

    return [str(c) for c in configs]


def print_banner(configs: list[dict]) -> None:
    modbus_count = sum(1 for c in configs if c.get("protocol") == "modbus")
    bacnet_count = sum(1 for c in configs if c.get("protocol") == "bacnet")
    total_points = sum(len(c.get("points", [])) for c in configs)

    print()
    print("=" * 60)
    print("  BMS Simulator")
    print("=" * 60)
    print(f"  Devices : {len(configs)}  "
          f"({modbus_count} Modbus, {bacnet_count} BACnet)")
    print(f"  Points  : {total_points}")
    print("-" * 60)
    for cfg in configs:
        proto = cfg.get("protocol", "?").upper()
        name = cfg.get("device_name", "?")
        ip = cfg.get("ip_address", "0.0.0.0")
        if proto == "MODBUS":
            port = cfg.get("port", 502)
            uid = cfg.get("unit_id", 1)
            print(f"  [{proto:6s}]  {name:<30s}  {ip}:{port}  unit={uid}")
        else:
            inst = cfg.get("device_instance", 0)
            port = cfg.get("bacnet_port", 47808)
            print(f"  [{proto:6s}]  {name:<30s}  {ip}:{port}  instance={inst}")
    print("-" * 60)
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    print()


async def run_all(configs: list[dict]) -> None:
    """Launch all device simulators concurrently."""
    tasks = []
    for cfg in configs:
        proto = cfg.get("protocol", "modbus")
        if proto == "modbus":
            tasks.append(asyncio.create_task(run_modbus_device(cfg)))
        elif proto == "bacnet":
            tasks.append(asyncio.create_task(run_bacnet_device(cfg)))
        else:
            log.warning("Unknown protocol '%s' for %s — skipping",
                        proto, cfg.get("device_name", "?"))

    if not tasks:
        log.error("No valid device configs found.")
        sys.exit(1)

    await asyncio.gather(*tasks)


def main() -> None:
    config_paths = find_configs()
    configs = []
    for path in config_paths:
        try:
            with open(path) as f:
                cfg = json.load(f)
            cfg["_source_file"] = path
            configs.append(cfg)
            log.info("Loaded config: %s (%s — %s)",
                     path, cfg.get("device_name", "?"),
                     cfg.get("protocol", "?"))
        except Exception as e:
            log.error("Failed to load %s: %s", path, e)

    if not configs:
        log.error("No valid configs loaded. Exiting.")
        sys.exit(1)

    print_banner(configs)

    try:
        asyncio.run(run_all(configs))
    except KeyboardInterrupt:
        print("\nSimulator stopped.")


if __name__ == "__main__":
    main()
