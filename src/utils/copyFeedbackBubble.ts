export function showCopyFeedbackBubble(text: string, x: number, y: number, success: boolean = true) {
  try {
    const prev = document.getElementById('__copy_fb_bubble');
    if (prev) prev.remove();
    const div = document.createElement('div');
    div.id = '__copy_fb_bubble';
    div.className = 'fixed pointer-events-none z-[12000] -translate-x-1/2 animate-pulse transition-opacity duration-200';
    div.style.left = `${x}px`;
    div.style.top = `${y - 50}px`;
    const inner = document.createElement('div');
  inner.className = `${success ? 'status-success-bg' : 'status-danger-bg'} px-3 py-2 rounded-lg shadow-lg text-sm font-medium`;
    inner.textContent = text;
    div.appendChild(inner);
    document.body.appendChild(div);
    setTimeout(() => { div.classList.add('opacity-0'); setTimeout(()=>div.remove(),250); }, 1600);
  } catch {}
}
