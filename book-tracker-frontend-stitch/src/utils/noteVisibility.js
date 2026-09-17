// One key for every note composer (Home, Book detail, Profile). 'private' | 'public'; absent → 'private'.
export const NOTE_VISIBILITY_KEY = 'bt_note_visibility'

export function readNoteVisibility() {
  try { return localStorage.getItem(NOTE_VISIBILITY_KEY) === 'public' ? 'public' : 'private' }
  catch { return 'private' }   // storage blocked (private mode, site data disabled)
}

export function writeNoteVisibility(value) {
  try { localStorage.setItem(NOTE_VISIBILITY_KEY, value === 'public' ? 'public' : 'private') } catch { /* ignore */ }
}
