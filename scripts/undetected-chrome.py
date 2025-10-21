#!/usr/bin/env python3
"""
Undetected ChromeDriver Wrapper for Node.js

This Python script wraps undetected_chromedriver for use from Node.js.
It accepts a URL and options via stdin (JSON) and returns scraped content via stdout (JSON).

Usage:
    python3 undetected-chrome.py

Input (stdin JSON):
    {
        "url": "https://example.com",
        "timeout": 30000,
        "waitAfterLoad": 2000,
        "headless": true,
        "screenshot": false
    }

Output (stdout JSON):
    {
        "success": true,
        "title": "Page Title",
        "text": "Page content...",
        "html": "<html>...</html>",
        "links": [...],
        "images": [...],
        "screenshot": "base64..." (if requested)
    }
"""

import sys
import json
import time
import base64
import os
from urllib.parse import urljoin

# Fix Python path to include both system and user packages
# (Debian/Ubuntu systems may have incomplete sys.path)
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
except ImportError as e:
    import traceback
    error_details = traceback.format_exc()
    print(json.dumps({
        "success": False,
        "error": f"undetected_chromedriver or selenium not installed. Run: pip install undetected-chromedriver selenium",
        "details": error_details
    }), file=sys.stderr)
    sys.exit(1)


def scrape_with_undetected_chrome(config):
    """
    Scrape a URL using undetected_chromedriver
    
    Args:
        config (dict): Configuration with url, timeout, headless, etc.
    
    Returns:
        dict: Scraped content or error
    """
    url = config.get('url')
    timeout = config.get('timeout', 30000) / 1000  # Convert ms to seconds
    wait_after_load = config.get('waitAfterLoad', 2000) / 1000
    headless = config.get('headless', True)
    take_screenshot = config.get('screenshot', False)
    
    driver = None
    
    try:
        # Configure Chrome options
        options = uc.ChromeOptions()
        
        if headless:
            options.add_argument('--headless=new')
        
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--disable-blink-features=AutomationControlled')
        
        # Initialize undetected Chrome
        print(f"🚀 [Tier 3 - Python] Launching undetected Chrome...", file=sys.stderr)
        start_time = time.time()
        
        driver = uc.Chrome(options=options, version_main=None)
        driver.set_page_load_timeout(timeout)
        
        launch_time = time.time() - start_time
        print(f"✅ [Tier 3 - Python] Browser launched in {launch_time:.2f}s", file=sys.stderr)
        
        # Navigate to URL
        print(f"📄 [Tier 3 - Python] Navigating to: {url}", file=sys.stderr)
        nav_start = time.time()
        
        driver.get(url)
        
        nav_time = time.time() - nav_start
        print(f"✅ [Tier 3 - Python] Page loaded in {nav_time:.2f}s", file=sys.stderr)
        
        # Check for Cloudflare challenge and wait for it to complete
        max_challenge_wait = 30  # Maximum seconds to wait for Cloudflare
        challenge_start = time.time()
        cloudflare_detected = False
        
        while (time.time() - challenge_start) < max_challenge_wait:
            page_text = driver.find_element(By.TAG_NAME, 'body').text.lower()
            page_title = driver.title.lower()
            
            # Check for Cloudflare challenge indicators
            is_challenge = (
                'just a moment' in page_title or
                'verifying you are human' in page_text or
                'checking your browser' in page_text or
                'cloudflare' in page_text and 'ray id' in page_text or
                'please wait' in page_text and len(page_text) < 500
            )
            
            if is_challenge:
                if not cloudflare_detected:
                    print(f"⏳ [Tier 3 - Python] Cloudflare challenge detected, waiting for automatic bypass...", file=sys.stderr)
                    cloudflare_detected = True
                time.sleep(2)  # Wait 2 seconds before checking again
            else:
                if cloudflare_detected:
                    wait_duration = time.time() - challenge_start
                    print(f"✅ [Tier 3 - Python] Cloudflare challenge bypassed in {wait_duration:.1f}s", file=sys.stderr)
                break
        
        # If still showing challenge after max wait, continue anyway (will be detected by Node.js)
        if cloudflare_detected:
            elapsed = time.time() - challenge_start
            print(f"⚠️ [Tier 3 - Python] Cloudflare challenge still present after {elapsed:.1f}s", file=sys.stderr)
        
        # Wait for page to stabilize
        if wait_after_load > 0:
            print(f"⏳ [Tier 3 - Python] Waiting {wait_after_load:.1f}s for dynamic content...", file=sys.stderr)
            time.sleep(wait_after_load)
        
        # Extract content
        print("📖 [Tier 3 - Python] Extracting content...", file=sys.stderr)
        extract_start = time.time()
        
        # Get title
        title = driver.title or ''
        
        # Get text content (remove script/style tags first)
        driver.execute_script("""
            const scripts = document.querySelectorAll('script, style, noscript');
            scripts.forEach(el => el.remove());
        """)
        
        text = driver.find_element(By.TAG_NAME, 'body').text
        
        # Get HTML
        html = driver.page_source
        
        # Extract links
        link_elements = driver.find_elements(By.CSS_SELECTOR, 'a[href]')[:100]
        links = []
        for link in link_elements:
            try:
                href = link.get_attribute('href')
                link_text = link.text.strip()
                if href and not href.startswith('#'):
                    links.append({
                        'href': href,
                        'text': link_text
                    })
            except:
                pass
        
        # Extract images
        img_elements = driver.find_elements(By.CSS_SELECTOR, 'img[src]')[:50]
        images = []
        for img in img_elements:
            try:
                src = img.get_attribute('src')
                alt = img.get_attribute('alt') or ''
                if src:
                    images.append({
                        'src': src,
                        'alt': alt
                    })
            except:
                pass
        
        extract_time = time.time() - extract_start
        print(f"✅ [Tier 3 - Python] Content extracted in {extract_time:.2f}s", file=sys.stderr)
        
        # Take screenshot if requested
        screenshot_data = None
        if take_screenshot:
            print("📸 [Tier 3 - Python] Taking screenshot...", file=sys.stderr)
            screenshot_bytes = driver.get_screenshot_as_png()
            screenshot_data = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        total_time = time.time() - start_time
        
        # Return results
        result = {
            'success': True,
            'title': title,
            'text': text,
            'html': html,
            'links': links,
            'images': images,
            'screenshot': screenshot_data,
            'timings': {
                'launch': launch_time,
                'navigation': nav_time,
                'extraction': extract_time,
                'total': total_time
            }
        }
        
        print(f"✅ [Tier 3 - Python] Complete: {len(text)} chars, {len(links)} links, {len(images)} images", file=sys.stderr)
        
        return result
        
    except Exception as e:
        print(f"❌ [Tier 3 - Python] Error: {str(e)}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }
    
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


def main():
    """Main entry point"""
    try:
        # Read configuration from stdin
        input_data = sys.stdin.read()
        
        if not input_data:
            print(json.dumps({
                'success': False,
                'error': 'No input provided'
            }))
            sys.exit(1)
        
        config = json.loads(input_data)
        
        # Scrape
        result = scrape_with_undetected_chrome(config)
        
        # Output result as JSON
        print(json.dumps(result))
        
        if result.get('success'):
            sys.exit(0)
        else:
            sys.exit(1)
            
    except json.JSONDecodeError as e:
        print(json.dumps({
            'success': False,
            'error': f'Invalid JSON input: {str(e)}'
        }))
        sys.exit(1)
    
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
