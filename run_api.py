import uvicorn
import os

if __name__ == "__main__":
    # Set memory limits
    os.environ["PYTHONMALLOC"] = "malloc"
    os.environ["PYTHONMALLOCSTATS"] = "1"
    
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        workers=1,  # Use single worker
        limit_concurrency=10,  # Increased from 1 to 10
        timeout_keep_alive=60,  # Increased timeout
        timeout_graceful_shutdown=60,
        backlog=2048,  # Increased backlog
        limit_max_requests=1000  # Added max requests limit
    ) 