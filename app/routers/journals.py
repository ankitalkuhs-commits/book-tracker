# app/routers/journals.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, deps, crud  # adapt imports to your project structure

router = APIRouter(prefix="/journals", tags=["journals"])

@router.post("/", response_model=schemas.JournalRead)
def create_journal(j: schemas.JournalCreate, db: Session = Depends(deps.get_db), current_user=Depends(deps.get_current_user)):
    # Optional: verify entry belongs to current_user (if private)
    journal = models.Journal(entry_id=j.entry_id, user_id=current_user.id, feeling=j.feeling, text=j.text)
    db.add(journal)
    db.commit()
    db.refresh(journal)
    return journal

@router.get("/entry/{entry_id}", response_model=list[schemas.JournalRead])
def get_journals_for_entry(entry_id: int, db: Session = Depends(deps.get_db), current_user=Depends(deps.get_current_user)):
    # If journals are private, only return those owned by current_user; otherwise adjust accordingly
    journals = db.query(models.Journal).filter(models.Journal.entry_id == entry_id).order_by(models.Journal.timestamp.desc()).all()
    return journals
