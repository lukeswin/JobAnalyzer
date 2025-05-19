from __future__ import annotations

"""Light‑weight résumé parser used by the JobAnalyzer backend.

This mirrors the TS logic used on the front‑end but runs entirely in Python so
we can reuse it in API routes / Celery workers without duplicating business
rules.
"""

import re
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Dict, Optional

import dateutil.parser

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

CURRENT_TOKENS = {"present", "ongoing", "current"}


@dataclass
class Experience:
    job_title: str
    company: str
    start_date: Optional[str] = None  # ISO YYYY or YYYY-MM-DD
    end_date: Optional[str] = None    # ISO YYYY or YYYY-MM-DD / None if ongoing
    duration_years: Optional[int] = None


@dataclass
class ParsedResume:
    experiences: List[Experience]
    skills: List[str]

    def to_dict(self) -> Dict:
        """Convenience helper when serialising as JSON."""
        return {
            "experiences": [asdict(exp) for exp in self.experiences],
            "skills": self.skills,
        }


# ---------------------------------------------------------------------------
# Core parsing helpers
# ---------------------------------------------------------------------------

# Detect headings that are ALL CAPS (or Title‑case but all words capitalised)
_HEADING_RE = re.compile(r"^[A-Z][A-Z\s]{2,}$")
# Simple date‑range regex – captures YYYY‑YYYY or YYYY‑Present / Ongoing
_DATE_RANGE_RE = re.compile(
    r"(?P<start>\d{4})\s*[–\-]\s*(?P<end>\d{4}|Present|Ongoing|Current)", re.I
)


def _split_by_headings(text: str) -> Dict[str, str]:
    """Return dict mapping HEADING → joined body lines."""
    sections: Dict[str, List[str]] = {}
    current = "_START"
    sections[current] = []

    for line in text.splitlines():
        if _HEADING_RE.match(line.strip()):
            current = line.strip().upper()
            sections[current] = []
        else:
            sections[current].append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items() if v}


def _compute_years(start: str, end: Optional[str] = None) -> Optional[int]:
    try:
        start_dt = dateutil.parser.parse(start, default=datetime(datetime.now().year, 1, 1))
        end_dt = (
            dateutil.parser.parse(end, default=datetime(datetime.now().year, 1, 1))
            if end and end.lower() not in CURRENT_TOKENS
            else datetime.now()
        )
        years = round((end_dt - start_dt).days / 365)
        return max(years, 0)
    except (ValueError, OverflowError):
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_resume(raw_text: str) -> ParsedResume:
    """Parse freeform résumé text → structured dict.

    Heuristics only – designed for clean, modern resumes with clear headings.
    For production systems, consider spaCy NER models or a 3rd‑party parser.
    """
    sections = _split_by_headings(raw_text)

    # ------------------------- EXPERIENCE ------------------------------
    exp_section = sections.get("EXPERIENCE", "")
    # Split blocks by empty lines (2+ newlines)
    blocks = [b.strip() for b in re.split(r"\n{2,}", exp_section) if b.strip()]

    experiences: List[Experience] = []
    for blk in blocks:
        lines = [ln.strip() for ln in blk.splitlines() if ln.strip()]
        if not lines:
            continue
        job_title = lines[0]
        company = lines[1] if len(lines) > 1 else ""

        start_date = end_date = None
        duration = None
        match = _DATE_RANGE_RE.search(blk)
        if match:
            start_date = match.group("start")
            end_date = match.group("end")
            if end_date.lower() in CURRENT_TOKENS:
                end_date = None
            duration = _compute_years(start_date, end_date)

        experiences.append(
            Experience(
                job_title=job_title,
                company=company,
                start_date=start_date,
                end_date=end_date,
                duration_years=duration,
            )
        )

    # --------------------------- SKILLS --------------------------------
    skills_section = sections.get("SKILLS", "")
    # support bullets (•, -, *) or comma‑separated lists
    raw_skills = re.split(r"[•\-*]\s*|\n", skills_section)
    skills: List[str] = []
    for token in raw_skills:
        skills.extend([s.strip() for s in token.split(",")])
    skills = [s for s in {s for s in skills} if len(s) > 1]

    return ParsedResume(experiences=experiences, skills=skills)


# ---------------------------------------------------------------------------
# Demo / smoke test (can be removed in production)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    sample = (
        """EXPERIENCE\nFounder and CEO\nVirgin Group\n1970 - Ongoing\n\n"""
        "Founder and Chairman\nVirgin Galactic\n2004 - 2023\n\nSKILLS\nLeadership, Innovation, Risk‑taking"""
    )
    parsed = parse_resume(sample)
    print(parsed.to_dict())
