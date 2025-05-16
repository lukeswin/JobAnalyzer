from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import spacy
import json
from typing import Dict, List
from pydantic import BaseModel

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load spaCy model
nlp = spacy.load("en_core_web_sm")

class CVText(BaseModel):
    text: str

@app.get("/")
async def read_root():
    return {"message": "CV Analysis API is running"}

@app.post("/analyze-cv")
async def analyze_cv(cv_data: CVText):
    try:
        # Process the text with spaCy
        doc = nlp(cv_data.text)
        
        # Extract named entities
        entities = []
        for ent in doc.ents:
            entities.append({
                "text": ent.text,
                "label": ent.label_,
                "start": ent.start_char,
                "end": ent.end_char
            })
        
        # Extract skills (custom logic can be added here)
        skills = []
        for token in doc:
            if token.pos_ == "NOUN" and len(token.text) > 3:
                skills.append(token.text.lower())
        
        return {
            "success": True,
            "data": {
                "entities": entities,
                "skills": list(set(skills))  # Remove duplicates
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 