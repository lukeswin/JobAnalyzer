import spacy
from typing import Dict, List, Any
import re
from skills import skills as predefined_skills
import gc

class CVAnalyzer:
    def __init__(self):
        try:
            # Load the small English model
            self.nlp = spacy.load("en_core_web_sm")
            
            # Load predefined skills and create a set for faster lookup
            self.predefined_skills = set(skill.lower() for skill in predefined_skills)
            
            # Define skill-related keywords and patterns
            self.skill_keywords = [
                "skill", "skills", "proficiency", "proficient", "expertise", "expert", 
                "knowledge", "experienced", "experience", "ability", "abilities",
                "competency", "competencies", "capability", "capabilities",
                "technical", "professional", "interpersonal", "soft", "hard"
            ]
            
            # Common skill categories and their keywords
            self.skill_categories = {
                "technical": ["programming", "coding", "development", "software", "code", "developer", "technical"],
                "languages": ["language", "languages", "fluent", "proficient", "speak", "written", "spoken"],
                "tools": ["tool", "tools", "software", "platform", "framework", "library"],
                "methodologies": ["methodology", "methodologies", "agile", "scrum", "waterfall", "kanban"],
                "databases": ["database", "databases", "sql", "nosql", "db", "data storage"],
                "cloud": ["cloud", "aws", "azure", "gcp", "google cloud", "amazon web services"],
                "devops": ["devops", "ci/cd", "continuous integration", "continuous deployment", "docker", "kubernetes"]
            }
        except Exception as e:
            raise RuntimeError(f"Failed to initialize CVAnalyzer: {str(e)}")

    def __del__(self):
        """Cleanup method to free resources"""
        try:
            if hasattr(self, 'nlp'):
                del self.nlp
            gc.collect()
        except Exception:
            pass

    def analyze_text(self, text: str) -> Dict[str, Any]:
        """
        Analyze the CV text using spaCy and extract relevant information.
        
        Args:
            text: The text extracted from the CV
            
        Returns:
            Dictionary containing the analysis results
        """
        if not text or not isinstance(text, str):
            raise ValueError("Invalid text input")

        try:
            # Process the text with spaCy
            doc = self.nlp(text)
            
            # Extract named entities
            entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents]
            
            # Extract skills with enhanced detection
            skills = self._extract_skills(doc)
            
            # Extract education
            education = self._extract_education(doc)
            
            # Extract work experience
            experience = self._extract_experience(doc)
            
            # Extract contact information
            contact_info = self._extract_contact_info(doc)
            
            # Force garbage collection after analysis
            del doc
            gc.collect()
            
            return {
                "entities": entities,
                "skills": skills,
                "education": education,
                "experience": experience,
                "contact_info": contact_info
            }
        except Exception as e:
            raise RuntimeError(f"Error during text analysis: {str(e)}")
    
    def _extract_skills(self, doc) -> Dict[str, List[str]]:
        """Extract skills from the text with enhanced detection using predefined skills list."""
        skills = {
            "technical": [],
            "languages": [],
            "tools": [],
            "methodologies": [],
            "databases": [],
            "cloud": [],
            "devops": [],
            "other": []
        }
        
        # First, look for explicit skill sections
        skill_section = False
        for sent in doc.sents:
            # Check if this is a skill section heading
            if any(keyword in sent.text.lower() for keyword in ["skills:", "skills", "technical skills", "professional skills"]):
                skill_section = True
                continue
            
            # If we're in a skill section, process the content
            if skill_section:
                # Look for skills in the sentence
                for token in sent:
                    # Skip common non-skill words
                    if token.text.lower() in ["and", "or", "with", "in", "of", "the", "a", "an"]:
                        continue
                    
                    # Check if token is a potential skill
                    if token.pos_ in ["NOUN", "PROPN"] and len(token.text) > 2:
                        skill = token.text
                        # Check if the skill is in our predefined list
                        if skill.lower() in self.predefined_skills:
                            category = self._categorize_skill(skill)
                            if category:
                                skills[category].append(skill)
                            else:
                                skills["other"].append(skill)
                
                # Also check for skills in compound nouns
                for chunk in sent.noun_chunks:
                    if len(chunk.text) > 2:  # Skip very short chunks
                        skill = chunk.text
                        # Check if the skill is in our predefined list
                        if skill.lower() in self.predefined_skills:
                            category = self._categorize_skill(skill)
                            if category:
                                skills[category].append(skill)
                            else:
                                skills["other"].append(skill)
            
            # If we hit a new section heading, stop the skill section
            if any(keyword in sent.text.lower() for keyword in ["experience", "education", "work", "projects"]):
                skill_section = False
        
        # Remove duplicates and clean up
        for category in skills:
            skills[category] = list(set(skills[category]))
            skills[category] = [skill for skill in skills[category] if len(skill) > 2]  # Remove very short strings
        
        return skills
    
    def _categorize_skill(self, skill: str) -> str:
        """Categorize a skill into one of the predefined categories."""
        skill_lower = skill.lower()
        
        # Check programming languages and frameworks
        if any(keyword in skill_lower for keyword in ["python", "java", "javascript", "typescript", "c++", "c#", "ruby", "php", "go", "rust"]):
            return "technical"
        
        # Check natural languages
        if any(keyword in skill_lower for keyword in ["english", "spanish", "french", "german", "chinese", "japanese"]):
            return "languages"
        
        # Check tools and frameworks
        if any(keyword in skill_lower for keyword in ["react", "angular", "vue", "django", "flask", "spring", "node", "express"]):
            return "tools"
        
        # Check methodologies
        if any(keyword in skill_lower for keyword in ["agile", "scrum", "kanban", "waterfall", "lean"]):
            return "methodologies"
        
        # Check databases
        if any(keyword in skill_lower for keyword in ["mysql", "postgresql", "mongodb", "redis", "oracle", "sql"]):
            return "databases"
        
        # Check cloud technologies
        if any(keyword in skill_lower for keyword in ["aws", "azure", "gcp", "cloud", "s3", "ec2", "lambda"]):
            return "cloud"
        
        # Check devops tools
        if any(keyword in skill_lower for keyword in ["docker", "kubernetes", "jenkins", "git", "ci/cd", "terraform"]):
            return "devops"
        
        return "other"
    
    def _extract_education(self, doc) -> List[Dict[str, str]]:
        """Extract education information."""
        education = []
        education_keywords = ["university", "college", "school", "degree", "bachelor", "master", "phd"]
        
        for token in doc:
            if token.text.lower() in education_keywords:
                # Look for education details in the surrounding context
                education_entry = {
                    "institution": "",
                    "degree": "",
                    "year": ""
                }
                
                for child in token.children:
                    if child.pos_ == "PROPN":
                        education_entry["institution"] = child.text
                    elif child.pos_ == "NOUN":
                        education_entry["degree"] = child.text
                
                education.append(education_entry)
        
        return education
    
    def _extract_experience(self, doc) -> List[Dict[str, str]]:
        """Extract work experience information."""
        experience = []
        experience_keywords = ["company", "firm", "organization", "role", "position", "job"]
        
        for token in doc:
            if token.text.lower() in experience_keywords:
                # Look for experience details in the surrounding context
                experience_entry = {
                    "company": "",
                    "position": "",
                    "duration": ""
                }
                
                for child in token.children:
                    if child.pos_ == "PROPN":
                        experience_entry["company"] = child.text
                    elif child.pos_ == "NOUN":
                        experience_entry["position"] = child.text
                
                experience.append(experience_entry)
        
        return experience
    
    def _extract_contact_info(self, doc) -> Dict[str, str]:
        """Extract contact information."""
        contact_info = {
            "email": "",
            "phone": "",
            "location": ""
        }
        
        # Look for email patterns
        for token in doc:
            if "@" in token.text:
                contact_info["email"] = token.text
        
        # Look for phone numbers
        for token in doc:
            if any(c.isdigit() for c in token.text) and len(token.text) >= 10:
                contact_info["phone"] = token.text
        
        # Look for location
        for ent in doc.ents:
            if ent.label_ == "GPE":  # GPE = Geo-Political Entity
                contact_info["location"] = ent.text
        
        return contact_info 