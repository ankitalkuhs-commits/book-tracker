# app/localday.py
"""A reader's day is their own local day (Sprint 4C, F-62; PM decision 2026-09-18).

Every server-side "now" in the reading, activity and notification paths comes from utcnow()
below. Call it as `localday.utcnow()` so tests can replace it. Instants stay naive UTC.
reading_activity.date holds a calendar *label* (naive midnight), never an instant.
"""
from datetime import date, datetime, timezone as _utc_tz
from typing import Optional
from zoneinfo import ZoneInfo, available_timezones

ZONE_HEADER = "X-Timezone"
FALLBACK_ZONE = "Asia/Kolkata"   # D-3: never-reported readers (Android <= 2.2.2) — keeps the 8 PM IST reminder
MAX_ZONE_LEN = 64

# available_timezones() reads whatever is in the tz directory, and on Linux that includes two
# entries which are not IANA zones: `localtime` (a symlink to the HOST's configured zone) and
# `posixrules`. Windows, where the pinned `tzdata` wheel supplies the database, has neither.
#
# So without this subtraction the same reader input validates differently depending on which
# OS the API happens to run on — and production is Linux, the side where it is wrong. A client
# sending `X-Timezone: localtime` would be accepted and then given the SERVER's day boundaries
# instead of its own, which is precisely what Sprint 4C exists to prevent. It was invisible
# here for the same reason: the test that rejects "localtime" passes on Windows by accident,
# because the wheel has no such key. CI on Linux is what caught it (2026-09-30).
NON_IANA_ZONE_NAMES = frozenset({"localtime", "posixrules"})
_VALID_ZONES = frozenset(available_timezones()) - NON_IANA_ZONE_NAMES

if FALLBACK_ZONE not in _VALID_ZONES:   # no tz database → refuse to start rather than 500 on every request
    raise RuntimeError("IANA tz database unavailable: install the pinned 'tzdata' package")


def utcnow() -> datetime:
    """Naive UTC now — the single clock seam."""
    return datetime.utcnow()


def valid_zone(name) -> Optional[str]:
    """The name if it is a known IANA zone, else None. Never raises; never touches the filesystem."""
    if not isinstance(name, str) or not (0 < len(name) <= MAX_ZONE_LEN):
        return None
    return name if name in _VALID_ZONES else None


def zone_of(user) -> ZoneInfo:
    """The reader's zone: stored value if valid, else the fallback. `user` may be None."""
    return ZoneInfo(valid_zone(getattr(user, "timezone", None)) or FALLBACK_ZONE)


def local_date(instant: datetime, zone: ZoneInfo) -> date:
    """Calendar date of an instant in `zone`. Naive instants are UTC (the DB convention)."""
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=_utc_tz.utc)
    return instant.astimezone(zone).date()


def local_now(zone: ZoneInfo, now: Optional[datetime] = None) -> datetime:
    """Aware wall-clock time in `zone`."""
    n = now or utcnow()
    return n.replace(tzinfo=_utc_tz.utc).astimezone(zone)


def local_today(zone: ZoneInfo, now: Optional[datetime] = None) -> date:
    return local_date(now or utcnow(), zone)


def day_label(d: date) -> datetime:
    """reading_activity.date value for local day d: a naive midnight — a label, not an instant."""
    return datetime(d.year, d.month, d.day)
