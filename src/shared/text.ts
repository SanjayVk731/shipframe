// Truncate `s` to at most `max` characters, replacing the final character with
// an ellipsis when truncation occurs. Pure string op — safe to import from both
// the sandbox and UI bundles. Single source for the "slice(0, max-1) + '…'"
// pattern that was duplicated across the pin/title/context truncators.
export function truncateWithEllipsis(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
