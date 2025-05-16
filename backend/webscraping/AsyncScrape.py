import aiohttp
import asyncio
from bs4 import BeautifulSoup
import pandas as pd
import time
import random
from fake_useragent import UserAgent
from urllib.parse import urlencode, urlparse, parse_qs
import sqlite3
from datetime import datetime
import re

# Proxy configuration (replace with your proxy service details)
PROXY_HOST = "brd.superproxy.io"  # Bright Data host
PROXY_PORT = 33335
PROXY_USER = "brd-customer-hl_21d8569b-zone-datacenter_proxy1"
PROXY_PASS = "bo24j0qo0eqv"

PROXIES = {
    "http": f"http://{PROXY_USER}:{PROXY_PASS}@{PROXY_HOST}:{PROXY_PORT}",
    "https": f"http://{PROXY_USER}:{PROXY_PASS}@{PROXY_HOST}:{PROXY_PORT}",
}

# Alternative: Scrapingdog API (uncomment if using)
# SCRAPINGDOG_API_KEY = "your_api_key"
# SCRAPINGDOG_URL = "https://api.scrapingdog.com/linkedin"

# Initialize User-Agent rotator
ua = UserAgent()

def extract_job_id(job_url):
    """Extract the job ID from a LinkedIn job URL."""
    try:
        # Parse the URL and get the path
        parsed_url = urlparse(job_url)
        # The job ID is typically in the path after 'jobs/view/'
        path_parts = parsed_url.path.split('/')
        if 'jobs' in path_parts and 'view' in path_parts:
            job_id_index = path_parts.index('view') + 1
            if job_id_index < len(path_parts):
                return path_parts[job_id_index]
    except Exception as e:
        print(f"Error extracting job ID: {e}")
    return None

def job_exists(cursor, job_id):
    """Check if a job already exists in the database."""
    cursor.execute('SELECT 1 FROM jobs WHERE job_id = ?', (job_id,))
    return cursor.fetchone() is not None

def parse_location(location_str):
    """Parse location string into city and country."""
    parts = [part.strip() for part in location_str.split(',')]
    
    # Handle different location formats
    if len(parts) >= 2:
        city = parts[0]
        # Usually the country is the last part
        country = parts[-1]
        # Handle special cases like "Sydney, New South Wales, Australia"
        
        if 'United States' in country or 'USA' in country or 'US' in country:
            country = 'United States'
    else:
        # If we can't parse properly, put the whole string in country
        city = None
        country = location_str.strip()
    
    return city, country

def format_job_description(description):
    """Format job description text with minimal changes to preserve original structure."""
    # Remove 'Show more Show less' text that sometimes appears at the end
    description = re.sub(r'\s*Show\s+more\s+Show\s+less\s*$', '', description)
    
    # Fix common issues where words run together with no spaces
    # Handle camelCase pattern (lowercase directly followed by uppercase)
    description = re.sub(r'([a-z])([A-Z])', r'\1 \2', description)
    
    # Fix pattern: DeFi (keep as is, don't add space)
    description = re.sub(r'De Fi', 'DeFi', description)
    
    # Fix missing space between number and text
    description = re.sub(r'([0-9])([a-zA-Z])', r'\1 \2', description)
    
    # Fix missing spaces after periods for sentences run together
    description = re.sub(r'(\.)([A-Z][a-z])', r'\1 \2', description)
    
    # Fix spaces after commas if missing
    description = re.sub(r'(\,)([A-Za-z])', r'\1 \2', description)
    
    # Fix spaces after semicolons if missing
    description = re.sub(r'(\;)([A-Za-z])', r'\1 \2', description)
    
    # Fix no space after colons
    description = re.sub(r'(\:)([A-Za-z])', r'\1 \2', description)
    
    # Fix specific issues in the example text
    description = re.sub(r'reports\)Strong', r'reports) Strong', description)
    description = re.sub(r'preferred Stay', r'preferred. Stay', description)
    description = re.sub(r'assets Synthesize', r'assets. Synthesize', description)
    description = re.sub(r'as needed Support', r'as needed. Support', description)
    description = re.sub(r'chart\)\(Plus', r'chart). (Plus', description)
    description = re.sub(r'Work Perks: crypto\.com', r'Work Perks: Crypto.com', description)
    
    # Handle a specific pattern with run-together words after closing parenthesis
    description = re.sub(r'\)([A-Z][a-z])', r') \1', description)
    
    return description



