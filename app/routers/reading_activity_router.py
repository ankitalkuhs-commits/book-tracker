# app/routers/reading_activity_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from ..deps import get_db, get_current_user
from ..models import ReadingActivity, UserBook, Book, User, Follow
from datetime import datetime, timedelta, date as date_type
from typing import List

router = APIRouter(prefix="/reading-activity", tags=["reading-activity"])


@router.get("/daily")
def get_daily_reading_stats(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get daily reading activity for the current user for the last N days.
    Returns pages read per day for charts.
    """
    # Calculate date range
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    # Query reading activity
    activities = db.exec(
        select(ReadingActivity)
        .where(ReadingActivity.user_id == current_user.id)
        .where(ReadingActivity.date >= start_date)
        .order_by(ReadingActivity.date.desc())
    ).all()
    
    # Group by date and sum pages_read
    daily_stats = {}
    for activity in activities:
        date_key = activity.date.date() if isinstance(activity.date, datetime) else activity.date
        if date_key not in daily_stats:
            daily_stats[date_key] = 0
        daily_stats[date_key] += (activity.pages_read or 0)
    
    # Fill in missing days with 0
    result = []
    current_date = end_date
    for i in range(days):
        date_key = current_date - timedelta(days=i)
        result.append({
            "date": date_key.isoformat(),
            "pages_read": daily_stats.get(date_key, 0)
        })
    
    return {"days": days, "data": list(reversed(result))}


@router.get("/insights")
def get_reading_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full reading insights for the current user:
    yearly stats, streaks, monthly breakdown, projected finish dates, avg rating.
    """
    today = datetime.utcnow().date()
    year_start = date_type(today.year, 1, 1)

    # ── All userbooks ────────────────────────────────────────────────────────
    all_ubs = db.exec(select(UserBook).where(UserBook.user_id == current_user.id)).all()
    finished_ubs = [ub for ub in all_ubs if ub.status == "finished"]
    reading_ubs  = [ub for ub in all_ubs if ub.status == "reading"]
    finished_this_year = [
        ub for ub in finished_ubs
        if ub.updated_at and ub.updated_at.date() >= year_start
    ]

    # ── Yearly goal ──────────────────────────────────────────────────────────
    yearly_goal = getattr(current_user, "yearly_goal", None)
    goal_progress = None
    if yearly_goal:
        day_of_year = today.timetuple().tm_yday
        goal_progress = {
            "goal": yearly_goal,
            "completed": len(finished_this_year),
            "pct": round(min(100, len(finished_this_year) / yearly_goal * 100)),
            "on_track": len(finished_this_year) >= round(yearly_goal * day_of_year / 365),
        }

    # ── Total pages read — batch fetch books ─────────────────────────────────
    _ub_book_ids = [ub.book_id for ub in all_ubs if ub.book_id]
    _books_map = {b.id: b for b in db.exec(select(Book).where(Book.id.in_(_ub_book_ids))).all()} if _ub_book_ids else {}
    total_pages = 0
    for ub in all_ubs:
        book = _books_map.get(ub.book_id)
        if ub.status == "finished":
            total_pages += (book.total_pages if book and book.total_pages else ub.current_page or 0)
        elif ub.status == "reading":
            total_pages += ub.current_page or 0

    # ── Reading streak ────────────────────────────────────────────────────────
    activities = db.exec(
        select(ReadingActivity)
        .where(ReadingActivity.user_id == current_user.id)
        .where(ReadingActivity.pages_read > 0)
    ).all()
    active_dates = set()
    for a in activities:
        d = a.date.date() if isinstance(a.date, datetime) else a.date
        active_dates.add(d)

    current_streak = 0
    check = today
    while check in active_dates:
        current_streak += 1
        check -= timedelta(days=1)

    longest_streak = 0
    if active_dates:
        streak = 0
        prev_d = None
        for d in sorted(active_dates):
            if prev_d is None or d == prev_d + timedelta(days=1):
                streak += 1
                longest_streak = max(longest_streak, streak)
            else:
                streak = 1
            prev_d = d

    # ── Monthly breakdown (last 12 months) ──────────────────────────────────
    monthly = {}
    for a in activities:
        d = a.date.date() if isinstance(a.date, datetime) else a.date
        key = f"{d.year}-{d.month:02d}"
        monthly[key] = monthly.get(key, 0) + (a.pages_read or 0)
    monthly_list = []
    for i in range(11, -1, -1):
        ref = (today.replace(day=1) - timedelta(days=i * 30))
        key = f"{ref.year}-{ref.month:02d}"
        monthly_list.append({"month": key, "pages_read": monthly.get(key, 0)})

    # ── Avg pages/day (last 30 days) ─────────────────────────────────────────
    thirty_ago = today - timedelta(days=30)
    recent_pages = sum(
        a.pages_read or 0 for a in activities
        if (a.date.date() if isinstance(a.date, datetime) else a.date) >= thirty_ago
    )
    avg_pages_per_day = round(recent_pages / 30, 1)

    # ── Projected finish dates ────────────────────────────────────────────────
    projected = []
    if avg_pages_per_day > 0:
        for ub in reading_ubs:
            book = _books_map.get(ub.book_id)
            if book and book.total_pages and ub.current_page:
                pages_left = book.total_pages - ub.current_page
                days_left = max(1, round(pages_left / avg_pages_per_day))
                finish_date = today + timedelta(days=days_left)
                projected.append({
                    "userbook_id": ub.id,
                    "title": book.title,
                    "author": book.author,
                    "cover_url": book.cover_url,
                    "current_page": ub.current_page,
                    "total_pages": book.total_pages,
                    "pct": round(ub.current_page / book.total_pages * 100),
                    "pages_left": pages_left,
                    "days_left": days_left,
                    "projected_finish": finish_date.isoformat(),
                })

    # ── Average rating ────────────────────────────────────────────────────────
    rated = [ub.rating for ub in finished_ubs if ub.rating]
    avg_rating = round(sum(rated) / len(rated), 1) if rated else None

    return {
        "total_books": len(all_ubs),
        "total_finished": len(finished_ubs),
        "total_reading": len(reading_ubs),
        "finished_this_year": len(finished_this_year),
        "total_pages_read": total_pages,
        "avg_pages_per_day": avg_pages_per_day,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "avg_rating": avg_rating,
        "yearly_goal": goal_progress,
        "monthly_pages": monthly_list,
        "projected_finishes": projected,
    }


@router.get("/user/{user_id}/daily")
def get_user_daily_reading_stats(
    user_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get daily reading activity for a specific user (for viewing their profile)."""
    # Verify user exists
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Enforce private profile
    if getattr(user, "is_private_profile", False) and current_user.id != user_id:
        is_following = bool(db.exec(
            select(Follow).where(Follow.follower_id == current_user.id, Follow.followed_id == user_id)
        ).first())
        if not is_following:
            raise HTTPException(status_code=403, detail="This profile is private")
    
    # Calculate date range
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    # Query reading activity
    activities = db.exec(
        select(ReadingActivity)
        .where(ReadingActivity.user_id == user_id)
        .where(ReadingActivity.date >= start_date)
        .order_by(ReadingActivity.date.desc())
    ).all()
    
    # Group by date and sum pages_read
    daily_stats = {}
    for activity in activities:
        date_key = activity.date.date() if isinstance(activity.date, datetime) else activity.date
        if date_key not in daily_stats:
            daily_stats[date_key] = 0
        daily_stats[date_key] += (activity.pages_read or 0)
    
    # Fill in missing days with 0
    result = []
    current_date = end_date
    for i in range(days):
        date_key = current_date - timedelta(days=i)
        result.append({
            "date": date_key.isoformat(),
            "pages_read": daily_stats.get(date_key, 0)
        })
    
    return {"days": days, "data": list(reversed(result))}
