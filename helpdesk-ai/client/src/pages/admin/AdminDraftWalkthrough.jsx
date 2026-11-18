import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const commonSteps = [
  ['.draft-content-editor .sim-runtime-step-list', 'Arrange the simulation', 'Select a step to edit it. Drag steps into a new order, or focus a step and press Alt + Up or Down.'],
  ['.draft-content-editor .draft-step-delete', 'Remove a step', 'Use the trash button beside a step to delete it. The minimum number of steps must remain.'],
  ['.draft-content-editor .draft-step-insert', 'Add a step', 'Use Add step at the bottom of the step list to append a new step. Drag it into another position if needed.'],
  ['.draft-content-editor .sim-runtime-current', 'Review the step content', 'Edit the title, instructions, and expected outcome here. Check the generated content before saving. This panel scrolls independently of the step list.']
];

export default function AdminDraftWalkthrough({ terminal = false, notice = '' }) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [height, setHeight] = useState(280);
  const dialog = useRef(null);
  const previousFocus = useRef(null);
  const items = [...commonSteps, ...(terminal ? [
    ['.draft-test-workspace', 'Test the module', 'Review the current test step?s instruction and expected output. Copy its command with the copy icon, then paste it into the terminal. Complete every command or checkpoint in order. Editing or reordering steps resets verification.'],
    ['.draft-save-module', 'Save the tested draft', 'Draft edits save automatically. After all steps pass verification, use the footer to save the module. New modules start disabled; existing modules can be published after testing.']
  ] : [
    ['.sim-preview-approve', 'Save and test in Windows', 'Save the reviewed draft, then use its Test in Windows action to try the guide in the live Windows workspace.']
  ])];
  const close = () => { setOpen(false); const target = previousFocus.current; if (target && target !== document.body && target.isConnected) target.focus(); else document.querySelector('.draft-content-editor .sim-runtime-step')?.focus(); };

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    dialog.current?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const element = document.querySelector(items[index][0]);
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const measure = () => { setRect(element?.getBoundingClientRect() || null); setHeight(dialog.current?.offsetHeight || 280); };
    measure();
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    if (dialog.current) observer.observe(dialog.current);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, index, terminal]);

  return <>
    {notice ? <span className="draft-announcement draft-screen-reader-status" role="status">{notice}</span> : null}
    {open ? createPortal(<div className="admin-draft-walkthrough">
      <div className="admin-draft-walkthrough-backdrop" />
      {rect ? <div className="admin-draft-walkthrough-spotlight" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} /> : null}
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="admin-draft-tour-title" className="admin-draft-walkthrough-callout" style={{ top: rect ? Math.max(16, Math.min(window.innerHeight - height - 16, rect.bottom + 16)) : 40, left: rect ? Math.max(16, Math.min(window.innerWidth - 386, rect.left)) : 16 }}>
        <h2 id="admin-draft-tour-title">{items[index][1]}</h2>
        <p>{items[index][2]}</p>
        <div className="admin-draft-tour-progress" aria-label={`Step ${index + 1} of ${items.length}`}>{items.map((_, i) => <span key={i} className={i <= index ? 'active' : ''} />)}</div>
        <div className="admin-draft-tour-actions"><button type="button" className="btn-sm" onClick={close}>Skip</button><span>{index + 1} / {items.length}</span><button type="button" className="btn-sm" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Previous</button><button type="button" className="btn-sm" onClick={() => index === items.length - 1 ? close() : setIndex(i => i + 1)}>{index === items.length - 1 ? 'Start editing' : 'Next'}</button></div>
      </div>
    </div>, document.body) : null}
  </>;
}
