from sqlalchemy import create_engine, Column, String, DateTime
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class Resume(Base):
    __tablename__ = 'resume'
    id = Column(String, primary_key=True)
    fileName = Column(String, nullable=False)
    content = Column(String, nullable=False)
    uploadedAt = Column(DateTime, server_default=func.now()) 