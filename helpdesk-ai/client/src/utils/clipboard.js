export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try the browser's selection-based copy below. */ }
  }
  const active = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = text; field.readOnly = true;
  Object.assign(field.style,{position:'fixed',left:'0',top:'0',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(field);
  try {
    field.focus(); field.select(); field.setSelectionRange(0,text.length);
    if (!document.execCommand('copy')) throw new Error('Clipboard access was denied');
  } finally {
    field.remove(); active?.focus({preventScroll:true});
    if(selection){selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}
  }
}
