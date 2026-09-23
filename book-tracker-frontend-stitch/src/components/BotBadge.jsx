// Sprint 4F R-03: the BOT label that sits beside an automated account's name.
//
// It renders `null` unless the author is flagged `is_bot`, so a call site needs no conditional of
// its own and a reader's card gains no DOM node, no gap and no extra height. `user?.is_bot` is
// deliberately a *truthiness* test on an optional chain: a stale 60-second GET cache (api.js:10-44)
// can serve a `user` object from before R-02 shipped, with no `is_bot` key at all, and that must
// render nothing rather than crash or badge everybody.
//
// The pill is not a new design element. Its classes are copied byte-for-byte from the Curator pill
// at GroupDetailPage.jsx:967; only the left margin is added, and that margin exists only when the
// pill itself does.
export default function BotBadge({ user }) {
  if (!user?.is_bot) return null
  return (
    <span className="text-xs font-bold uppercase tracking-wider text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full shrink-0 ml-1.5 align-middle">
      BOT
    </span>
  )
}
