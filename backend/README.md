# Backend

This directory contains the Python backend for the JobInsight AI application.

## Structure

```
backend/
├── api/            # FastAPI application
├── cv_analyzer/    # CV analysis module
└── venv/          # Python virtual environment
```

## Setup

1. Activate the virtual environment:
   ```bash
   source venv/bin/activate  # On Unix/macOS
   # or
   .\venv\Scripts\activate  # On Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the API server:
   ```bash
   python api/run_api.py
   ```

## Development

- The API server runs on `http://localhost:8000` by default
- API documentation is available at `http://localhost:8000/docs`
- The CV analyzer module provides AI-powered CV analysis functionality 