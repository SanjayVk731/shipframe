import type { NormalizedReason } from '../providers/types'

// Maps a provider's NormalizedReason to a short, user-facing message. Shared by
// CreateView and SettingsView (which previously kept near-identical copies). The
// `not_found` case only arises in board-pick flows; it's harmless in contexts
// that never produce it.
export function reasonToMessage(reason: string): string {
  if (reason === 'auth_failed') return "Your token isn't working — re-enter it."
  if (reason === 'not_found') return 'Board not found — re-pick it in settings.'
  if (reason === 'network_error') return 'Network error — check your connection.'
  if (reason === 'rate_limited') return 'Rate limited — wait a moment and retry.'
  if (reason === 'server_error') return 'Server error — try again shortly.'
  return 'Something went wrong.'
}

// Compile-time guard: every NormalizedReason has a branch above.
const _exhaustive = (r: NormalizedReason): string => reasonToMessage(r)
void _exhaustive