async def get_job_description(session, job_url):
    try:
        # Add random delay before each description fetch
        await asyncio.sleep(random.uniform(1, 2))
        headers = {"User-Agent": ua.random}
        async with session.get(job_url, headers=headers, proxy=PROXIES["http"], timeout=10) as response:
            if response.status == 429:
                print(f"Rate limited, waiting before retry...")
                await asyncio.sleep(random.uniform(60, 90))  # Random delay between 60-90 seconds on rate limit
                return await get_job_description(session, job_url)  # Retry the request
                
            response.raise_for_status()
            html = await response.text()
            soup = BeautifulSoup(html, "html.parser")
            description = soup.select_one(".description__text").text.strip()
            
            # Format the description before returning it
            formatted_description = format_job_description(description)
            return formatted_description
    except Exception as e:
        print(f"Error fetching job description: {e}")
        return ""

async def get_job_listings(session, base_url, max_jobs=1000, city=None, country=None, job_title=None):
    jobs = []
    page = 0
    jobs_collected = 0

    while jobs_collected < max_jobs:
        params = {"start": page * 25}
        url = f"{base_url}&{urlencode(params)}"
        
        try:
            headers = {"User-Agent": ua.random}
            async with session.get(url, headers=headers, proxy=PROXIES["http"], timeout=10) as response:
                if response.status == 429:
                    print(f"Rate limited, waiting before retry...")
                    await asyncio.sleep(random.uniform(60, 90))  # Random delay between 60-90 seconds on rate limit
                    continue  # Retry the current page
                    
                response.raise_for_status()
                html = await response.text()
                soup = BeautifulSoup(html, "html.parser")
                job_cards = soup.select(".jobs-search__results-list li")
                
                if not job_cards:
                    print("No more jobs found or page structure changed.")
                    break
                
                # Process job cards in batches to avoid rate limiting
                batch_size = 1  # Process 1 job at a time
                for i in range(0, len(job_cards), batch_size):
                    batch_cards = job_cards[i:i + batch_size]
                    job_tasks = []
                    job_data_list = []
                    
                    for job_card in batch_cards:
                        try:
                            title = job_card.select_one(".base-search-card__title").text.strip()
                            company = job_card.select_one(".base-search-card__subtitle").text.strip()
                            location_str = job_card.select_one(".job-search-card__location").text.strip()
                            
                            job_link = job_card.select_one("a.base-card__full-link")["href"]
                            job_id = extract_job_id(job_link)
                            
                            if not job_id:
                                print(f"Could not extract job ID for: {title}")
                                continue
                            
                            job_data = {
                                "title": title,
                                "company": company,
                                "city": city,  # Use the city parameter directly
                                "country": country,  # Use the country parameter directly
                                "job_link": job_link,
                                "source_url": base_url,
                                "source_site": "LinkedIn"
                            }
                            job_data_list.append(job_data)
                            job_tasks.append(get_job_description(session, job_link))
                            
                        except AttributeError as e:
                            print(f"Error parsing job card: {e}")
                            continue
                    
                    if job_tasks:
                        try:
                            # Fetch descriptions in parallel for the batch
                            descriptions = await asyncio.gather(*job_tasks, return_exceptions=True)
                            
                            # Process results
                            for job_data, description in zip(job_data_list, descriptions):
                                if isinstance(description, Exception):
                                    print(f"Error fetching description for {job_data['title']}: {description}")
                                    description = ""
                                
                                job_data["description"] = description
                                jobs.append(job_data)
                                
                                jobs_collected += 1
                                print(f"Collected job {jobs_collected}: {job_data['title']} ({job_data['city']}, {job_data['country']})")
                                
                                if jobs_collected >= max_jobs:
                                    break
                            
                            # Add delay between batches
                            await asyncio.sleep(random.uniform(2, 4))  # Random delay between 2-4 seconds for batches
                            
                        except Exception as e:
                            print(f"Error processing batch: {e}")
                    
                    if jobs_collected >= max_jobs:
                        break
                
                page += 1
                
                if len(job_cards) < 25:
                    print("Reached end of job listings.")
                    break
                    
        except Exception as e:
            print(f"Error fetching page {page}: {e}")
            await asyncio.sleep(random.uniform(30, 45))  # Random delay between 30-45 seconds on error
            continue
    
    return jobs

