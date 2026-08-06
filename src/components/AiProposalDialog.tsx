import { CheckCircle, Robot, ShieldCheck, X } from "@phosphor-icons/react";
import type { AiMapProposal } from "../types";

interface AiProposalDialogProps {
  proposal: AiMapProposal;
  stale: boolean;
  onApply(): void;
  onReject(): void;
  onReviewLater(): void;
}

function changedStyleCount(proposal: AiMapProposal): number {
  return Object.keys(proposal.current.map).filter((key) =>
    JSON.stringify(proposal.current.map[key as keyof typeof proposal.current.map]) !==
    JSON.stringify(proposal.proposed.map[key as keyof typeof proposal.proposed.map]),
  ).length;
}

export function AiProposalDialog({
  proposal,
  stale,
  onApply,
  onReject,
  onReviewLater,
}: AiProposalDialogProps) {
  const locationDelta = proposal.proposed.locations.length - proposal.current.locations.length;
  const styleChanges = changedStyleCount(proposal);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog ai-proposal-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-proposal-title" data-testid="ai-proposal-dialog">
        <header className="dialog__header">
          <span className="dialog__icon"><Robot size={24} weight="bold" /></span>
          <div>
            <small>Local AI proposal · not applied</small>
            <h2 id="ai-proposal-title">Review changes to the open map</h2>
            <p>{proposal.summary}</p>
          </div>
          <button type="button" className="icon-button" onClick={onReviewLater} aria-label="Review later"><X size={17} /></button>
        </header>
        <div className="dialog__body">
          <section className="ai-safety-note">
            <ShieldCheck size={21} weight="fill" />
            <span><strong>You remain in control.</strong> The MCP tool prepared this preview only. Nothing is saved to a project file unless you apply the proposal and then choose Save project.</span>
          </section>
          {stale ? (
            <section className="ai-stale-warning" role="alert">
              The map changed after this proposal was prepared. Reject it and ask the AI to read the current project again.
            </section>
          ) : null}
          <section className="ai-compare" aria-label="Before and after comparison">
            <div><small>Before</small><strong>{proposal.current.project.name}</strong><span>{proposal.current.locations.length} locations</span><span>{proposal.current.map.title}</span></div>
            <div><small>After</small><strong>{proposal.proposed.project.name}</strong><span>{proposal.proposed.locations.length} locations ({locationDelta >= 0 ? "+" : ""}{locationDelta})</span><span>{proposal.proposed.map.title}</span></div>
          </section>
          <section className="ai-change-summary">
            <div><strong>{proposal.details.length}</strong><span>review notes</span></div>
            <div><strong>{Math.abs(locationDelta)}</strong><span>location delta</span></div>
            <div><strong>{styleChanges}</strong><span>style fields changed</span></div>
          </section>
          <ul className="ai-change-list">
            {proposal.details.map((detail) => <li key={detail}><CheckCircle size={16} weight="fill" />{detail}</li>)}
          </ul>
          <details className="ai-json-preview">
            <summary>Inspect complete proposed project JSON</summary>
            <pre>{JSON.stringify(proposal.proposed, null, 2)}</pre>
          </details>
        </div>
        <footer className="dialog__footer ai-proposal-actions">
          <button type="button" className="button button--secondary" onClick={onReviewLater}>Review later</button>
          <button type="button" className="button button--danger" onClick={onReject}>Reject proposal</button>
          <button type="button" className="button button--primary" onClick={onApply} disabled={stale}>Apply to working map</button>
        </footer>
      </section>
    </div>
  );
}
