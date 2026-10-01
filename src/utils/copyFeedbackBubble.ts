export function showCopyFeedbackBubble(text: string, x: number, y: number, success: boolean = true) {
  try {
    const prev = document.getElementById('__copy_fb_bubble');
    if (prev) prev.remove();
    const div = document.createElement('div');
    div.id = '__copy_fb_bubble';
    div.setAttribute('role', 'status');
    div.className = 'fixed pointer-events-none z-[12000] -translate-x-1/2 transition-opacity duration-200';
    div.style.left = `${x}px`;
    div.style.top = `${y - 44}px`;
    const inner = document.createElement('div');
    inner.className = 'copy-bubble';
    inner.dataset.state = success ? 'ok' : 'error';
    inner.textContent = text;
    div.appendChild(inner);
    document.body.appendChild(div);
    setTimeout(() => { div.classList.add('opacity-0'); setTimeout(()=>div.remove(),250); }, 1400);
  } catch {}
}
