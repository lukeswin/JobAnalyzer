from __future__ import annotations

"""FastAPI routes + DB model for storing raw résumé text and parsed output."""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import Column, Integer, Text, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session

from .database import get_session  # assumes you have a database dependency helper
from .resume_parser import parse_resume, ParsedResume

Base = declarative_base()
router = APIRouter(prefix="/resumes", tags=["resumes"])


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True)
    raw_text = Column(Text, nullable=False)
    parsed = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# --------------------------- Pydantic Schemas ----------------------------

class ResumeIn(BaseModel):
    text: str


class ExperienceOut(BaseModel):
    job_title: str
    company: str
    start_date: str | None = None
    end_date: str | None = None
    duration_years: int | None = None


class ResumeOut(BaseModel):
    id: int
    experiences: List[ExperienceOut]
    skills: List[str]
    created_at: datetime

    class Config:
        orm_mode = True


# --------------------------- API Endpoints ------------------------------

@router.post("/", response_model=ResumeOut, status_code=status.HTTP_201_CREATED)
async def upload_resume(payload: ResumeIn, db: Session = Depends(get_session)):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Empty résumé text.")

    parsed: ParsedResume = parse_resume(payload.text)
    db_obj = Resume(raw_text=payload.text, parsed=parsed.to_dict())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)

    return ResumeOut(
        id=db_obj.id,
        experiences=parsed.experiences,  # Pydantic handles dataclass → dict
        skills=parsed.skills,
        created_at=db_obj.created_at,
    )


@router.get("/{resume_id}", response_model=ResumeOut)
async def get_resume(resume_id: int, db: Session = Depends(get_session)):
    db_obj: Resume | None = db.get(Resume, resume_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Résumé not found")
    data = db_obj.parsed
    return ResumeOut(
        id=db_obj.id,
        experiences=data["experiences"],
        skills=data["skills"],
        created_at=db_obj.created_at,
    )
