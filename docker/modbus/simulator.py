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


def encode_value(raw: float, data_type: str, byte_order: str = 'big', word_order: str = 'big') -> list[int]:
    """Return a list of 16-bit register words representing the value.

    byte_order: 'big' = MSB first within each 16-bit word (standard)
                'little' = LSB first within each 16-bit word
    word_order: 'big' = high word first for 32-bit values (standard)
                'little' = low word first for 32-bit values
    """
    if data_type == "bool":
        return [1 if raw >= 1 else 0]
    if data_type == "16int":
        val = max(-32768, min(32767, int(raw))) & 0xFFFF
        if byte_order == 'little':
            val = ((val & 0xFF) << 8) | ((val >> 8) & 0xFF)
        return [val]
    if data_type == "16uint":
        val = max(0, min(65535, int(raw)))
        if byte_order == 'little':
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
        if byte_order == 'little':
            hi = (b1 << 8) | b0
            lo = (b3 << 8) | b2
        else:
            hi = (b0 << 8) | b1
            lo = (b2 << 8) | b3
        return [lo, hi] if word_order == 'little' else [hi, lo]
    return [int(raw) & 0xFFFF]


def noisy_value(base_raw: float, noise_pct: float) -> int:
    if noise_pct == 0:
        return int(round(base_raw))
    delta = base_raw * (noise_pct / 100.0)
    return int(round(base_raw + random.uniform(-delta, delta)))


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


def write_point(context: ModbusServerContext, unit_id: int, point: dict,
                byte_order: str = 'big', word_order: str = 'big') -> None:
    fc = point["function_code"]
    reg = point["register"]
    raw = noisy_value(point["base_value_raw"], point["noise_pct"])
    words = encode_value(raw, point["data_type"], byte_order, word_order)

    slave = context[unit_id]
    if fc in (1, 5, 15):  # coils
        slave.setValues(1, reg, words)
    elif fc in (2,):       # discrete inputs
        slave.setValues(2, reg, words)
    elif fc in (3, 6, 16): # holding registers
        slave.setValues(3, reg, words)
    elif fc in (4,):       # input registers
        slave.setValues(4, reg, words)


async def av_loop(context: ModbusServerContext, config: dict) -> None:
    """Update analogue points (non-bool) on the AV interval."""
    unit_id = config["unit_id"]
    interval = config.get("av_interval_seconds", 30)
    bo = config.get("byte_order", "big")
    wo = config.get("word_order", "big")
    while True:
        await asyncio.sleep(interval)
        for point in config["points"]:
            if point["data_type"] != "bool":
                write_point(context, unit_id, point, bo, wo)


async def bv_loop(context: ModbusServerContext, config: dict) -> None:
    """Update binary points (bool) on the BV interval."""
    unit_id = config["unit_id"]
    interval = config.get("bv_interval_seconds", 120)
    bo = config.get("byte_order", "big")
    wo = config.get("word_order", "big")
    while True:
        await asyncio.sleep(interval)
        for point in config["points"]:
            if point["data_type"] == "bool":
                point["base_value_raw"] = 1 if random.randint(0, 100) >= 50 else 0
                log.info("Binary register %d → %d", point["register"], point["base_value_raw"])
                write_point(context, unit_id, point, bo, wo)


async def main() -> None:
    config = load_config()
    log.info("Starting Modbus TCP simulator: %s on port %d, unit %d",
             config["device_name"], 502, config["unit_id"])

    context = build_context(config)

    # Write initial clean values (no noise) for all points
    unit_id = config["unit_id"]
    bo = config.get("byte_order", "big")
    wo = config.get("word_order", "big")
    for point in config["points"]:
        words = encode_value(point["base_value_raw"], point["data_type"], bo, wo)
        slave = context[unit_id]
        fc = point["function_code"]
        if fc in (1, 5, 15):
            slave.setValues(1, point["register"], words)
        elif fc in (2,):
            slave.setValues(2, point["register"], words)
        elif fc in (3, 6, 16):
            slave.setValues(3, point["register"], words)
        elif fc in (4,):
            slave.setValues(4, point["register"], words)

    av_task = asyncio.create_task(av_loop(context, config))
    bv_task = asyncio.create_task(bv_loop(context, config))

    await StartAsyncTcpServer(
        context=context,
        address=("0.0.0.0", 502),
    )
    av_task.cancel()
    bv_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
