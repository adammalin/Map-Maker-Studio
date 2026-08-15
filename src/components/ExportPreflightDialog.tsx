import { CheckCircle, DownloadSimple, Info, WarningDiamond, X, XCircle } from "@phosphor-icons/react";
import type { ExportPreflightReport, PreflightStatus } from "../lib/preflight";

interface ExportPreflightDialogProps {
  kind: "svg" | "png" | "pptx";
  report: ExportPreflightReport;
  onExport(): void;
  onClose(): void;
}

function StatusIcon({ status }: { status: PreflightStatus }) {
  if (status === "pass") return <CheckCircle size={19} weight="fill" />;
  if (status === "error") return <XCircle size={19} weight="fill" />;
  if (status === "warning") return <WarningDiamond size={19} weight="fill" />;
  return <Info size={19} weight="fill" />;
}

export function ExportPreflightDialog({ kind, report, onExport, onClose }: ExportPreflightDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog export-preflight-dialog" role="dialog" aria-modal="true" aria-labelledby="export-preflight-title" data-testid="export-preflight-dialog">
        <header className="dialog__header">
          <span className="dialog__icon"><DownloadSimple size={22} weight="bold" /></span>
          <div><small>Export preflight</small><h2 id="export-preflight-title">Review the {kind.toUpperCase()} composition</h2><p>{report.errors} errors · {report.warnings} warnings</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close export preflight"><X size={18} /></button>
        </header>
        <div className="dialog__body preflight-checks">
          {report.checks.map((check) => (
            <article key={check.id} className={`preflight-check preflight-check--${check.status}`}>
              <StatusIcon status={check.status} />
              <span><strong>{check.title}</strong><small>{check.detail}</small></span>
            </article>
          ))}
        </div>
        <footer className="dialog__footer">
          <button type="button" className="button button--secondary" onClick={onClose}>Return to map</button>
          <button type="button" className="button button--primary" onClick={onExport}>{report.errors || report.warnings ? "Export after review" : `Export ${kind.toUpperCase()}`}</button>
        </footer>
      </section>
    </div>
  );
}
