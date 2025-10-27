/**
 * Site-Specific Scraping Configuration
 * 
 * Maps domains to recommended starting tiers based on known bot-protection levels.
 * This allows bypassing lower tiers for sites known to require advanced scraping.
 */

/**
 * Site difficulty levels and recommended starting tiers
 */
const SITE_CONFIG = {
  // Tier 3 required - Advanced bot detection (Cloudflare, aggressive fingerprinting)
  'quora.com': { startTier: 3, reason: 'Advanced bot detection, requires undetected-chromedriver' },
  'www.quora.com': { startTier: 3, reason: 'Advanced bot detection, requires undetected-chromedriver' },
  'linkedin.com': { startTier: 3, reason: 'Aggressive bot detection and login requirements' },
  'www.linkedin.com': { startTier: 3, reason: 'Aggressive bot detection and login requirements' },
  'indeed.com': { startTier: 3, reason: 'Cloudflare protection' },
  'www.indeed.com': { startTier: 3, reason: 'Cloudflare protection' },
  
  // Tier 2 recommended - Moderate bot detection
  'twitter.com': { startTier: 2, reason: 'Moderate bot detection' },
  'x.com': { startTier: 2, reason: 'Moderate bot detection' },
  'reddit.com': { startTier: 2, reason: 'Rate limiting and fingerprinting' },
  'www.reddit.com': { startTier: 2, reason: 'Rate limiting and fingerprinting' },
  'stackoverflow.com': { startTier: 2, reason: 'CAPTCHA on suspicious requests' },
  
  // Tier 1 sufficient - Light or no bot detection
  'github.com': { startTier: 1, reason: 'Generally accessible with basic stealth' },
  'wikipedia.org': { startTier: 0, reason: 'Public content, no protection' },
  'en.wikipedia.org': { startTier: 0, reason: 'Public content, no protection' },
};

/**
 * Get recommended starting tier for a URL
 * @param {string} url - URL to check
 * @returns {Object|null} Configuration object with startTier and reason, or null if no config
 */
function getSiteConfig(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Check exact match first
    if (SITE_CONFIG[hostname]) {
      return SITE_CONFIG[hostname];
    }
    
    // Check without www prefix
    const withoutWww = hostname.replace(/^www\./, '');
    if (SITE_CONFIG[withoutWww]) {
      return SITE_CONFIG[withoutWww];
    }
    
    // Check with www prefix
    const withWww = `www.${hostname}`;
    if (SITE_CONFIG[withWww]) {
      return SITE_CONFIG[withWww];
    }
    
    // Check if it's a subdomain of a configured domain
    for (const [domain, config] of Object.entries(SITE_CONFIG)) {
      if (hostname.endsWith(`.${domain}`) || hostname === domain) {
        return config;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ [Site Config] Failed to parse URL: ${url}`, error.message);
    return null;
  }
}

/**
 * Add or update site configuration
 * @param {string} domain - Domain name
 * @param {number} startTier - Starting tier (0-4)
 * @param {string} reason - Reason for this configuration
 */
function setSiteConfig(domain, startTier, reason) {
  SITE_CONFIG[domain.toLowerCase()] = { startTier, reason };
}

/**
 * Get all configured sites
 * @returns {Object} Copy of site configuration
 */
function getAllSiteConfigs() {
  return { ...SITE_CONFIG };
}

module.exports = {
  getSiteConfig,
  setSiteConfig,
  getAllSiteConfigs,
  SITE_CONFIG
};
