// src/components/SupplierImportTab.tsx
import { useState, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Protocol } from '../types';
import type { ColumnMapping, ParsedFile, ImportResult } from '../lib/supplierImport';
import { parseFile, buildSimPoints } from '../lib/supplierImport';
import { detectProtocol, detectColumnMapping } from '../lib/columnDetector';
import { addAssembly } from '../storage';
import type { DeviceAssembly } from '../types';

interface Props {
  onSaved: () => void;  // called after assembly saved — App navigates to devices tab
}

type WizardStep = 1 | 2 | 3;

interface WizardState {
  step: WizardStep;
  fileName: string;
  parsedFile: ParsedFile | null;
  protocol: Protocol;
  columnMapping: Partial<ColumnMapping>;
  assemblyName: string;
  addressBase: 0 | 1;
  importResult: ImportResult | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  fileName: '',
  parsedFile: null,
  protocol: 'modbus',
  columnMapping: {},
  assemblyName: '',
  addressBase: 0,
  importResult: null,
  loading: false,
  error: null,
};

const inputCls = 'border rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400';
const inputStyle = { borderColor: '#D3D1C7' };

// ── Step 1: Upload & Detect ───────────────────────────────────────────────────

function Step1Upload({
  wizard, setWizard,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(csv|xlsx)$/i)) {
      setWizard(w => ({ ...w, error: 'Only .csv and .xlsx files are supported.' }));
      return;
    }
    setWizard(w => ({ ...w, loading: true, error: null }));
    try {
      const parsed = await parseFile(file);
      const detectedRaw = detectProtocol(parsed.columns);
      const protocol: Protocol = detectedRaw === 'unknown' ? 'modbus' : detectedRaw;
      const colMapping = detectColumnMapping(parsed.columns, protocol);
      setWizard(w => ({
        ...w,
        loading: false,
        fileName: file.name,
        parsedFile: { ...parsed, _file: file },
        protocol,
        columnMapping: colMapping as Partial<ColumnMapping>,
        assemblyName: file.name.replace(/\.(csv|xlsx)$/i, ''),
        step: 2,
      }));
    } catch (e) {
      setWizard(w => ({ ...w, loading: false, error: `Failed to parse file: ${String(e)}` }));
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Import Supplier File</h2>
      <p className="text-sm mb-6" style={{ color: '#888780' }}>
        Import a Modbus or BACnet point list from a supplier CSV or Excel file.
        Creates a reusable Assembly in your library.
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors"
        style={{
          borderColor: dragOver ? '#1D9E75' : '#D3D1C7',
          background: dragOver ? '#E1F5EE' : '#fff',
        }}
      >
        <div className="text-3xl mb-3">📂</div>
        <p className="font-medium text-sm" style={{ color: '#2C2C2A' }}>
          {wizard.loading ? 'Parsing file…' : 'Drop a file here, or click to browse'}
        </p>
        <p className="text-xs mt-1" style={{ color: '#888780' }}>
          Supported: .csv, .xlsx (including multi-sheet workbooks)
        </p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onInputChange} />
      </div>

      {wizard.error && (
        <p className="mt-3 text-sm" style={{ color: '#E24B4A' }}>{wizard.error}</p>
      )}
    </div>
  );
}

// ── Step 2: Map Columns ───────────────────────────────────────────────────────

const TARGET_FIELDS_MODBUS: { field: keyof ColumnMapping; label: string; required: boolean }[] = [
  { field: 'pointName',    label: 'Point Name',    required: true },
  { field: 'address',      label: 'Register',      required: true },
  { field: 'functionCode', label: 'Function Code', required: false },
  { field: 'dataType',     label: 'Data Type',     required: false },
  { field: 'scaleFactor',  label: 'Scale Factor',  required: false },
  { field: 'multiplier',   label: 'Multiplier',    required: false },
  { field: 'units',        label: 'Units',         required: false },
  { field: 'access',       label: 'R/W Access',    required: false },
];

