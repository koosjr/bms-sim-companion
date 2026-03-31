# Supplier File Importer — Design Spec

**Project:** BMS Simulator Companion
**Date:** 2026-03-31
**Status:** Approved for implementation

---

## 1. Overview

A browser-side import wizard that reads a supplier's Modbus or BACnet point list (CSV or XLSX), maps columns to simulator fields, and saves a fully-populated **Assembly** to the Assembly Library. No server required. No changes to the existing 5-step workflow — steps ②–⑤ just gain a richer starting point.

### New app flow

```
⓪ Supplier Import (NEW)  →  ① Device Setup (load assembly)  →  ② Map Points  →  ③ Sim Values  →  ④ Generate
```

The importer is a **standalone tab** in the app nav, available at any time alongside the existing workflow.

---

## 2. Supported input formats

| Format | Details |
|--------|---------|
| `.csv` | Single sheet, any delimiter (comma or semicolon auto-detected) |
| `.xlsx` | Single or multi-sheet; if multi-sheet, user selects which sheet to import |
| Protocol | Auto-detected from column names; user can override |

### Files analysed during design

| File | Protocol | Format | Rows |
|------|----------|--------|------|
| Condair_Modbus_Points.csv | Modbus | CSV | 203 |
| DSE_GenComm_Modbus_Points_list_koos.csv | Modbus | CSV | 134 |
| Gree_VRF_BACnet_Points.csv | BACnet | CSV | 137 |
| Condair_BACnet_Points.xlsx | BACnet | XLSX (4 sheets) | 40–61/sheet |
| Daikin_EWYT-B_BACnet_Points.xlsx | BACnet | XLSX (2 sheets) | 174 |

---

## 3. The 3-step wizard

### Step 1 — Upload & Detect

- Drag-drop or file-picker for `.csv` / `.xlsx`
- SheetJS (`xlsx` npm package) parses file in-browser
- If XLSX has multiple sheets → show sheet selector tabs
- Auto-detect protocol from column names (see §6)
- User can override detected protocol
- Show detected row count and column list for confirmation

### Step 2 — Map Columns

A table of **target fields** (left) with clickable **source column pills** (right).

| Target field | Required | Notes |
|---|---|---|
| Point Name | ✓ | Used as `tag` in SimPoint |
| Register / Instance | ✓ | Address column; base corrected at export |
| Function Code | Modbus only | Defaults to FC3 if not mapped |
| Data Type | Modbus only | Defaults to `16uint` if not mapped |
| Scale Factor | optional | Defaults to `1` |
| Units | optional | Mapped to BACnet units enum where possible |
| Object Type | BACnet only | Normalised from supplier shorthand |
| R/W Access | optional | Stored as metadata on SimPoint; all points imported regardless of access type |

- Auto-detection pre-fills matches using column name heuristics (see §6)
- When multiple columns match the same field, all shown as pills; best match pre-selected
- Optional fields show a "skip" pill if no column matched
- User names the assembly before proceeding to Step 3

### Step 3 — Preview & Save

- Table shows all imported rows with mapped values
- **Address base toggle `[0] [1]`** in the table header (default: `0`)
- Invalid rows flagged in red (missing name or address); still saved but highlighted
- Assembly name editable
- Save → adds to Assembly Library → navigates to Device Setup with new assembly highlighted

---

## 4. Address base toggle

**Principle:** the screen always shows the raw imported value. The toggle is a silent export correction.

| Toggle | Meaning | Exported value |
|--------|---------|---------------|
| `0` (default) | source is already 0-based | `address` as imported |
| `1` | source is 1-based | `address − 1` |

- Default is `0` — assume 0-based unless corrected
- Toggle stored on the assembly (`addressBase: 0 | 1`)
- Applies to both Modbus `register` and BACnet `object_instance`
- Correction applied at export time (simulator config + ThingsBoard JSON)
- Stored on `DeviceAssembly.addressBase`; when assembly is loaded into a device, the value transfers to `SimDevice.addressBase`
- Toggle visible in Map Points tab as a per-device setting (allows correction after initial import)

---

## 5. Data type normalisation

### Modbus

| Supplier value | Stored `data_type` |
|---|---|
| `Float32`, `FLOAT`, `float` | `32float` |
| `UInt16`, `UINT16`, `uint16` | `16uint` |
| `Int16`, `INT16`, `int16` | `16int` |
| `UInt32`, `UINT32` | `32uint` |
| `Int32`, `INT32` | `32int` |
| `BOOL`, `bool`, `Bit`, `bit` | `bool` |
| anything else | `16uint` (flagged as unrecognised) |

