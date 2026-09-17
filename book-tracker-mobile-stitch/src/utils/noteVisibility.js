// Zero-import ESM helper (T-22). Do not add imports or the key literal here —
// NOTE_VISIBILITY_KEY lives in src/services/api.js.
export function parseStoredVisibility(value) { return value === 'public'; }
export function serializeVisibility(isPublic) { return isPublic ? 'public' : 'private'; }