const TARGET_FIELDS_BACNET: { field: keyof ColumnMapping; label: string; required: boolean }[] = [
  { field: 'pointName',   label: 'Point Name',   required: true },
  { field: 'address',     label: 'Instance',     required: true },
  { field: 'objectType',  label: 'Object Type',  required: false },
  { field: 'scaleFactor', label: 'Scale Factor', required: false },
  { field: 'multiplier',  label: 'Multiplier',   required: false },
  { field: 'units',       label: 'Units',        required: false },
  { field: 'access',      label: 'R/W Access',   required: false },
];

function Step2MapColumns({
  wizard, setWizard,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const parsed = wizard.parsedFile!;
  const targetFields = wizard.protocol === 'modbus' ? TARGET_FIELDS_MODBUS : TARGET_FIELDS_BACNET;

  function assignColumn(field: keyof ColumnMapping, col: string | null) {
    setWizard(w => ({
      ...w,
      columnMapping: col
        ? { ...w.columnMapping, [field]: col }
        : Object.fromEntries(Object.entries(w.columnMapping).filter(([k]) => k !== field)) as Partial<ColumnMapping>,
    }));
  }

  function canProceed() {
    return !!(wizard.columnMapping.pointName && wizard.columnMapping.address && wizard.assemblyName.trim());
  }

  function goToPreview() {
    setWizard(w => ({ ...w, step: 3 }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#2C2C2A' }}>Map Columns</h2>
          <p className="text-sm mt-0.5" style={{ color: '#888780' }}>
            {parsed.rows.length} rows · {parsed.columns.length} columns · {wizard.fileName}
          </p>
        </div>
        {/* Protocol toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: '#888780' }}>Protocol:</span>
          <div className="flex border rounded overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
            {(['modbus', 'bacnet'] as Protocol[]).map(p => (
              <button key={p}
                className="px-3 py-1 text-xs font-mono font-bold uppercase"
                style={wizard.protocol === p
                  ? { background: '#1D9E75', color: '#fff' }
                  : { background: '#fff', color: '#888780' }}
                onClick={() => {
                  const newMapping = detectColumnMapping(parsed.columns, p) as Partial<ColumnMapping>;
                  setWizard(w => ({ ...w, protocol: p, columnMapping: newMapping }));
                }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sheet selector for multi-sheet XLSX */}
      {parsed.sheetNames.length > 1 && (
        <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: '#D3D1C7', background: '#F9F8F4' }}>
          <span className="text-xs font-medium mr-2" style={{ color: '#888780' }}>Sheet:</span>
          <div className="inline-flex gap-1 flex-wrap">
            {parsed.sheetNames.map(name => (
              <button key={name}
                className="text-xs px-2 py-1 rounded border"
                style={parsed.activeSheet === name
                  ? { borderColor: '#1D9E75', background: '#E1F5EE', color: '#085041' }
                  : { borderColor: '#D3D1C7', color: '#888780', background: '#fff' }}
                onClick={async () => {
                  setWizard(w => ({ ...w, loading: true, error: null }));
                  try {
                    const reparsed = await parseFile(parsed._file as File, name);
                    const colMapping = detectColumnMapping(reparsed.columns, wizard.protocol) as Partial<ColumnMapping>;
                    setWizard(w => ({ ...w, loading: false, parsedFile: { ...reparsed, _file: parsed._file }, columnMapping: colMapping }));
                  } catch (e) {
                    setWizard(w => ({ ...w, loading: false, error: `Failed to load sheet: ${String(e)}` }));
                  }
                }}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mapping table */}
      <div className="bg-white rounded-xl border mb-4" style={{ borderColor: '#D3D1C7' }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid #F1EFE8' }}>
              <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: '#888780', width: 160 }}>Field</th>
              <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: '#888780' }}>Source column (click to select)</th>
            </tr>
          </thead>
          <tbody>
            {targetFields.map(({ field, label, required }) => (
              <tr key={field} style={{ borderBottom: '1px solid #F1EFE8' }}>
                <td className="px-4 py-2 font-medium text-sm" style={{ color: '#2C2C2A' }}>
                  {label} {required && <span style={{ color: '#E24B4A' }}>*</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.columns.map(col => {
                      const isSelected = wizard.columnMapping[field] === col;
                      return (
                        <button key={col}
                          onClick={() => assignColumn(field, isSelected ? null : col)}
                          className="text-xs px-2 py-1 rounded border font-mono"
                          style={isSelected
                            ? { borderColor: '#1D9E75', background: '#E1F5EE', color: '#085041', fontWeight: 700 }
                            : { borderColor: '#D3D1C7', color: '#888780', background: '#fff' }}>
                          {isSelected ? `${col} ✓` : col}
                        </button>
                      );
                    })}
                    {!required && (
                      <button
                        onClick={() => assignColumn(field, null)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: '#D3D1C7', color: '#aaa', fontStyle: 'italic' }}>
                        skip
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assembly name + navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium" style={{ color: '#2C2C2A' }}>Assembly name:</label>
          <input
            className={inputCls}
            style={{ ...inputStyle, width: 240 }}
            value={wizard.assemblyName}
            onChange={e => setWizard(w => ({ ...w, assemblyName: e.target.value }))}
            placeholder="e.g. Condair DL Humidifier"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setWizard(w => ({ ...w, step: 1 }))}
            className="px-4 py-2 text-sm rounded border" style={{ borderColor: '#D3D1C7', color: '#888780' }}>
            ← Back
          </button>
          <button onClick={goToPreview} disabled={!canProceed()}
            className="px-5 py-2 text-sm font-medium rounded text-white"
            style={{ background: canProceed() ? '#1D9E75' : '#aaa', cursor: canProceed() ? 'pointer' : 'not-allowed' }}>
            Preview {parsed.rows.length} points →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Preview & Save ────────────────────────────────────────────────────

function Step3Preview({
  wizard, setWizard, onSaved,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
  onSaved: () => void;
}) {
  const result = useMemo(() => buildSimPoints(
    wizard.parsedFile!.rows,
    wizard.columnMapping as ColumnMapping,
    wizard.protocol,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [wizard.parsedFile, wizard.columnMapping, wizard.protocol]);

  const PREVIEW_LIMIT = 50;

  function saveAssembly() {
    const assembly: DeviceAssembly = {
      id: uuidv4(),
      name: wizard.assemblyName.trim() || 'Imported Assembly',
      description: '',
      protocol: wizard.protocol,
      savedAt: new Date().toISOString(),
      points: result.points,
      addressBase: wizard.addressBase,
      sourceFile: wizard.fileName,
    };
    addAssembly(assembly);
    setWizard({ ...INITIAL_STATE });
    onSaved();
  }

  const visiblePoints = result.points.slice(0, PREVIEW_LIMIT);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#2C2C2A' }}>Preview & Save</h2>
          <p className="text-sm mt-0.5" style={{ color: '#888780' }}>
            {result.points.length} points imported
            {result.skippedCount > 0 && ` · ${result.skippedCount} rows skipped`}
            {result.invalidIndices.length > 0 && (
              <span style={{ color: '#E24B4A' }}> · {result.invalidIndices.length} invalid</span>
            )}
          </p>
        </div>

        {/* Address base toggle */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs font-semibold block" style={{ color: '#2C2C2A' }}>Address base</span>
            <span className="text-xs" style={{ color: '#888780' }}>
              {wizard.addressBase === 0 ? 'exported as-is' : 'exported − 1'}
            </span>
          </div>
          <div className="flex border rounded overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
            <button
              className="px-4 py-1.5 text-sm font-bold"
              style={wizard.addressBase === 0
                ? { background: '#1D9E75', color: '#fff' }
                : { background: '#fff', color: '#888780' }}
              onClick={() => setWizard(w => ({ ...w, addressBase: 0 }))}>
              0
            </button>
            <button
              className="px-4 py-1.5 text-sm font-bold border-l"
              style={{
                ...(wizard.addressBase === 1
                  ? { background: '#D4871A', color: '#fff' }
                  : { background: '#fff', color: '#888780' }),
                borderColor: '#D3D1C7',
              }}
              onClick={() => setWizard(w => ({ ...w, addressBase: 1 }))}>
              1
            </button>
          </div>
        </div>
      </div>

      {/* Points preview table */}
      <div className="bg-white rounded-xl border mb-4 overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: '#F9F8F4', borderBottom: '1px solid #E8E6DE' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Tag</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Description</th>
                {wizard.protocol === 'modbus' ? (
                  <>
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: '#888780' }}>Register</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>FC</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Type</th>
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: '#888780' }}>Scale</th>
                  </>
                ) : (
                  <>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Object Type</th>
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: '#888780' }}>Instance</th>
                  </>
                )}
                <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Units</th>
              </tr>
            </thead>
            <tbody>
              {visiblePoints.map((p, i) => {
                const isInvalid = result.invalidIndices.includes(i);
                return (
                  <tr key={i} style={{
                    borderBottom: '1px solid #F1EFE8',
                    background: isInvalid ? '#FEF2F2' : undefined,
                  }}>
                    <td className="px-3 py-1.5 font-mono font-semibold" style={{ color: '#2C2C2A' }}>{p.tag}</td>
                    <td className="px-3 py-1.5 max-w-xs truncate" style={{ color: '#555' }}
                      title={p.description}>{p.description}</td>
                    {wizard.protocol === 'modbus' ? (
                      <>
                        <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: '#1D9E75' }}>
                          {p.register}
                        </td>
                        <td className="px-3 py-1.5 font-mono" style={{ color: '#555' }}>FC{p.function_code}</td>
                        <td className="px-3 py-1.5 font-mono" style={{ color: '#555' }}>{p.data_type}</td>
                        <td className="px-3 py-1.5 text-right font-mono" style={{ color: '#555' }}>{p.scale}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 font-mono" style={{ color: '#555' }}>{p.object_type}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: '#1D9E75' }}>
                          {p.object_instance}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-1.5" style={{ color: '#555' }}>{p.units}</td>
                  </tr>
                );
              })}
              {result.points.length > PREVIEW_LIMIT && (
                <tr>
                  <td colSpan={wizard.protocol === 'modbus' ? 7 : 5} className="px-3 py-2 text-center text-xs" style={{ color: '#aaa' }}>
                    … {result.points.length - PREVIEW_LIMIT} more points (all will be saved)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWizard(w => ({ ...w, step: 2 }))}
          className="px-4 py-2 text-sm rounded border" style={{ borderColor: '#D3D1C7', color: '#888780' }}>
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: '#888780' }}>
            Saving as: <strong style={{ color: '#2C2C2A' }}>{wizard.assemblyName}</strong>
          </span>
          <button onClick={saveAssembly}
            className="px-6 py-2 text-sm font-semibold rounded text-white"
            style={{ background: '#1D9E75' }}>
            Save Assembly →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SupplierImportTab({ onSaved }: Props) {
  const [wizard, setWizard] = useState<WizardState>(INITIAL_STATE);

  const stepLabels = ['Upload & Detect', 'Map Columns', 'Preview & Save'];

  return (
    <div className="max-w-4xl">
      {/* Progress indicator */}
      <div className="flex items-center gap-3 mb-8">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as WizardStep;
          const active = wizard.step === n;
          const done = wizard.step > n;
          return (
            <div key={n} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done ? '#1D9E75' : active ? '#085041' : '#D3D1C7',
                  color: done || active ? '#fff' : '#888780',
                }}>
                {done ? '✓' : n}
              </div>
              <span className="text-sm" style={{ color: active ? '#2C2C2A' : '#888780', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
              {i < stepLabels.length - 1 && <span style={{ color: '#D3D1C7' }}>—</span>}
            </div>
          );
        })}
      </div>

      {wizard.step === 1 && <Step1Upload wizard={wizard} setWizard={setWizard} />}
      {wizard.step === 2 && <Step2MapColumns wizard={wizard} setWizard={setWizard} />}
      {wizard.step === 3 && <Step3Preview wizard={wizard} setWizard={setWizard} onSaved={onSaved} />}
    </div>
  );
}
