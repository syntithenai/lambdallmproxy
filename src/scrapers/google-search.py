#!/usr/bin/env python3
"""
Google Search using Selenium WebDriver with Undetected ChromeDriver

Performs Google searches and extracts results using browser automation.
This bypasses API limits and provides fresh, reliable search results.

Uses undetected_chromedriver to bypass Google's bot detection.

Usage:
    python google-search.py "search query" --max-results 5
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

# Python 3.12 compatibility: distutils was removed, provide shim
if sys.version_info >= (3, 12):
    import types
    distutils = types.ModuleType('distutils')
    distutils.version = types.ModuleType('distutils.version')
    
    class LooseVersion:
        """Simplified LooseVersion for Python 3.12+ compatibility"""
        def __init__(self, vstring):
            self.vstring = str(vstring)
            self.version = [int(x) if x.isdigit() else x for x in vstring.replace('-', '.').replace('_', '.').split('.')]
        
        def __str__(self):
            return self.vstring
        
        def __repr__(self):
            return f"LooseVersion('{self.vstring}')"
        
        def __eq__(self, other):
            return self.version == (other.version if isinstance(other, LooseVersion) else other)
        
        def __lt__(self, other):
            return self.version < (other.version if isinstance(other, LooseVersion) else other)
        
        def __le__(self, other):
            return self.version <= (other.version if isinstance(other, LooseVersion) else other)
        
        def __gt__(self, other):
            return self.version > (other.version if isinstance(other, LooseVersion) else other)
        
        def __ge__(self, other):
            return self.version >= (other.version if isinstance(other, LooseVersion) else other)
    
    distutils.version.LooseVersion = LooseVersion
    sys.modules['distutils'] = distutils
    sys.modules['distutils.version'] = distutils.version

try:
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError as e:
    print(f"ERROR: Required packages not installed: {e}", file=sys.stderr)
    print("ERROR: Run: pip install undetected-chromedriver selenium", file=sys.stderr)
    sys.exit(1)

def setup_driver(headless=True, use_proxy=False, proxy_username=None, proxy_password=None):
    """Configure and return undetected Chrome WebDriver"""
    try:
        print(f"🚀 Starting undetected Chrome (headless={headless}, proxy={use_proxy})...", file=sys.stderr)
        
        # Configure options
        options = uc.ChromeOptions()
        
        if headless:
            options.add_argument('--headless=new')
        
        # Required for running as non-root
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        # Performance and stealth options
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-software-rasterizer')
        options.add_argument('--disable-extensions')
        options.add_argument('--disable-background-networking')
        options.add_argument('--disable-default-apps')
        options.add_argument('--disable-sync')
        options.add_argument('--metrics-recording-only')
        options.add_argument('--mute-audio')
        options.add_argument('--disable-blink-features=AutomationControlled')
        
        # Additional anti-detection
        options.add_argument('--disable-infobars')
        options.add_argument('--disable-logging')
        options.add_argument('--disable-login-animations')
        options.add_argument('--disable-notifications')
        options.add_argument('--disable-web-security')
        options.add_argument('--ignore-certificate-errors')
        options.add_argument('--allow-running-insecure-content')
        
        # Randomize user agent slightly to avoid fingerprinting
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ]
        import random
        selected_ua = random.choice(user_agents)
        options.add_argument(f'--user-agent={selected_ua}')
        
        # Window size
        options.add_argument('--window-size=1920,1080')
        
        # Language and locale
        options.add_argument('--lang=en-US')
        options.add_experimental_option('prefs', {
            'intl.accept_languages': 'en-US,en',
            'profile.default_content_setting_values.notifications': 2,  # Block notifications
        })
        
        # Add Webshare proxy if provided
        if use_proxy and proxy_username and proxy_password:
            # Webshare proxy format: http://username-rotate:password@p.webshare.io:80/
            proxy_url = f'http://{proxy_username}-rotate:{proxy_password}@p.webshare.io:80'
            options.add_argument(f'--proxy-server={proxy_url}')
            print(f"🔒 Using Webshare proxy with embedded auth: {proxy_username}-rotate@p.webshare.io:80", file=sys.stderr)
        
        # Initialize undetected Chrome (auto-detects ChromeDriver version)
        driver = uc.Chrome(options=options, version_main=None)
        driver.set_page_load_timeout(30)
        
        # Additional anti-detection via JavaScript injection
        # This runs before any page loads
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': '''
                // Remove webdriver property
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
                
                // Override permissions API
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Add chrome object if missing
                if (!window.chrome) {
                    window.chrome = {
                        runtime: {},
                        loadTimes: function() {},
                        csi: function() {},
                        app: {}
                    };
                }
                
                // Mock plugins (make it look like browser has plugins)
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        {
                            0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
                            description: "Portable Document Format",
                            filename: "internal-pdf-viewer",
                            length: 1,
                            name: "Chrome PDF Plugin"
                        },
                        {
                            0: {type: "application/pdf", suffixes: "pdf", description: ""},
                            description: "",
                            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                            length: 1,
                            name: "Chrome PDF Viewer"
                        },
                        {
                            0: {type: "application/x-nacl", suffixes: "", description: "Native Client Executable"},
                            1: {type: "application/x-pnacl", suffixes: "", description: "Portable Native Client Executable"},
                            description: "",
                            filename: "internal-nacl-plugin",
                            length: 2,
                            name: "Native Client"
                        }
                    ],
                });
                
                // Mock languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                
                // Override navigator.platform
                Object.defineProperty(navigator, 'platform', {
                    get: () => 'Linux x86_64',
                });
                
                // Hide automation
                delete navigator.__proto__.webdriver;
            '''
        })
        
        print("✅ Chrome driver initialized successfully", file=sys.stderr)
        return driver
        
    except Exception as e:
        print(f"ERROR: Failed to initialize Chrome WebDriver: {e}", file=sys.stderr)
        raise

def extract_search_results(driver, max_results=5):
    """Extract search results from Google SERP"""
    results = []
    
    try:
        # Wait for page to load
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script('return document.readyState') == 'complete'
        )
        
        # Small delay to ensure DOM is fully loaded
        time.sleep(2)
        
        # Debug: Save page source
        print(f"DEBUG: Page title: {driver.title}", file=sys.stderr)
        
        # Check if we're on a consent/CAPTCHA page
        page_source = driver.page_source
        page_text = driver.find_element(By.TAG_NAME, 'body').text.lower() if driver.find_elements(By.TAG_NAME, 'body') else ''
        
        # Log page status
        print(f"DEBUG: Page title: {driver.title}", file=sys.stderr)
        print(f"DEBUG: Page text length: {len(page_text)} chars", file=sys.stderr)
        print(f"DEBUG: Page text sample: {page_text[:200]}", file=sys.stderr)
        
        if 'consent' in page_source.lower() or 'captcha' in page_source.lower():
            print(f"WARNING: Detected consent/CAPTCHA page", file=sys.stderr)
            # Save HTML to file for debugging
            with open('/tmp/google-consent-page.html', 'w') as f:
                f.write(page_source)
            print(f"DEBUG: Saved page HTML to /tmp/google-consent-page.html", file=sys.stderr)
        elif 'unusual traffic' in page_text or 'not a robot' in page_text:
            print(f"WARNING: Google is blocking with 'unusual traffic' message", file=sys.stderr)
            print(f"DEBUG: This indicates the proxy IP may be flagged", file=sys.stderr)
        elif 'about' in page_text and 'results' in page_text:
            print(f"✅ Looks like we got search results page", file=sys.stderr)
        
        # Find all search result containers (try multiple selectors)
        search_elements = driver.find_elements(By.CSS_SELECTOR, 'div.g, div[data-sokoban-container], div.Gx5Zad')
        
        if not search_elements:
            # Try alternative selectors
            search_elements = driver.find_elements(By.CSS_SELECTOR, 'div[jscontroller]')
        
        print(f"INFO: Found {len(search_elements)} result elements", file=sys.stderr)
        
        for i, element in enumerate(search_elements[:max_results * 2]):
            try:
                result = {}
                
                # Extract title
                try:
                    title_elem = element.find_element(By.CSS_SELECTOR, 'h3')
                    result['title'] = title_elem.text.strip()
                except NoSuchElementException:
                    continue  # Skip if no title
                
                # Extract URL
                try:
                    link_elem = element.find_element(By.CSS_SELECTOR, 'a')
                    url = link_elem.get_attribute('href')
                    if url and url.startswith('http'):
                        result['url'] = url.strip()
                    else:
                        continue  # Skip if no valid URL
                except NoSuchElementException:
                    continue
                
                # Extract snippet/description
                try:
                    snippet_elem = element.find_element(By.CSS_SELECTOR, 'div[data-sncf="1"], div.VwiC3b, div.s')
                    result['snippet'] = snippet_elem.text.strip()
                except NoSuchElementException:
                    # Use title as fallback snippet
                    result['snippet'] = result['title']
                
                # Only add if we have both title and URL
                if 'title' in result and 'url' in result:
                    results.append(result)
                    print(f"INFO: Result {len(results)}: {result['title'][:50]}...", file=sys.stderr)
                    
                    if len(results) >= max_results:
                        break
                        
            except Exception as e:
                print(f"WARNING: Error processing result {i}: {e}", file=sys.stderr)
                continue
        
        return results
        
    except TimeoutException:
        print("ERROR: Timeout waiting for search results", file=sys.stderr)
        return []
    except Exception as e:
        print(f"ERROR: Failed to extract results: {e}", file=sys.stderr)
        return []

def perform_google_search(query, max_results=5, headless=True, use_proxy=False, proxy_username=None, proxy_password=None):
    """Perform Google search and return results"""
    driver = None
    
    try:
        print(f"INFO: Starting Google search for: {query}", file=sys.stderr)
        
        # Setup WebDriver with undetected ChromeDriver
        driver = setup_driver(headless=headless, use_proxy=use_proxy, 
                            proxy_username=proxy_username, proxy_password=proxy_password)
        
        # First visit Google homepage to set consent cookie
        print("INFO: Setting consent cookies...", file=sys.stderr)
        driver.get("https://www.google.com")
        
        # Wait a moment for page to load
        time.sleep(1)
        
        # Add consent cookie to bypass consent page
        try:
            driver.add_cookie({
                'name': 'CONSENT',
                'value': 'YES+cb',
                'domain': '.google.com',
                'path': '/'
            })
            print("INFO: Consent cookie set successfully", file=sys.stderr)
        except Exception as e:
            print(f"WARNING: Could not set consent cookie: {e}", file=sys.stderr)
            # Continue anyway
        
        # Navigate to Google search
        search_url = f"https://www.google.com/search?q={query}&num={max_results * 2}"
        print(f"INFO: Navigating to: {search_url}", file=sys.stderr)
        driver.get(search_url)
        
        # Wait for page to stabilize
        time.sleep(2)
        
        # Extract results
        results = extract_search_results(driver, max_results)
        
        print(f"INFO: Successfully extracted {len(results)} results", file=sys.stderr)
        
        return {
            'success': True,
            'query': query,
            'results': results,
            'count': len(results)
        }
        
    except Exception as e:
        print(f"ERROR: Search failed: {e}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'query': query
        }
        
    finally:
        if driver:
            try:
                driver.quit()
                print("INFO: WebDriver closed", file=sys.stderr)
            except Exception as e:
                print(f"WARNING: Error closing WebDriver: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description='Google Search using Selenium with Undetected ChromeDriver')
    parser.add_argument('query', help='Search query')
    parser.add_argument('--max-results', type=int, default=5, help='Maximum number of results (default: 5)')
    parser.add_argument('--interactive', action='store_true', help='Keep browser open (not headless)')
    parser.add_argument('--timeout', type=int, default=30, help='Maximum wait time in seconds (default: 30)')
    parser.add_argument('--proxy-username', help='Webshare proxy username (enables proxy if provided)')
    parser.add_argument('--proxy-password', help='Webshare proxy password')
    
    args = parser.parse_args()
    
    # Get proxy credentials from args or environment variables
    proxy_username = args.proxy_username or os.environ.get('WS_U') or os.environ.get('PXY_USER')
    proxy_password = args.proxy_password or os.environ.get('WS_P') or os.environ.get('PXY_PASS')
    use_proxy = bool(proxy_username and proxy_password)
    
    if use_proxy:
        print(f"INFO: Proxy enabled with username: {proxy_username}", file=sys.stderr)
    
    # Perform search
    result = perform_google_search(
        query=args.query,
        max_results=args.max_results,
        headless=not args.interactive,
        use_proxy=use_proxy,
        proxy_username=proxy_username,
        proxy_password=proxy_password
    )
    
    # Output JSON result to stdout
    print(json.dumps(result))
    
    # Return exit code
    sys.exit(0 if result.get('success') else 1)

if __name__ == '__main__':
    main()
