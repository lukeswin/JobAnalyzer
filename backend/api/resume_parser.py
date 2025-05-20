from __future__ import annotations

"""Light-weight résumé parser used by the JobAnalyzer backend.

This mirrors the TS logic used on the front-end but runs entirely in Python so
we can reuse it in API routes / Celery workers without duplicating business
rules.
"""

import re
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Dict, Optional
import json
import os

import dateutil.parser

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CURRENT_TOKENS = {"PRESENT", "ONGOING", "CURRENT"}

# Recognised headings for Experience sections
EXPERIENCE_TITLES = {
    "EXPERIENCE", "WORK EXPERIENCE", "JOB EXPERIENCE", "PROFESSIONAL EXPERIENCE",
    "EMPLOYMENT HISTORY", "CAREER HISTORY", "CAREER OVERVIEW", "WORK HISTORY",
    "CAREER SUMMARY", "EXPERIENCE & QUALIFICATIONS"
}

# Recognised headings for Skills sections
SKILLS_TITLES = {
    "SKILLS", "TECHNICAL SKILLS", "SOFT SKILLS", "EXPERTISE",
    "KEY SKILLS", "CORE SKILLS", "PROFESSIONAL SKILLS"
}

# All section headings that can appear in a resume
ALL_SECTION_HEADINGS = {
    *EXPERIENCE_TITLES,
    *SKILLS_TITLES,
    "LANGUAGES", "EDUCATION", "OBJECTIVE", "CONTACT", "SUMMARY",
    "PROFILE", "CERTIFICATIONS", "PROJECTS", "PUBLICATIONS", "AWARDS",
    "ACHIEVEMENTS"
}

# Date-range regex: captures YYYY-YYYY or YYYY–Present etc.
_DATE_RANGE_RE = re.compile(
    r"(?P<start>\d{4})\s*[–\-]\s*(?P<end>\d{4}|Present|Ongoing|Current)",
    re.IGNORECASE
)

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class Experience:
    job_title: str
    company: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    duration_years: Optional[int] = None

@dataclass
class ParsedResume:
    experiences: List[Experience]
    skills: List[str]

    def to_dict(self) -> Dict:
        return {"experiences": [asdict(e) for e in self.experiences], "skills": self.skills}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split_by_headings(text: str) -> Dict[str, str]:
    """Split raw text into sections keyed by recognised headings."""
    sections: Dict[str, List[str]] = {}
    current = None
    for line in text.splitlines():
        key = line.strip().upper()
        if key in ALL_SECTION_HEADINGS:
            current = key
            sections[current] = []
        elif current:
            sections[current].append(line)
    return {sec: "\n".join(lines).strip() for sec, lines in sections.items() if lines}


def _compute_years(start: str, end: Optional[str] = None) -> Optional[int]:
    try:
        start_dt = dateutil.parser.parse(start, default=datetime(datetime.now().year, 1, 1))
        if end and end.strip().upper() not in CURRENT_TOKENS:
            end_dt = dateutil.parser.parse(end, default=datetime(datetime.now().year, 1, 1))
        else:
            end_dt = datetime.now()
        return max(round((end_dt - start_dt).days / 365), 0)
    except Exception:
        return None

def _split_on_unusual_gaps(text: str) -> List[str]:
    """Split text on unusual gaps between words (e.g. 'Python  SQL' -> ['Python', 'SQL'])."""
    words = text.split()
    if not words:
        return []
    
    # Calculate average gap between words
    gaps = []
    for i in range(len(words) - 1):
        gap = len(text[text.find(words[i]) + len(words[i]):text.find(words[i + 1])])
        if gap > 0:  # Only count actual gaps
            gaps.append(gap)
    
    if not gaps:
        return [text]
    
    # If gap is more than 1.5x the average, consider it a skill separator
    avg_gap = sum(gaps) / len(gaps)
    threshold = avg_gap * 1.5
    
    result = []
    current = []
    for i, word in enumerate(words):
        current.append(word)
        if i < len(words) - 1:
            gap = len(text[text.find(word) + len(word):text.find(words[i + 1])])
            if gap > threshold:
                result.append(" ".join(current))
                current = []
    
    if current:
        result.append(" ".join(current))
    
    return result

def save_skills_to_json(skills: List[str], filename: str = "parsed_skills.json") -> None:
    """Save parsed skills to a JSON file."""
    # Create data directory if it doesn't exist
    os.makedirs("data", exist_ok=True)
    filepath = os.path.join("data", filename)
    
    # Load existing skills if file exists
    existing_skills = set()
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            existing_skills = set(json.load(f))
    
    # Add new skills and convert back to list
    all_skills = list(existing_skills.union(skills))
    
    # Save to file
    with open(filepath, 'w') as f:
        json.dump(all_skills, f, indent=2)

# ---------------------------------------------------------------------------
# Main parsing
# ---------------------------------------------------------------------------

def parse_resume(raw_text: str) -> ParsedResume:
    """Parse freeform résumé text into structured Experience and Skills."""
    sections = _split_by_headings(raw_text)

    # ----- EXPERIENCE -----
    experiences: List[Experience] = []
    exp_heading = next((h for h in EXPERIENCE_TITLES if h in sections), None)
    exp_text = sections.get(exp_heading, "")
    if exp_text:
        lines = [ln.strip() for ln in exp_text.splitlines() if ln.strip()]
        for idx, ln in enumerate(lines):
            match = _DATE_RANGE_RE.search(ln)
            if match:
                # Look at the two lines above the date line for job title and company
                job_title = lines[idx-2] if idx >= 2 else ""
                company = lines[idx-1] if idx >= 1 else ""
                
                # Only create experience if we have at least a job title
                if job_title:
                    start = match.group("start")
                    end = match.group("end")
                    if end and end.strip().upper() in CURRENT_TOKENS:
                        end = None
                    years = _compute_years(start, end)
                    experiences.append(
                        Experience(job_title=job_title, company=company,
                                   start_date=start, end_date=end,
                                   duration_years=years)
                    )

    # ----- SKILLS -----
    skills: List[str] = []
    skill_heading = next((h for h in SKILLS_TITLES if h in sections), None)
    skills_text = sections.get(skill_heading, "")
    if skills_text:
        # Remove special characters, dots, numbers, and normalize
        cleaned_text = re.sub(r'[*•=]', '', skills_text)  # Remove bullets and special chars
        cleaned_text = re.sub(r'\.+', '', cleaned_text)    # Remove dots
        cleaned_text = re.sub(r'\d+/\d+', '', cleaned_text)  # Remove ratings like "5/5"
        cleaned_text = re.sub(r'\d+', '', cleaned_text)    # Remove any remaining numbers
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text)   # Normalize whitespace
        
        # Split on commas and newlines
        tokens = re.split(r",|\n", cleaned_text)
        # Clean each token and filter out empty ones
        skills = [tok.strip() for tok in tokens if tok.strip()]
        
        # Save skills to JSON
        save_skills_to_json(skills)
        
    return ParsedResume(experiences=experiences, skills=skills)

# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------
# if __name__ == "__main__":
#     sample = (
#         "EXPERIENCE\nFounder and CEO\nVirgin Group\n1970 - Ongoing\n"
#         "Founder and Chairman\nVirgin Galactic\n2004 - 2023\n\n"
#         "SKILLS\nEntrepreneurship Leadership, Innovation Risk-taking, Strategy, Marketing, Team management\n"
#         "ACHIEVEMENTS\nSample"  # to ensure SKILLS stops before achievements
#     )
#     parsed = parse_resume(sample)
#     print(parsed.to_dict())
