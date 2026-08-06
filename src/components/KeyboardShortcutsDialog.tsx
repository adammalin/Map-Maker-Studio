import { Question, X } from "@phosphor-icons/react";

interface KeyboardShortcutsDialogProps {
  onClose(): void;
}

const shortcuts = [
  ["Space + drag", "Pan from anywhere on the canvas"],
  ["Scroll / trackpad", "Zoom toward the pointer"],
  ["+  /  −", "Zoom in or out"],
  ["0", "Fit the full map canvas"],
  ["1", "Return to 100%"],
  ["⌘/Ctrl + S", "Save the complete project JSON"],
  ["⌘/Ctrl + O", "Open a project JSON"],
  ["⌘/Ctrl + N", "Create a new project"],
  ["⌘/Ctrl + Z", "Undo the last project change"],
  ["⌘/Ctrl + Shift + Z or Ctrl + Y", "Redo the last project change"],
  ["/", "Focus location search"],
  ["?", "Open this keyboard reference"],
  ["Esc", "Close this reference"],
] as const;

export function KeyboardShortcutsDialog({ onClose }: KeyboardShortcutsDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" data-testid="keyboard-shortcuts-dialog">
        <header className="dialog__header">
          <span className="dialog__icon"><Question size={23} weight="bold" /></span>
          <div><small>Canvas &amp; project commands</small><h2 id="shortcut-title">Keyboard shortcuts</h2><p>Designed to feel familiar to Illustrator users while protecting normal typing inside form fields.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close keyboard shortcuts"><X size={17} weight="bold" /></button>
        </header>
        <div className="dialog__body shortcut-list">
          {shortcuts.map(([keys, action]) => <div key={keys}><kbd>{keys}</kbd><span>{action}</span></div>)}
        </div>
        <footer className="dialog__footer"><button type="button" className="button button--primary" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}
