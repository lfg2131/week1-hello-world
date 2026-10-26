/** Only the Rate deck installs shortcuts. Pure predicate for meaningful tests. */
export function ratingShortcut(event: KeyboardEvent, pending: boolean, overlayOpen: boolean): 1 | -1 | null {
  if (pending || overlayOpen || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return null;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="menu"], [role="dialog"]')) return null;
  return event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : null;
}