**32-bit register pairs:** Some suppliers append `_HI` / `_LW` (or `_HIGH` / `_LOW`) to the data type column to indicate the high and low word registers of a 32-bit value (e.g. `UINT32_HI`, `INT32_LW`). These suffixes are stripped before type lookup — the stored `data_type` is simply `32uint` or `32int`. The `_LW` row is skipped; the `_HI` row becomes one SimPoint consuming 2 registers (`object_count: 2`).

Word order and byte order are **not** determined from the data type column — they are device-level settings configured in Device Setup and apply uniformly to all 32-bit points on that device.

### BACnet object types

| Supplier value | Stored `object_type` |
|---|---|
| `AI`, `AnalogInput` | `analogInput` |
| `AO`, `AnalogOutput` | `analogOutput` |
| `AV`, `AnalogValue` | `analogValue` |
| `BI`, `BinaryInput` | `binaryInput` |
| `BO`, `BinaryOutput` | `binaryOutput` |
| `BV`, `BinaryValue` | `binaryValue` |
| `MV`, `MSV`, `MI`, `MultiState` | `multiStateValue` |
| `DEV` | **skip row** (device object, not a point) |

**Formula-based instances** (e.g. Gree `(N-1)*256+131072`): evaluated with N=1 for the assembly default. The formula string is stored in `description` for reference.

---

## 6. Auto-detection heuristics

### Protocol detection (from column names)

- **Modbus** if any column matches: `register`, `address`, `fc`, `function_code`, `modbus`
- **BACnet** if any column matches: `object`, `instance`, `bacnet`
- If ambiguous → show protocol selector, no pre-selection

### Column → field matching (case-insensitive, partial match)

| Target field | Matched patterns | Protocol |
|---|---|---|
| Point Name | `name`, `description`, `object name`, `parameter`, `parameter_name` | Both |
| Register / Instance | `register`, `address`, `instance`, `object_id`, `offset`, `addr` | Both |
| Function Code | `fc`, `function_code`, `function code` | Modbus only |
| Data Type | `data_type`, `data type`, `format` | Modbus only |
| Scale Factor | `scale`, `scale_factor`, `multiplier`, `factor` | Both |
| Units | `units`, `unit`, `eng_range` (extract trailing unit suffix) | Both |
| Object Type | `object_type`, `object type`, `type` | BACnet only |
| R/W Access | `access`, `r/w`, `rw`, `read_write` | Both |

Note: `type` and `format` only matched for Data Type in Modbus mode; `type` only matched for Object Type in BACnet mode. This prevents the same column matching two fields.

---

## 7. Data model changes

### `DeviceAssembly` — two new optional fields

```typescript
interface DeviceAssembly {
  id: string;
  name: string;
  description?: string;
  protocol: Protocol;
  savedAt: string;
  points: SimPoint[];
  addressBase?: 0 | 1;   // NEW — 0 = as-imported, 1 = subtract 1 at export
  sourceFile?: string;   // NEW — original filename for traceability
}
```

`SimPoint` is unchanged — it already carries all required fields (`register`, `function_code`, `data_type`, `scale`, `object_type`, `object_instance`, `units`).

---

## 8. New files

| File | Purpose |
|---|---|
| `src/components/SupplierImportTab.tsx` | 3-step wizard UI component |
| `src/lib/supplierImport.ts` | Parsing, mapping, normalisation logic |
| `src/lib/columnDetector.ts` | Auto-detection heuristics |

### New dependency

```
xlsx  (SheetJS community edition)
```

Handles CSV and XLSX parsing entirely in-browser. ~500 KB gzipped. No server required.

---

## 9. Scope

### In scope (v1)

- CSV and XLSX import
- Multi-sheet XLSX with sheet selector
- Modbus and BACnet protocols
- Auto column detection with manual override
- Address base `0/1` toggle — export correction only, screen unchanged
- Data type normalisation across all 5 known supplier formats
- 32-bit register pair merging (`_HI` / `_LW`)
- DEV and unsupported object type row skipping
- Invalid row flagging (missing name or address)
- Save to Assembly Library with `sourceFile` and `addressBase`
- Navigate to Device Setup after save, new assembly highlighted
- `addressBase` toggle visible in Map Points tab per device

### Out of scope (v1)

- Formula-based BACnet instances beyond N=1 default
- Enum value import (Notes / Enum_Values columns)
- Alarm code reference sheets (Daikin secondary sheet)
- Inline point editing during the import wizard
- Saving column mapping profiles for reuse across imports
- Import from URL or cloud storage
