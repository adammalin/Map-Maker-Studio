import { ArrowCounterClockwise, ClockCounterClockwise, FloppyDiskBack, X } from "@phosphor-icons/react";
import type { ProjectSnapshot } from "../types";

interface VersionHistoryDialogProps {
  snapshots: ProjectSnapshot[];
  loading: boolean;
  onCreate(): void;
  onRestore(snapshot: ProjectSnapshot): void;
  onClose(): void;
}

export function VersionHistoryDialog({ snapshots, loading, onCreate, onRestore, onClose }: VersionHistoryDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog version-history-dialog" role="dialog" aria-modal="true" aria-labelledby="version-history-title" data-testid="version-history-dialog">
        <header className="dialog__header">
          <span className="dialog__icon"><ClockCounterClockwise size={22} weight="bold" /></span>
          <div><small>Recovery</small><h2 id="version-history-title">Project version history</h2><p>Rotating recovery points remain available after restarting the app.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close version history"><X size={18} /></button>
        </header>
        <div className="dialog__body">
          <button type="button" className="version-history-create" onClick={onCreate} disabled={loading}><FloppyDiskBack size={20} /><span><strong>Create recovery point</strong><small>Capture the current map before a major edit.</small></span></button>
          <div className="version-history-list">
            {snapshots.length ? snapshots.map((snapshot) => (
              <article key={snapshot.id} className="version-history-row">
                <ClockCounterClockwise size={18} />
                <span><strong>{snapshot.label}</strong><small>{new Date(snapshot.createdAt).toLocaleString()} · {snapshot.projectName} · {snapshot.locationCount} locations · {snapshot.layerCount} layers</small></span>
                <button type="button" className="button button--secondary" disabled={loading} onClick={() => onRestore(snapshot)}><ArrowCounterClockwise size={15} /> Restore</button>
              </article>
            )) : <div className="empty-list"><ClockCounterClockwise size={24} /><strong>No recovery points yet</strong><span>Create one now; the app will also add rotating automatic points as you work.</span></div>}
          </div>
        </div>
        <footer className="dialog__footer"><span>Newest first · up to 24 retained</span><button type="button" className="button button--primary" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}