def save_to_sqlite(jobs, db_name="linkedin_jobs.db"):
    # Create a connection to SQLite database
    conn = sqlite3.connect(db_name)
    cursor = conn.cursor()
    
    # Create the jobs table if it doesn't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            title TEXT,
            company TEXT,
            city TEXT,
            country TEXT,
            description TEXT,
            job_link TEXT,
            source_url TEXT,
            source_site TEXT,
            date_added TIMESTAMP,
            scraped_date TIMESTAMP
        )
    ''')
    
    # Create indexes for faster queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_city ON jobs (city)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_scraped_date ON jobs (scraped_date)')
    
    # Insert jobs into the database
    new_jobs = 0
    skipped_jobs = 0
    current_time = datetime.now()
    
    for job in jobs:
        job_id = extract_job_id(job['job_link'])
        if not job_id:
            print(f"Could not extract job ID for: {job['title']}")
            continue
            
        try:
            # Check if job exists to determine if this is a new or existing job
            cursor.execute('SELECT date_added FROM jobs WHERE job_id = ?', (job_id,))
            existing_job = cursor.fetchone()
            
            if existing_job:
                # Update existing job with new scraped_date
                cursor.execute('''
                    UPDATE jobs 
                    SET title = ?, company = ?, city = ?, country = ?, 
                        description = ?, job_link = ?, source_url = ?, 
                        source_site = ?, scraped_date = ?
                    WHERE job_id = ?
                ''', (
                    job['title'],
                    job['company'],
                    job['city'],
                    job['country'],
                    job['description'],
                    job['job_link'],
                    job['source_url'],
                    job['source_site'],
                    current_time,
                    job_id
                ))
                skipped_jobs += 1
                print(f"Updated existing job: {job['title']}")
            else:
                # Insert new job with both date_added and scraped_date
                cursor.execute('''
                    INSERT INTO jobs (
                        job_id, title, company, city, country, description, 
                        job_link, source_url, source_site, date_added, scraped_date
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    job_id,
                    job['title'],
                    job['company'],
                    job['city'],
                    job['country'],
                    job['description'],
                    job['job_link'],
                    job['source_url'],
                    job['source_site'],
                    current_time,  # date_added
                    current_time   # scraped_date
                ))
                new_jobs += 1
                print(f"Added new job: {job['title']}")
                
        except sqlite3.IntegrityError as e:
            print(f"Error processing job {job['title']}: {e}")
            skipped_jobs += 1
            continue
    
    # Commit the changes and close the connection
    conn.commit()
    conn.close()
    print(f"Added {new_jobs} new jobs, updated {skipped_jobs} existing jobs to {db_name}")

def get_scrape_progress(db_name="linkedin_jobs.db"):
    """Get the progress of the last scrape from the database."""
    conn = sqlite3.connect(db_name)
    cursor = conn.cursor()
    
    # Create progress table if it doesn't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scrape_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            city TEXT,
            job_title TEXT,
            jobs_collected INTEGER,
            last_updated TIMESTAMP,
            status TEXT
        )
    ''')
    
    # Get the last scrape progress
    cursor.execute('''
        SELECT city, job_title, jobs_collected, status 
        FROM scrape_progress 
        ORDER BY last_updated DESC 
        LIMIT 1
    ''')
    
    progress = cursor.fetchone()
    conn.close()
    
    if progress:
        return {
            'city': progress[0],
            'job_title': progress[1],
            'jobs_collected': progress[2],
            'status': progress[3]
        }
    return None

def update_scrape_progress(city, job_title, jobs_collected, status, db_name="linkedin_jobs.db"):
    """Update the progress of the current scrape."""
    conn = sqlite3.connect(db_name)
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO scrape_progress (city, job_title, jobs_collected, last_updated, status)
        VALUES (?, ?, ?, ?, ?)
    ''', (city, job_title, jobs_collected, datetime.now(), status))
    
    conn.commit()
    conn.close()

