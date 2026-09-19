// Sprint 4C (F-62): the reader's day is their device's day.
// deviceTimeZone(): the IANA zone to send as X-Timezone, or null.
// parseDayLabel(): a server calendar label ("YYYY-MM-DD" or "YYYY-MM") as a LOCAL Date at midnight.
//   new Date("2026-10-03") is UTC midnight, which shows Oct 2 anywhere west of UTC.
export function deviceTimeZone(intl = globalThis.Intl) {
  try {
    const z = intl?.DateTimeFormat?.().resolvedOptions?.().timeZone
    return typeof z === 'string' && z.length > 0 && z.length <= 64 ? z : null
  } catch {
    return null
  }
}

export function parseDayLabel(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(typeof s === 'string' ? s : '')
  return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null
}
