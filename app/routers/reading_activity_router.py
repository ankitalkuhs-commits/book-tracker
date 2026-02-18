# app/routers/reading_activity_router.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..deps import get_db, get_current_user
from ..models import ReadingActivity, UserBook, User
from datetime import datetime, timedelta
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
        daily_stats[date_key] += activity.pages_read
    
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


@router.get("/user/{user_id}/daily")
def get_user_daily_reading_stats(
    user_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get daily reading activity for a specific user (for viewing their profile).
    Public endpoint - anyone can see anyone's reading stats.
    """
    # Verify user exists
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
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
        daily_stats[date_key] += activity.pages_read
    
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
