# docker/bacnet/simulator.py
"""
BACnet/IP simulator using bacpypes3. Reads config.json, creates
BACnet objects for each point, updates present-value every interval.
"""
import asyncio
import json
import logging
import os
import random

from bacpypes3.ipv4.app import NormalApplication
from bacpypes3.local.device import DeviceObject
from bacpypes3.local.analog import AnalogInputObject, AnalogOutputObject, AnalogValueObject
from bacpypes3.local.binary import BinaryInputObject, BinaryOutputObject, BinaryValueObject
from bacpypes3.pdu import Address
from bacpypes3.primitivedata import Real, Boolean

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/app/config.json")

OBJECT_CLASSES = {
    "analogInput":    AnalogInputObject,
    "analogOutput":   AnalogOutputObject,
    "analogValue":    AnalogValueObject,
    "binaryInput":    BinaryInputObject,
    "binaryOutput":   BinaryOutputObject,
    "binaryValue":    BinaryValueObject,
}


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def noisy_value(base_raw: float, noise_pct: float) -> int:
    if noise_pct == 0:
        return int(round(base_raw))
    delta = base_raw * (noise_pct / 100.0)
    return int(round(base_raw + random.uniform(-delta, delta)))


def is_binary(object_type: str) -> bool:
    return object_type in ("binaryInput", "binaryOutput", "binaryValue")


async def main() -> None:
    config = load_config()
    device_name = config["device_name"]
    device_instance = config["device_instance"]
    bacnet_port = 47808

    log.info("Starting BACnet/IP simulator: %s instance=%d port=%d",
             device_name, device_instance, bacnet_port)

    device_obj = DeviceObject(
        objectIdentifier=("device", device_instance),
        objectName=device_name,
        vendorIdentifier=config.get("vendor_id", 999),
        maxApduLengthAccepted=1024,
        segmentationSupported="segmentedBoth",
    )

    app = NormalApplication(device_obj, Address(f"0.0.0.0:{bacnet_port}"))

    # Create BACnet objects for each point
    bac_objects: list[tuple[object, dict]] = []
    for point in config["points"]:
        obj_type = point["object_type"]
        cls = OBJECT_CLASSES.get(obj_type)
        if cls is None:
            log.warning("Unknown object type %s for point %s — skipping", obj_type, point["tag"])
            continue

        init_raw = point["base_value_raw"]
        init_val: Real | Boolean = (
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
        log.info("Registered %s %s (%s) instance=%d",
                 obj_type, point["tag"], point.get("units", "noUnits"), point["object_instance"])

    av_interval = config.get("av_interval_seconds", 30)
    bv_interval = config.get("bv_interval_seconds", 120)

    async def av_loop() -> None:
        """Update analogue BACnet objects on the AV interval."""
        while True:
            await asyncio.sleep(av_interval)
            for obj, point in bac_objects:
                if not is_binary(point["object_type"]):
                    raw = noisy_value(point["base_value_raw"], point["noise_pct"])
                    obj.presentValue = Real(float(raw))

    async def bv_loop() -> None:
        """Update binary BACnet objects on the BV interval."""
        while True:
            await asyncio.sleep(bv_interval)
            for obj, point in bac_objects:
                if is_binary(point["object_type"]):
                    point["base_value_raw"] = 1 if random.randint(0, 100) >= 50 else 0
                    log.info("Binary %s → %d", point["tag"], point["base_value_raw"])
                    obj.presentValue = Boolean(point["base_value_raw"] >= 1)

    asyncio.create_task(av_loop())
    asyncio.create_task(bv_loop())
    log.info("BACnet simulator running. Waiting for requests...")
    await asyncio.get_event_loop().create_future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
