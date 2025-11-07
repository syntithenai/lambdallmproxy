#!/usr/bin/env python3
"""
Brave Search using Selenium WebDriver

Performs Brave searches and extracts results using browser automation.
Brave Search is much more automation-friendly than Google and doesn't
require advanced anti-detection measures.

Usage:
    python brave-search.py "search query" --max-results 5
"""

import sys
import json
import argparse
import time
import os

# Fix Python path to include both system and user packages
paths_to_add = [
    '/usr/lib/python3/dist-packages',  # System packages
    os.path.expanduser('~/.local/lib/python{}.{}/site-packages'.format(
        sys.version_info.major, sys.version_info.minor))  # User packages
]
for path in paths_to_add:
    if os.path.exists(path) and path not in sys.path:
        sys.path.append(path)

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Failed to import Selenium: {str(e)}. Install with: sudo apt install python3-selenium chromium-chromedriver && pip3 install --user webdriver-manager",
        "results": []
    }))
    sys.exit(1)

def setup_driver(headless=True):
    """Set up Chrome WebDriver with optimal settings for Brave Search"""
    options = Options()
    
    if headless:
        options.add_argument('--headless')  # Use old headless mode for compatibility
    
    # Basic Chrome args for stability and avoid snap issues
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-software-rasterizer')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-setuid-sandbox')
    options.add_argument('--single-process')  # Avoid renderer issues
    options.add_argument('--disable-background-networking')
    options.add_argument('--disable-default-apps')
    options.add_argument('--disable-sync')
    options.add_argument('--metrics-recording-only')
    options.add_argument('--mute-audio')
    options.add_argument('--no-first-run')
    
    # User agent (standard Chrome)
    options.add_argument('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    # Try multiple browser locations
    browser_paths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome'
    ]
    
    for browser_path in browser_paths:
        if os.path.exists(browser_path):
            options.binary_location = browser_path
            print(f"🌐 Using browser: {browser_path}", file=sys.stderr)
            break
    
    try:
        # Try system chromedriver first (more reliable)
        chromedriver_paths = [
            '/usr/bin/chromedriver',
            '/usr/local/bin/chromedriver',
            '/snap/bin/chromedriver'
        ]
        
        chromedriver_path = None
        for path in chromedriver_paths:
            if os.path.exists(path):
                chromedriver_path = path
                print(f"🚗 Using chromedriver: {chromedriver_path}", file=sys.stderr)
                break
        
        if chromedriver_path:
            service = Service(executable_path=chromedriver_path)
            driver = webdriver.Chrome(service=service, options=options)
        else:
            # Fallback to webdriver-manager
            print(f"⚠️ System chromedriver not found, trying webdriver-manager...", file=sys.stderr)
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
        
        driver.set_page_load_timeout(30)
        return driver
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Failed to initialize Chrome WebDriver: {str(e)}",
            "results": []
        }), file=sys.stderr)
        sys.exit(1)

def extract_search_results(driver, max_results=5):
    """Extract search results from Brave Search page"""
    results = []
    
    try:
        # Wait for results to load (Brave uses client-side rendering)
        time.sleep(3)  # Give JavaScript time to render
        
        # Try multiple selectors for Brave Search results
        selectors = [
            'div.snippet',  # Main result container
            'div[data-type="web"]',  # Web result type
            'div.result',  # Generic result
            '.snippet.fdb',  # Full result with snippet
        ]
        
        result_elements = []
        for selector in selectors:
            result_elements = driver.find_elements(By.CSS_SELECTOR, selector)
            if result_elements:
                print(f"✅ Found {len(result_elements)} results using selector: {selector}", file=sys.stderr)
                break
        
        if not result_elements:
            print("⚠️ No result elements found with any selector", file=sys.stderr)
            # Try executing JavaScript to get results
            js_results = driver.execute_script("""
                const results = [];
                const snippets = document.querySelectorAll('div.snippet, div[data-type="web"]');
                snippets.forEach((el, idx) => {
                    const titleEl = el.querySelector('a.result-header, h2 a, .title a');
                    const descEl = el.querySelector('.snippet-description, .snippet-content, p');
                    if (titleEl) {
                        results.push({
                            title: titleEl.textContent.trim(),
                            url: titleEl.href,
                            description: descEl ? descEl.textContent.trim() : ''
                        });
                    }
                });
                return results;
            """)
            
            if js_results:
                print(f"✅ Found {len(js_results)} results via JavaScript", file=sys.stderr)
                for idx, item in enumerate(js_results[:max_results]):
                    if item.get('title') and item.get('url'):
                        results.append(item)
                        print(f"✅ Result {idx + 1}: {item['title'][:50]}...", file=sys.stderr)
                return results
        
        # Parse DOM elements
        for idx, element in enumerate(result_elements[:max_results]):
            try:
                # Try various title selectors
                title = None
                url = None
                
                title_selectors = ['a.result-header', 'h2 a', '.title a', 'a[href*="http"]']
                for sel in title_selectors:
                    try:
                        title_elem = element.find_element(By.CSS_SELECTOR, sel)
                        title = title_elem.text.strip()
                        url = title_elem.get_attribute('href')
                        if title and url:
                            break
                    except:
                        continue
                
                # Try various description selectors
                description = ""
                desc_selectors = ['.snippet-description', '.snippet-content', 'p', '.description']
                for sel in desc_selectors:
                    try:
                        desc_elem = element.find_element(By.CSS_SELECTOR, sel)
                        description = desc_elem.text.strip()
                        if description:
                            break
                    except:
                        continue
                
                if title and url:
                    results.append({
                        'title': title,
                        'url': url,
                        'description': description
                    })
                    print(f"✅ Result {idx + 1}: {title[:50]}...", file=sys.stderr)
                
            except Exception as e:
                print(f"⚠️ Error parsing result {idx + 1}: {str(e)}", file=sys.stderr)
                continue
        
    except Exception as e:
        print(f"❌ Error extracting results: {str(e)}", file=sys.stderr)
    
    return results

def perform_brave_search(query, max_results=5, headless=True):
    """Perform a Brave search and return results"""
    driver = None
    
    try:
        driver = setup_driver(headless=headless)
        
        # Navigate to Brave Search
        search_url = f"https://search.brave.com/search?q={query.replace(' ', '+')}"
        print(f"🌐 Navigating to: {search_url}", file=sys.stderr)
        driver.get(search_url)
        
        # Wait a moment for page to stabilize
        time.sleep(2)
        
        # Debug: Check page title
        print(f"📄 Page title: {driver.title}", file=sys.stderr)
        
        # Extract results
        results = extract_search_results(driver, max_results)
        
        return {
            "success": True,
            "query": query,
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        return {
            "success": False,
            "query": query,
            "error": str(e),
            "results": []
        }
    
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

def main():
    parser = argparse.ArgumentParser(description='Brave Search via Selenium')
    parser.add_argument('query', type=str, help='Search query')
    parser.add_argument('--max-results', type=int, default=5, help='Maximum number of results')
    parser.add_argument('--headless', action='store_true', default=True, help='Run in headless mode')
    parser.add_argument('--visible', action='store_true', help='Run in visible mode (not headless)')
    
    args = parser.parse_args()
    
    headless = args.headless and not args.visible
    
    result = perform_brave_search(
        query=args.query,
        max_results=args.max_results,
        headless=headless
    )
    
    print(json.dumps(result, indent=2))
    
    if not result['success']:
        sys.exit(1)

if __name__ == '__main__':
    main()