async def main():
    # Define cities with their LinkedIn location encodings and country
    # Format: (city_name, encoded_location_string, country)
    cities = [
        ("Sydney", "Sydney%2C%20New%20South%20Wales%2C%20Australia", "Australia"),
        ("Melbourne", "Melbourne%2C%20Victoria%2C%20Australia", "Australia"),
        ("Brisbane", "Brisbane%2C%20Queensland%2C%20Australia", "Australia")
        # Easy to expand with new cities and countries, for example:
        # ("London", "London%2C%20England%2C%20United%20Kingdom", "United Kingdom"),
        # ("New York", "New%20York%2C%20New%20York%2C%20United%20States", "United States"),
        # ("Toronto", "Toronto%2C%20Ontario%2C%20Canada", "Canada"),
    ]
    
    # Define job titles with weights
    job_titles = [
        ("Software Engineer", 3), ("Data Analyst", 3), ("Project Manager", 1), ("Registered Nurse", 3), ("Accountant", 1),
        ("Marketing Manager", 1), ("Civil Engineer", 1), ("Teacher", 1), ("Sales Manager", 1), ("Graphic Designer", 1),
        ("Human Resources Manager", 1), ("Electrician", 1), ("Financial Analyst", 1), ("Chef", 1), ("Logistics Coordinator", 1),
        ("Customer Service Representative", 1), ("Business Development Manager", 1), ("Occupational Therapist", 0.3),
        ("Retail Manager", 1), ("Mechanical Engineer", 1),
        ("Frontend Developer", 3), ("Backend Developer", 3), ("DevOps Engineer", 3), ("Data Scientist", 3), ("Machine Learning Engineer", 1),
        ("Cloud Architect", 1), ("Cybersecurity Analyst", 1), ("IT Support Specialist", 1), ("Database Administrator", 1), ("Systems Analyst", 1),
        ("Network Engineer", 1), ("UX Designer", 1), ("UI Designer", 1), ("Technical Writer", 0.3), ("Product Manager", 1),
        ("General Practitioner", 1), ("Pharmacist", 1), ("Physiotherapist", 1), ("Dentist", 0.3), ("Medical Laboratory Technician", 0.3),
        ("Midwife", 0.3), ("Radiographer", 0.3), ("Paramedic", 1), ("Clinical Psychologist", 0.3), ("Aged Care Worker", 1),
        ("Financial Planner", 1), ("Tax Consultant", 1), ("Investment Analyst", 1), ("Risk Manager", 1), ("Management Consultant", 1),
        ("Business Analyst", 3), ("Procurement Manager", 1), ("Auditor", 1), ("Credit Analyst", 1), ("Payroll Officer", 1),
        ("Structural Engineer", 1), ("Electrical Engineer", 1), ("Environmental Engineer", 0.3), ("Quantity Surveyor", 1), ("Construction Manager", 1),
        ("Plumber", 1), ("Carpenter", 1), ("Welder", 1), ("Site Supervisor", 1), ("Building Inspector", 0.3),
        ("University Lecturer", 0.3), ("Early Childhood Educator", 1), ("Special Education Teacher", 0.3), ("Vocational Trainer", 0.3), ("Librarian", 0.3),
        ("Education Consultant", 0.3), ("School Counselor", 0.3), ("Academic Researcher", 0.3),
        ("Barista", 1), ("Hotel Manager", 1), ("Travel Agent", 0.3), ("Event Coordinator", 1), ("Sous Chef", 1),
        ("Restaurant Manager", 1), ("Tour Guide", 0.3), ("Bartender", 1),
        ("Sales Representative", 1), ("Store Assistant", 1), ("Merchandiser", 1), ("E-commerce Specialist", 1), ("Real Estate Agent", 1),
        ("Account Manager", 1), ("Customer Success Manager", 1),
        ("Lawyer", 1), ("Paralegal", 1), ("Compliance Officer", 1), ("Legal Secretary", 1), ("Policy Analyst", 0.3),
        ("Content Creator", 1), ("Video Editor", 0.3), ("Journalist", 0.3), ("Public Relations Specialist", 1), ("Photographer", 0.3),
        ("Copywriter", 1), ("Art Director", 0.3),
        ("Production Manager", 1), ("Warehouse Manager", 1), ("Supply Chain Analyst", 1), ("Forklift Operator", 1), ("Quality Assurance Inspector", 1),
        ("Maintenance Technician", 1), ("Factory Worker", 1),
        ("Environmental Scientist", 0.3), ("Agricultural Consultant", 0.3), ("Horticulturist", 0.3), ("Park Ranger", 0.3), ("Sustainability Consultant", 0.3),
        ("Public Servant", 1), ("Urban Planner", 0.3), ("Social Worker", 1), ("Community Development Officer", 0.3), ("Emergency Services Officer", 0.3),
        ("Actor", 0.3), ("Musician", 0.3), ("Stage Manager", 0.3)
    ]
    
    base_jobs = 3  # Target average jobs per title (reduced from 100)
    average_weight = sum(weight for _, weight in job_titles) / len(job_titles)  # ~0.934
    
    print("Starting LinkedIn job scraper...")
    
    # Check for previous progress
    progress = get_scrape_progress()
    if progress and progress['status'] == 'in_progress':
        print(f"Resuming from previous scrape: {progress['job_title']} in {progress['city']}")
        # Find the index of the last processed job title
        job_index = next(i for i, (title, _) in enumerate(job_titles) if title == progress['job_title'])
    else:
        job_index = 0
    
    async with aiohttp.ClientSession() as session:
        # Process job titles
        for job_title, weight in job_titles[job_index:]:
            try:
                # Calculate weighted max_jobs_per_city
                max_jobs_per_query = int(base_jobs * (weight / average_weight))
                max_jobs_per_city = max_jobs_per_query // len(cities)  # Distribute across all cities
                max_jobs_per_city = max(5, min(200, max_jobs_per_city))  # Cap between 5 and 200
                
                # Create tasks for all cities concurrently
                city_tasks = []
                for city_name, location_encoded, country in cities:
                    # Update progress
                    update_scrape_progress(city_name, job_title, 0, 'in_progress')
                    
                    # Construct LinkedIn search URL
                    keywords_encoded = job_title.replace(' ', '%20')
                    base_url = f"https://www.linkedin.com/jobs/search/?keywords={keywords_encoded}&location={location_encoded}"
                    print(f"Scraping {max_jobs_per_city} jobs for {job_title} in {city_name}, {country}...")
                    
                    # Create task for this city - pass both city_name and country
                    task = get_job_listings(session, base_url, max_jobs_per_city, city_name, country, job_title)
                    city_tasks.append((city_name, task))
                
                # Run all city tasks concurrently
                city_results = await asyncio.gather(*[task for _, task in city_tasks], return_exceptions=True)
                
                # Process results from all cities
                for (city_name, _), result in zip(city_tasks, city_results):
                    if isinstance(result, Exception):
                        print(f"Error processing {job_title} in {city_name}: {result}")
                        update_scrape_progress(city_name, job_title, 0, 'error')
                    else:
                        save_to_sqlite(result)
                        update_scrape_progress(city_name, job_title, len(result), 'completed')
                
                # Add small delay between job titles
                if job_title != job_titles[job_index][0]:  # Skip delay for first job title
                    await asyncio.sleep(random.uniform(1, 2))  # Reduced delay between job titles
                
            except Exception as e:
                print(f"Error processing {job_title}: {e}")
                for city_name, _, _ in cities:
                    update_scrape_progress(city_name, job_title, 0, 'error')
                continue
    
    print("Scraping completed.")

if __name__ == "__main__":
    asyncio.run(main())