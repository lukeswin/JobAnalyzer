from sqlalchemy import create_engine
from models import Base

engine = create_engine("sqlite:///./dev.db")
Base.metadata.create_all(engine)
print("All tables created (if not already present).") 