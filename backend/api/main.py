from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .resume_parser import parse_resume, Experience as ResumeExperience

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Experience(BaseModel):
    job_title: str
    company: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_years: Optional[float] = None

class ResumeRequest(BaseModel):
    text: str

class ResumeResponse(BaseModel):
    id: int
    experiences: List[Experience]
    skills: List[str]
    created_at: str

@app.post("/api/resumes", response_model=ResumeResponse)
async def create_resume(request: ResumeRequest):
    try:
        # Parse the resume text using the existing parser
        parsed_data = parse_resume(request.text)
        
        return {
            "id": 1,  # You might want to generate a unique ID
            "experiences": [
                Experience(
                    job_title=exp.job_title,
                    company=exp.company,
                    start_date=exp.start_date,
                    end_date=exp.end_date,
                    duration_years=exp.duration_years
                ) for exp in parsed_data.experiences
            ],
            "skills": parsed_data.skills,
            "created_at": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 