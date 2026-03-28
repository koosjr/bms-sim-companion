# E2E Integration Test Notes

Verified 2026-03-28.

## Modbus (bms-modbus-sim:latest)
- Holds registers for AI/AO points (FC3), coils for DI/DO (FC1)
- SA Temp register 100 returns ~140 (14.0°C × scale 10) ✅
- CW Valve register 200 returns ~750 (75% × scale 10) ✅  
- Fan Running coil 0 returns True ✅

## BACnet (bms-bacnet-sim:latest)
- API used: NormalApplication + DeviceObject (bacpypes3 0.0.102)
- Registers analogInput and binaryInput objects on startup ✅
- Serves on UDP 47808 ✅

## docker-compose (macvlan) structure validated
- Each device gets its own container + config.json
- For Pi deployment: replace bridge networking with macvlan as in generated docker-compose.yml
