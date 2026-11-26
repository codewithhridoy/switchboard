/**
 * Attaches light-dismiss backdrop fallback for engines that do not yet support
 * the declarative `<dialog closedby="any">` attribute.
 */
export function attachDialogLightDismissFallback(dialog: HTMLDialogElement): () => void {
  if ('closedBy' in HTMLDialogElement.prototype) {
    return () => {};
  }

  const handleClick = (event: MouseEvent) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInside =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!isInside) {
      dialog.close();
    }
  };

  dialog.addEventListener('click', handleClick);
  return () => dialog.removeEventListener('click', handleClick);
}

/**
 * Syncs `aria-invalid` and conditional `aria-describedby` error links with
 * native `:user-invalid` so screen readers match the post-interaction visual state.
 */
export function syncFieldAriaValidation(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const errorId = el.dataset.error;
  const isInvalid =
    typeof CSS !== 'undefined' && CSS.supports('selector(:user-invalid)')
      ? el.matches(':user-invalid')
      : !el.validity.valid;

  el.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
  if (!errorId) return;

  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (isInvalid) {
    ids.push(errorId);
  }
  if (ids.length > 0) {
    el.setAttribute('aria-describedby', ids.join(' '));
  } else {
    el.removeAttribute('aria-describedby');
  }
}
