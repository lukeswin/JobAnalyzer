import spacy
import re
from typing import Dict, List

class CVAnalyzer:
    def __init__(self):
        # Load the English language model
        self.nlp = spacy.load("en_core_web_lg")
        
        # Define common sections in CVs
        self.sections = {
            'education': ['education', 'academic background', 'qualifications', 'academic qualifications'],
            'experience': ['experience', 'work experience', 'employment history', 'work history'],
            'skills': ['skills', 'technical skills', 'core competencies', 'expertise']
        }
        
        # Common job titles
        self.job_titles = [
            "software engineer", "developer", "project manager", "data scientist",
            "product manager", "analyst", "consultant", "director", "engineer",
            "researcher", "designer", "architect"
        ]

    def extract_skills(self, text: str) -> List[str]:
        """Extract skills from text using NER and pattern matching."""
        doc = self.nlp(text)
        skills = set()
        
        # Extract skills based on noun phrases and proper nouns
        for chunk in doc.noun_chunks:
            if len(chunk.text) > 2:  # Filter out very short phrases
                skills.add(chunk.text.lower())
        
        # Extract technical skills (uppercase words are often technical skills)
        technical_skills = re.findall(r'\b[A-Z][A-Za-z0-9+#]+\b', text)
        skills.update([skill.lower() for skill in technical_skills])
        
        # Filter out common words and keep relevant skills
        filtered_skills = {
            skill for skill in skills
            if len(skill) > 2 and not any(
                common in skill.lower()
                for common in ['the', 'and', 'or', 'in', 'at', 'for', 'to']
            )
        }
        
        return list(filtered_skills)

    def extract_job_titles(self, text: str) -> List[str]:
        """Extract job titles from text."""
        doc = self.nlp(text)
        job_titles = []
        
        # Look for job titles in text
        for ent in doc.ents:
            if ent.label_ in ["ORG", "PERSON"]:
                continue
            
            # Check if entity contains common job title keywords
            if any(title in ent.text.lower() for title in self.job_titles):
                job_titles.append(ent.text)
        
        return list(set(job_titles))

    def extract_education(self, text: str) -> List[str]:
        """Extract education information."""
        doc = self.nlp(text)
        education = []
        
        # Look for education-related sentences
        for sent in doc.sents:
            if any(edu in sent.text.lower() for edu in self.sections['education']):
                education.append(sent.text.strip())
        
        return education

    def analyze_text(self, text: str) -> Dict:
        """Main method to analyze text from a CV."""
        # Analyze the text
        analysis = {
            'skills': self.extract_skills(text),
            'job_titles': self.extract_job_titles(text),
            'education': self.extract_education(text)
        }
        
        return analysis

# Example usage
if __name__ == "__main__":
    analyzer = CVAnalyzer()
    result = analyzer.analyze_text("Your CV text here")
    print("Analysis Results:")
    print("Skills:", result['skills'])
    print("Job Titles:", result['job_titles'])
    print("Education:", result['education']) 