# docker/modbus/simulator.py
"""
Modbus TCP simulator. Reads config.json, populates registers/coils,
updates values every update_interval_seconds with noise.
"""
import asyncio
import json
import logging
import os
import random
import struct

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusSlaveContext,
    ModbusServerContext,
)
from pymodbus.server import StartAsyncTcpServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/app/config.json")


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def encode_value(raw: float, data_type: str) -> list[int]:
    """Return a list of 16-bit register words representing the value."""
    if data_type == "bool":
        return [1 if raw >= 1 else 0]
    if data_type == "16int":
        val = max(-32768, min(32767, int(raw)))
        return [val & 0xFFFF]
    if data_type == "16uint":
        val = max(0, min(65535, int(raw)))
        return [val & 0xFFFF]
    if data_type in ("32float", "32int", "32uint"):
        if data_type == "32float":
            packed = struct.pack(">f", float(raw))
        elif data_type == "32int":
            packed = struct.pack(">i", int(raw))
        else:
            packed = struct.pack(">I", max(0, int(raw)))
        hi = (packed[0] << 8) | packed[1]
        lo = (packed[2] << 8) | packed[3]
        return [hi, lo]
    return [int(raw) & 0xFFFF]


def noisy_value(base_raw: float, noise_pct: float) -> float:
    if noise_pct == 0:
        return base_raw
    delta = base_raw * (noise_pct / 100.0)
    return base_raw + random.uniform(-delta, delta)


def build_context(config: dict) -> ModbusServerContext:
    # Allocate large blocks; individual registers written by address
    coils    = ModbusSequentialDataBlock(0, [0] * 10000)
    discrete = ModbusSequentialDataBlock(0, [0] * 10000)
    holding  = ModbusSequentialDataBlock(0, [0] * 10000)
    input_r  = ModbusSequentialDataBlock(0, [0] * 10000)

    slave = ModbusSlaveContext(
        di=discrete, co=coils, hr=holding, ir=input_r
    )
    return ModbusServerContext(slaves={config["unit_id"]: slave}, single=False)


def write_point(context: ModbusServerContext, unit_id: int, point: dict) -> None:
    fc = point["function_code"]
    reg = point["register"]
    raw = noisy_value(point["base_value_raw"], point["noise_pct"])
    words = encode_value(raw, point["data_type"])

    slave = context[unit_id]
    if fc in (1, 5, 15):  # coils
        slave.setValues(1, reg, words)
    elif fc in (2,):       # discrete inputs
        slave.setValues(2, reg, words)
    elif fc in (3, 6, 16): # holding registers
        slave.setValues(3, reg, words)
    elif fc in (4,):       # input registers
        slave.setValues(4, reg, words)


async def update_loop(context: ModbusServerContext, config: dict) -> None:
    unit_id = config["unit_id"]
    interval = config.get("update_interval_seconds", 5)
    while True:
        for point in config["points"]:
            write_point(context, unit_id, point)
        await asyncio.sleep(interval)


async def main() -> None:
    config = load_config()
    log.info("Starting Modbus TCP simulator: %s on port %d, unit %d",
             config["device_name"], 502, config["unit_id"])

    context = build_context(config)

    # Write initial values
    for point in config["points"]:
        write_point(context, config["unit_id"], point)

    update_task = asyncio.create_task(update_loop(context, config))

    await StartAsyncTcpServer(
        context=context,
        address=("0.0.0.0", 502),
    )
    update_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
