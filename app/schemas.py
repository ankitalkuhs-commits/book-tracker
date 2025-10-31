# app/schemas.py (new or append)
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class JournalCreate(BaseModel):
    entry_id: int
    feeling: Optional[str] = None
    text: str

class JournalRead(BaseModel):
    id: int
    entry_id: int
    user_id: int
    timestamp: datetime
    feeling: Optional[str]
    text: str

    class Config:
        orm_mode = True
