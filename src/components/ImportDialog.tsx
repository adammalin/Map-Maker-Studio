import { CheckCircle, FileCsv, WarningDiamond, X } from "@phosphor-icons/react";
import type { ImportResult, MapLayer } from "../types";
import { CSV_IMPORT_FIELDS, type CsvColumnMap, type CsvImportField } from "../lib/csv";

interface ImportDialogProps {
  result: ImportResult;
  fileName: string;
  layers: MapLayer[];
  targetLayerId: string;
  headers: string[];
  columnMap: CsvColumnMap;
  onTargetLayerChange(id: string): void;
  onColumnMapChange(field: CsvImportField, header: string): void;
  onAdd(): void;
  onReplaceLayer(): void;
  onClose(): void;
}

const FIELD_LABELS: Record<CsvImportField, string> = {
  city: "City / town",
  state: "State",
  company: "Company",
  latitude: "Latitude",
  longitude: "Longitude",
  label: "Display label",
  notes: "Notes",
};

export function ImportDialog({ result, fileName, layers, targetLayerId, headers, columnMap, onTargetLayerChange, onColumnMapChange, onAdd, onReplaceLayer, onClose }: ImportDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" data-testid="import-dialog">
        <header className="dialog__header">
          <span className="dialog__icon"><FileCsv size={22} weight="bold" /></span>
          <div><small>CSV intake</small><h2 id="import-title">Review imported locations</h2><p>{fileName}</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close import review"><X size={18} /></button>
        </header>
        <div className="dialog__body">
          <div className="import-summary">
            <div><CheckCircle size={22} /><strong>{result.locations.length}</strong><span>Ready to map</span></div>
            <div className={result.issues.length ? "has-warning" : ""}><WarningDiamond size={22} /><strong>{result.issues.length}</strong><span>Need attention</span></div>
            <div><FileCsv size={22} /><strong>{result.totalRows}</strong><span>CSV rows</span></div>
          </div>
          <p className="dialog__intro">City/state rows without coordinates were matched against the bundled 2025 Census place index. Supplied coordinates were kept as entered.</p>
          <details className="column-mapping" data-testid="csv-column-mapping">
            <summary>Column mapping <span>Adjust when a client file uses unfamiliar headings</span></summary>
            <div className="column-mapping__grid">
              {CSV_IMPORT_FIELDS.map((field) => (
                <label key={field}><span>{FIELD_LABELS[field]}</span><select value={columnMap[field] ?? ""} onChange={(event) => onColumnMapChange(field, event.target.value)}><option value="">Automatic aliases</option>{headers.map((header) => <option key={`${field}-${header}`} value={header}>{header}</option>)}</select></label>
              ))}
            </div>
          </details>
          <label className="import-layer-field"><span>Import into layer</span><select value={targetLayerId} onChange={(event) => onTargetLayerChange(event.target.value)}>{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
          {result.issues.length ? (
            <div className="issue-table" role="region" aria-label="Rows that need attention">
              <div className="issue-table__head"><span>Row</span><span>Place</span><span>Reason</span></div>
              {result.issues.slice(0, 50).map((issue) => (
                <div key={`${issue.row}-${issue.city}-${issue.state}`}><span>{issue.row}</span><span>{[issue.city, issue.state].filter(Boolean).join(", ") || "Blank"}</span><span>{issue.reason}</span></div>
              ))}
              {result.issues.length > 50 ? <p>Showing the first 50 of {result.issues.length} issues.</p> : null}
            </div>
          ) : (
            <div className="success-notice"><CheckCircle size={18} weight="fill" /> Every data row is ready to map.</div>
          )}
        </div>
        <footer className="dialog__footer">
          <button type="button" className="button button--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="button button--secondary" onClick={onReplaceLayer} disabled={!result.locations.length}>Replace target layer</button>
          <button type="button" className="button button--primary" onClick={onAdd} disabled={!result.locations.length}>Add {result.locations.length} locations</button>
        </footer>
      </section>
    </div>
  );
}
