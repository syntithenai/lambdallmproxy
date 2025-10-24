#!/usr/bin/env python3
"""
YouTube Caption Scraper using Selenium + Undetected ChromeDriver

This script extracts captions/transcripts from YouTube videos by:
1. Launching a headless Chrome browser (or visible if --interactive)
2. Navigating to the YouTube video page
3. Opening the transcript panel
4. Extracting all caption segments with timestamps
5. Returning structured JSON data

Usage:
    python3 youtube-caption-scraper.py VIDEO_ID [options]

Options:
    --language LANG      Preferred caption language (default: en)
    --timestamps         Include timestamps in output
    --interactive        Keep browser open for manual intervention
    --timeout MS         Maximum wait time in milliseconds (default: 30000)
"""

import sys
import json
import time
import argparse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

try:
    import undetected_chromedriver as uc
    USE_UNDETECTED = True
except ImportError:
    USE_UNDETECTED = False
    print("⚠️ undetected-chromedriver not available, using standard ChromeDriver", file=sys.stderr)


def scrape_youtube_captions(video_id, language='en', include_timestamps=False, interactive=False, timeout=30):
    """
    Scrape YouTube video captions using Selenium
    
    Args:
        video_id (str): YouTube video ID
        language (str): Preferred caption language code
        include_timestamps (bool): Include timestamp data
        interactive (bool): Keep browser open for manual intervention
        timeout (int): Maximum wait time in seconds
    
    Returns:
        dict: Caption data with text, timestamps, and metadata
    """
    driver = None
    
    try:
        # Setup Chrome options
        options = webdriver.ChromeOptions()
        
        if not interactive:
            options.add_argument('--headless=new')
        
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        # Use undetected-chromedriver if available (better for bypassing detection)
        if USE_UNDETECTED:
            print("🚀 Using undetected-chromedriver", file=sys.stderr)
            driver = uc.Chrome(options=options)
        else:
            print("🚀 Using standard ChromeDriver", file=sys.stderr)
            driver = webdriver.Chrome(options=options)
        
        driver.set_page_load_timeout(timeout)
        
        # Navigate to YouTube video
        url = f"https://www.youtube.com/watch?v={video_id}"
        print(f"📍 Navigating to: {url}", file=sys.stderr)
        driver.get(url)
        
        # Wait for page to load
        wait = WebDriverWait(driver, timeout)
        
        # Check for age restriction
        try:
            age_gate = driver.find_element(By.CSS_SELECTOR, 'ytd-age-gate-renderer')
            print("🔞 Age-restricted video detected", file=sys.stderr)
            
            if interactive:
                print("⏸️ INTERACTIVE MODE: Please verify your age or log in manually", file=sys.stderr)
                print("⏸️ Press Enter when ready to continue...", file=sys.stderr)
                input()
            else:
                return {
                    'error': 'Age-restricted video requires manual verification',
                    'needsLogin': True,
                    'videoId': video_id
                }
        except NoSuchElementException:
            pass
        
        # Wait for video player to load
        print("⏳ Waiting for video player...", file=sys.stderr)
        wait.until(EC.presence_of_element_located((By.ID, 'movie_player')))
        
        # Scroll down to ensure buttons are loaded
        driver.execute_script("window.scrollBy(0, 300);")
        time.sleep(1)
        
        # Find and click the "Show transcript" button
        print("🔍 Looking for transcript button...", file=sys.stderr)
        
        # Try different selectors for the transcript button
        transcript_button_selectors = [
            "button[aria-label*='transcript']",
            "button[aria-label*='Transcript']",
            "ytd-video-description-transcript-section-renderer button",
            "button.yt-spec-button-shape-next--mono"
        ]
        
        transcript_button = None
        for selector in transcript_button_selectors:
            try:
                buttons = driver.find_elements(By.CSS_SELECTOR, selector)
                for button in buttons:
                    button_text = button.get_attribute('aria-label') or button.text
                    if 'transcript' in button_text.lower() or 'show transcript' in button_text.lower():
                        transcript_button = button
                        break
                if transcript_button:
                    break
            except:
                continue
        
        if not transcript_button:
            # Try clicking the "...more" button to expand description first
            try:
                print("🔄 Expanding description...", file=sys.stderr)
                more_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'tp-yt-paper-button#expand')))
                driver.execute_script("arguments[0].click();", more_button)
                time.sleep(1)
                
                # Try again to find transcript button
                for selector in transcript_button_selectors:
                    try:
                        buttons = driver.find_elements(By.CSS_SELECTOR, selector)
                        for button in buttons:
                            button_text = button.get_attribute('aria-label') or button.text
                            if 'transcript' in button_text.lower():
                                transcript_button = button
                                break
                        if transcript_button:
                            break
                    except:
                        continue
            except:
                pass
        
        if not transcript_button:
            return {
                'error': 'No transcript button found - captions may not be available for this video',
                'videoId': video_id,
                'hasCaptions': False
            }
        
        # Click transcript button
        print("👆 Clicking transcript button...", file=sys.stderr)
        driver.execute_script("arguments[0].click();", transcript_button)
        time.sleep(2)
        
        # Wait for transcript panel to appear
        print("⏳ Waiting for transcript panel...", file=sys.stderr)
        transcript_panel = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]')))
        
        # Extract caption segments
        print("📝 Extracting captions...", file=sys.stderr)
        caption_segments = []
        
        # Find all caption segments
        segment_elements = driver.find_elements(By.CSS_SELECTOR, 'ytd-transcript-segment-renderer')
        
        if not segment_elements:
            return {
                'error': 'Transcript panel opened but no segments found',
                'videoId': video_id,
                'hasCaptions': True
            }
        
        print(f"📊 Found {len(segment_elements)} caption segments", file=sys.stderr)
        
        for segment in segment_elements:
            try:
                # Extract timestamp
                timestamp_elem = segment.find_element(By.CSS_SELECTOR, '.segment-timestamp')
                timestamp_text = timestamp_elem.text.strip()
                
                # Extract caption text
                text_elem = segment.find_element(By.CSS_SELECTOR, '.segment-text')
                caption_text = text_elem.text.strip()
                
                if include_timestamps:
                    caption_segments.append({
                        'timestamp': timestamp_text,
                        'text': caption_text
                    })
                else:
                    caption_segments.append(caption_text)
                    
            except Exception as e:
                print(f"⚠️ Failed to extract segment: {e}", file=sys.stderr)
                continue
        
        # Combine into full text if timestamps not needed
        if include_timestamps:
            full_text = ' '.join([seg['text'] for seg in caption_segments])
        else:
            full_text = ' '.join(caption_segments)
            caption_segments = None
        
        # Get video metadata
        try:
            title = driver.find_element(By.CSS_SELECTOR, 'h1.ytd-video-primary-info-renderer').text
        except:
            title = None
        
        # Interactive mode: keep browser open
        if interactive:
            print("⏸️ INTERACTIVE MODE: Browser will remain open", file=sys.stderr)
            print("⏸️ Press Enter to close and return results...", file=sys.stderr)
            input()
        
        result = {
            'success': True,
            'videoId': video_id,
            'title': title,
            'text': full_text,
            'captionCount': len(segment_elements),
            'language': language,
            'method': 'selenium-dom',
            'includesTimestamps': include_timestamps
        }
        
        if include_timestamps and caption_segments:
            result['segments'] = caption_segments
        
        return result
        
    except TimeoutException as e:
        return {
            'error': f'Timeout waiting for page elements: {str(e)}',
            'videoId': video_id,
            'timeout': timeout
        }
    except Exception as e:
        return {
            'error': f'Scraping failed: {str(e)}',
            'videoId': video_id,
            'exception': type(e).__name__
        }
    finally:
        if driver and not interactive:
            print("🧹 Closing browser...", file=sys.stderr)
            driver.quit()


def main():
    parser = argparse.ArgumentParser(description='Scrape YouTube captions using Selenium')
    parser.add_argument('video_id', help='YouTube video ID')
    parser.add_argument('--language', default='en', help='Preferred caption language (default: en)')
    parser.add_argument('--timestamps', action='store_true', help='Include timestamps in output')
    parser.add_argument('--interactive', action='store_true', help='Keep browser open for manual intervention')
    parser.add_argument('--timeout', type=int, default=30, help='Maximum wait time in seconds (default: 30)')
    
    args = parser.parse_args()
    
    result = scrape_youtube_captions(
        video_id=args.video_id,
        language=args.language,
        include_timestamps=args.timestamps,
        interactive=args.interactive,
        timeout=args.timeout
    )
    
    # Output JSON to stdout (Node.js will parse this)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
