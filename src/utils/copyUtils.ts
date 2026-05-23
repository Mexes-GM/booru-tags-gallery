export async function copyToClipboard(text: string): Promise<boolean> {
  const formatted = text.replace(/_/g, ' ');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(formatted);
      dispatchCopyEvent(formatted, true);
      return true;
    }
  } catch {
    // continuará al fallback
  }
  // Fallback
  try {
    const ta = document.createElement('textarea');
    ta.value = formatted;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    dispatchCopyEvent(formatted, ok);
    return ok;
  } catch {
    dispatchCopyEvent(formatted, false);
    return false;
  }
}

function dispatchCopyEvent(text: string, success: boolean) {
  try {
    window.dispatchEvent(new CustomEvent('tagTextCopied', { detail: { text, success } }));
  } catch {
    // ignore
  }
}
