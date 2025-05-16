import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import random
from fake_useragent import UserAgent
from urllib.parse import urlencode, urlparse, parse_qs
import sqlite3
from datetime import datetime

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

def get_job_listings(base_url, max_jobs=1000):
    jobs = []
    page = 0
    jobs_collected = 0

    while jobs_collected < max_jobs:
        # Construct URL with pagination
        params = {"start": page * 25}  # LinkedIn loads 25 jobs per page
        url = f"{base_url}&{urlencode(params)}"
        
        try:
            # Rotate User-Agent
            headers = {"User-Agent": ua.random}
            
            # Make request through proxy
            response = requests.get(url, headers=headers, proxies=PROXIES, timeout=10)
            response.raise_for_status()  # Raise exception for bad status codes
            
            # Parse HTML
            soup = BeautifulSoup(response.text, "html.parser")
            job_cards = soup.select(".jobs-search__results-list li")
            
            if not job_cards:
                print("No more jobs found or page structure changed.")
                break
            
            for job_card in job_cards:
                try:
                    title = job_card.select_one(".base-search-card__title").text.strip()
                    company = job_card.select_one(".base-search-card__subtitle").text.strip()
                    location_str = job_card.select_one(".job-search-card__location").text.strip()
                    
                    # Parse location into city and country
                    city, country = parse_location(location_str)
                    
                    # Extract job link for detailed description
                    job_link = job_card.select_one("a.base-card__full-link")["href"]
                    
                    # Extract job ID before scraping description
                    job_id = extract_job_id(job_link)
                    if not job_id:
                        print(f"Could not extract job ID for: {title}")
                        continue
                    
                    # Scrape job description (optional, comment out if not needed)
                    description = get_job_description(job_link)
                    
                    jobs.append({
                        "title": title,
                        "company": company,
                        "city": city,
                        "country": country,
                        "description": description,
                        "job_link": job_link,
                        "source_url": base_url,
                        "source_site": "LinkedIn"
                    })
                    
                    jobs_collected += 1
                    print(f"Collected job {jobs_collected}: {title} ({city}, {country})")
                    
                    if jobs_collected >= max_jobs:
                        break
                
                except AttributeError as e:
                    print(f"Error parsing job card: {e}")
                    continue
                
                # Random delay to mimic human behavior
                time.sleep(random.uniform(5, 10))
            
            page += 1
            
            # Check if no more jobs are available
            if len(job_cards) < 25:
                print("Reached end of job listings.")
                break
                
        except requests.RequestException as e:
            print(f"Error fetching page {page}: {e}")
            time.sleep(10)  # Wait before retrying
            continue
    
    return jobs

def get_job_description(job_url):
    try:
        headers = {"User-Agent": ua.random}
        response = requests.get(job_url, headers=headers, proxies=PROXIES, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        description = soup.select_one(".description__text").text.strip()
        return description
    except (requests.RequestException, AttributeError) as e:
        print(f"Error fetching job description: {e}")
        return ""

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

def main():
    cities = [
        ("Sydney", "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Sydney%2C%20New%20South%20Wales%2C%20Australia"),
        ("Melbourne", "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Melbourne%2C%20Victoria%2C%20Australia"),
        ("Brisbane", "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Brisbane%2C%20Queensland%2C%20Australia")
    ]
    max_jobs_per_city = 100  # Adjust as needed

    print("Starting LinkedIn job scraper...")
    for city, base_url in cities:
        print(f"Scraping jobs for {city}...")
        jobs = get_job_listings(base_url, max_jobs_per_city, city)
        save_to_sqlite(jobs)
    print("Scraping completed.")

if __name__ == "__main__":
    main()