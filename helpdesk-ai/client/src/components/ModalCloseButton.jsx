import './ModalCloseButton.css';

export default function ModalCloseButton({ className = '', 'aria-label': label = 'Close dialog', ...props }) {
  return <button {...props} type="button" className={`modal-close-button ${className}`} aria-label={label}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
  </button>;
}
