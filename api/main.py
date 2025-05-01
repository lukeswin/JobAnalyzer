from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from cv_analyzer import CVAnalyzer
from pydantic import BaseModel
import logging
import gc
import sys
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware with more specific configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your Next.js frontend URL
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize analyzer
try:
    analyzer = CVAnalyzer()
except Exception as e:
    logger.error(f"Failed to initialize CVAnalyzer: {str(e)}")
    sys.exit(1)

class TextAnalysisRequest(BaseModel):
    text: str

@app.post("/analyze-cv")
async def analyze_cv(request: TextAnalysisRequest):
    try:
        # Check text length
        if len(request.text) > 1000000:  # 1MB limit
            raise HTTPException(status_code=400, detail="Text too long. Maximum size is 1MB.")
            
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Empty text provided.")
            
        # Analyze the text
        try:
            result = analyzer.analyze_text(request.text)
        except Exception as e:
            logger.error(f"Error during text analysis: {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500,
                detail="Error analyzing text. Please try again."
            )
        
        # Force garbage collection after analysis
        gc.collect()
        
        return {
            "success": True,
            "data": result
        }
    except HTTPException as he:
        logger.error(f"HTTP error: {str(he)}")
        raise he
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again."
        )

@app.get("/health")
async def health_check():
    try:
        # Test analyzer is working
        test_text = "Test CV analysis"
        analyzer.analyze_text(test_text)
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Service is unhealthy"
        )

# Cleanup on shutdown
@app.on_event("shutdown")
async def shutdown_event():
    try:
        if 'analyzer' in globals():
            del analyzer
        gc.collect()
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}") 