/**
 * Scraping Tier Orchestrator
 * 
 * Manages multi-tier scraping fallback chain with environment-aware constraints.
 * 
 * Deployment Constraints:
 * - Deployed/online Lambda: Only Tier 0 (Direct) and Tier 1 (Puppeteer) are supported
 * - Local environment: All tiers (0-4) including Playwright, Selenium, and Interactive mode
 * 
 * Tiers:
 * - Tier 0: Direct HTTP scraping (DuckDuckGo proxy or Tavily)
 * - Tier 1: Puppeteer with stealth plugins
 * - Tier 2: Playwright with stealth (local-only)
 * - Tier 3: Selenium with undetected-chromedriver (local-only)
 * - Tier 4: Interactive mode with manual CAPTCHA/login (local-only)
 */

/**
 * Get environment-aware tier constraints
 * @returns {Object} Environment configuration
 */
function getEnvironmentConstraints() {
  const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
  const MAX_TIER = IS_LAMBDA ? 1 : 4;
  
  return {
    IS_LAMBDA,
    IS_DEVELOPMENT,
    MAX_TIER,
    supportsPlaywright: !IS_LAMBDA,
    supportsSelenium: !IS_LAMBDA,
    supportsInteractive: !IS_LAMBDA
  };
}

/**
 * Determine if an error should trigger tier escalation
 * @param {Error} error - The error that occurred
 * @param {number} currentTier - Current tier level (0-4)
 * @returns {boolean} Whether to escalate to next tier
 */
function shouldEscalate(error, currentTier) {
  const { MAX_TIER, IS_LAMBDA } = getEnvironmentConstraints();
  
  // Check if error indicates we should try next tier
  // 403 Forbidden, 429 Too Many Requests, CAPTCHA detection, bot detection
  // Recognize explicit error codes first (we'll throw BOT_PROTECTION_DETECTED when
  // a scraper returns a page that appears to be a bot gate or login wall).
  if (error && error.code === 'BOT_PROTECTION_DETECTED') {
    return true;
  }

  const shouldTryNextTier = 
    error.status === 403 || 
    error.status === 429 ||
    error.statusCode === 403 ||
    error.statusCode === 429 ||
    error.message?.includes('CAPTCHA') ||
    error.message?.includes('captcha') ||
    error.message?.includes('bot detected') ||
    error.message?.includes('blocked') ||
    error.message?.includes('access denied');
  
  // If on deployed Lambda and we're at MAX_TIER (1) and would need to escalate,
  // augment the error with guidance for user but don't escalate
  if (IS_LAMBDA && currentTier >= MAX_TIER && shouldTryNextTier) {
    error.requiresLocalEnvironment = true;
    error.suggestedAction = 
      'This site requires Playwright, Selenium, or Interactive mode (Tier 2-4), ' +
      'which are only available when running locally. Please run locally ' +
      'or use a third-party scraping service.';
    error.code = 'TIER_LIMIT_EXCEEDED';
    return false;
  }
  
  // Don't escalate if we're already at max tier for this environment
  if (currentTier >= MAX_TIER) {
    return false;
  }
  
  return shouldTryNextTier;
}

/**
 * Check if the scraped result indicates login is required
 * @param {Object} result - Scraping result
 * @returns {boolean} Whether login is required
 */
function requiresLogin(result) {
  if (!result) return false;
  
  // Check response for login indicators (need at least 2 indicators)
  const indicators = [
    result.url?.includes('/login'),
    result.url?.includes('/signin'),
    result.url?.includes('/sign-in'),
    result.status === 401,
    result.statusCode === 401,
    result.html?.includes('sign in to continue'),
    result.html?.includes('login required'),
    result.html?.includes('members only'),
    result.html?.includes('create an account'),
    result.html?.match(/<form[^>]*action=["'][^"']*login/i),
    result.html?.match(/<input[^>]*type=["']password/i),
    result.content?.includes('sign in to continue'),
    result.content?.includes('login required'),
    result.content?.includes('members only')
  ];
  
  const matchCount = indicators.filter(Boolean).length;
  return matchCount >= 2; // At least 2 indicators required
}

/**
 * Heuristic detection for bot-protection / gating pages (CAPTCHA, login walls, access checks)
 * @param {Object} result - Scraper result containing html, text, content, url
 * @returns {boolean} true if bot-protection / gating likely detected
 */
function detectBotProtection(result) {
  if (!result) return false;

  const html = String(result.html || result.text || result.content || '').toLowerCase();
  const url = String(result.url || '').toLowerCase();

  // If we got substantial content (>5000 chars), likely not a gate
  // Gates are typically small redirect/challenge pages
  if (html.length > 5000) {
    return false;
  }

  // Quick heuristics
  const indicators = [];

  // Known phrases (including Cloudflare, CAPTCHA challenges, login walls)
  const gatePatterns = [
    'please verify',
    'verifying you',
    'verify you',
    'verify that you are',
    'checking your browser',
    'just a moment',
    'complete the security check',
    'are you a human',
    'why did this happen',
    'access denied',
    'verify you are human',
    'please sign in to continue',
    'sign in to continue',
    'login required',
    'members only',
    'create an account',
    'continue with',
    'captcha',
    'cloudflare',
    'ray id:'
  ];
  
  gatePatterns.forEach(p => {
    if (html.includes(p)) {
      indicators.push(p);
    }
  });

  // Short body (thin content pages often indicate a gate)
  if (html.length > 0 && html.length < 1500) {
    indicators.push('short-body');
  }

  // Query params or paths commonly used by gating services
  if (url.includes('__cf_chl_captcha_tk') || url.includes('/cdn-cgi/l/chk_captcha') || url.includes('captcha')) {
    indicators.push('captcha-path');
  }

  // Presence of login form elements
  if (html.match(/<form[^>]*action=["'][^"']*(login|signin|sign-in)/i)) indicators.push('login-form');
  if (html.match(/<input[^>]*type=["']password/i)) indicators.push('password-input');

  // If multiple indicators present, treat as bot protection
  return indicators.length >= 2;
}

/**
 * Handle login-required scenarios
 * @param {string} url - URL that requires login
 * @param {Object} options - Scraping options
 * @throws {Error} With detailed guidance based on environment
 */
async function handleLoginRequired(url, options = {}) {
  const { IS_LAMBDA } = getEnvironmentConstraints();
  const domain = new URL(url).hostname;
  
  if (IS_LAMBDA) {
    // Provide detailed error message for deployed Lambda
    const error = new Error(
      `Login required for ${domain}. Interactive mode (Tier 4) is not available in the deployed Lambda environment. ` +
      `To scrape this site, either: ` +
      `(1) Run the Lambda locally with interactive mode enabled, ` +
      `(2) Manually save session cookies to ~/.cache/lambdallmproxy/sessions/${domain}.json and deploy with SESSION_COOKIE_* environment variables, or ` +
      `(3) Use a third-party scraping service that handles authentication.`
    );
    error.code = 'LOGIN_REQUIRED';
    error.requiresLocalEnvironment = true;
    error.domain = domain;
    throw error;
  }
  
  // In local environment, we would launch interactive mode (Tier 4)
  // This is a placeholder - actual implementation would be in tier4-interactive.js
  console.log(`[Local Mode] Login required for ${domain}. Interactive mode would be launched here.`);
  
  const error = new Error(
    `Login required for ${domain}. Interactive mode (Tier 4) is not yet implemented. ` +
    `Please manually save session cookies to ~/.cache/lambdallmproxy/sessions/${domain}.json`
  );
  error.code = 'LOGIN_REQUIRED';
  error.domain = domain;
  error.requiresInteractiveMode = true;
  throw error;
}

/**
 * Get tier name for logging
 * @param {number} tier - Tier number
 * @returns {string} Tier name
 */
function getTierName(tier) {
  const names = {
    0: 'Direct HTTP',
    1: 'Puppeteer',
    2: 'Playwright',
    3: 'Selenium',
    4: 'Interactive'
  };
  return names[tier] || `Tier ${tier}`;
}

/**
 * Create environment-aware error for tier limit
 * @param {number} maxTier - Maximum tier reached
 * @param {Error} lastError - Last error encountered
 * @returns {Error} Formatted error with guidance
 */
function createTierLimitError(maxTier, lastError) {
  const { IS_LAMBDA, MAX_TIER } = getEnvironmentConstraints();
  const tierName = getTierName(maxTier);
  
  let message = `All available tiers exhausted (max: Tier ${MAX_TIER} - ${tierName}). `;
  
  if (IS_LAMBDA) {
    message += 
      `The deployed Lambda environment only supports Tier 0 (Direct HTTP) and Tier 1 (Puppeteer). ` +
      `This site requires higher-tier scraping (Playwright, Selenium, or Interactive mode). ` +
      `To scrape this site, either: ` +
      `(1) run locally where all tiers are available, or ` +
      `(2) Use a third-party scraping service.`;
  } else {
    message += 
      `All local scraping tiers failed. This site has advanced bot protection. ` +
      `Consider using a third-party scraping service.`;
  }
  
  if (lastError) {
    message += ` Last error: ${lastError.message}`;
  }
  
  const error = new Error(message);
  error.code = 'ALL_TIERS_EXHAUSTED';
  error.maxTier = MAX_TIER;
  error.lastError = lastError;
  error.requiresLocalEnvironment = IS_LAMBDA;
  
  return error;
}

/**
 * Validate tier is available in current environment
 * @param {number} tier - Tier to validate
 * @throws {Error} If tier is not available
 */
function validateTierAvailability(tier) {
  const { IS_LAMBDA, MAX_TIER } = getEnvironmentConstraints();
  
  if (tier > MAX_TIER) {
    const tierName = getTierName(tier);
    const error = new Error(
      `${tierName} (Tier ${tier}) is not available in the deployed Lambda environment. ` +
      `Only Tier 0 (Direct HTTP) and Tier 1 (Puppeteer) are supported. ` +
      `Please run locally to use Tier 2-4.`
    );
    error.code = 'TIER_NOT_AVAILABLE';
    error.tier = tier;
    error.maxTier = MAX_TIER;
    error.requiresLocalEnvironment = true;
    throw error;
  }
}

/**
 * Load tier scraper dynamically (only load if available in environment)
 * @param {number} tier - Tier number to load
 * @returns {Function|null} Scraper function or null if not available
 */
function loadTierScraper(tier) {
  const { IS_LAMBDA, MAX_TIER } = getEnvironmentConstraints();
  
  // Don't load tiers not available in this environment
  if (tier > MAX_TIER) {
    return null;
  }
  
  try {
    switch (tier) {
      case 0:
        return require('./tier-0-direct').scrapeTier0;
      case 1:
        return require('./tier-1-puppeteer').scrapeTier1;
      case 2:
        if (!IS_LAMBDA) {
          return require('./tier-2-playwright').scrapeTier2;
        }
        return null;
      case 3:
        if (!IS_LAMBDA) {
          return require('./tier-3-selenium').scrapeTier3;
        }
        return null;
      case 4:
        if (!IS_LAMBDA) {
          return require('./tier-4-interactive').scrapeTier4;
        }
        return null;
      default:
        return null;
    }
  } catch (error) {
    console.warn(`⚠️ [Orchestrator] Failed to load Tier ${tier}:`, error.message);
    return null;
  }
}

/**
 * Main scraping orchestrator with tier fallback
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.startTier - Starting tier (default: auto-detect based on site or 0)
 * @param {number} options.maxTier - Maximum tier to try (default: environment MAX_TIER)
 * @param {boolean} options.enableInteractive - Allow Tier 4 interactive mode (default: false)
 * @param {boolean} options.useSiteConfig - Use site-specific configuration (default: true)
 * @returns {Promise<Object>} Scraped content
 */
async function scrapeWithTierFallback(url, options = {}) {
  const {
    startTier: userStartTier = null,
    maxTier: userMaxTier = null,
    enableInteractive = false,
    useSiteConfig = true,
    onProgress = null,
    ...scraperOptions
  } = options;

  const { IS_LAMBDA, MAX_TIER } = getEnvironmentConstraints();
  const effectiveMaxTier = userMaxTier !== null ? Math.min(userMaxTier, MAX_TIER) : MAX_TIER;
  
  // Helper to emit progress events
  const emitProgress = (stage, data = {}) => {
    if (onProgress && typeof onProgress === 'function') {
      onProgress({ stage, url, ...data });
    }
  };
  
  // Check for site-specific configuration
  let startTier = userStartTier !== null ? userStartTier : 0;
  let siteConfigReason = null;
  
  if (useSiteConfig && userStartTier === null) {
    const { getSiteConfig } = require('./site-config');
    const siteConfig = getSiteConfig(url);
    
    if (siteConfig) {
      startTier = Math.min(siteConfig.startTier, effectiveMaxTier);
      siteConfigReason = siteConfig.reason;
      console.log(`🎯 [Orchestrator] Site-specific config: Starting at Tier ${startTier} (${siteConfigReason})`);
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 [Orchestrator] Starting scraping with tier fallback`);
  console.log(`🌐 URL: ${url}`);
  console.log(`📊 Environment: ${IS_LAMBDA ? 'Lambda (deployed)' : 'Local development'}`);
  console.log(`🎯 Tier range: ${startTier} → ${effectiveMaxTier}`);
  console.log(`${'='.repeat(70)}\n`);

  // Emit initial progress
  emitProgress('initializing', {
    tier: startTier,
    tierName: getTierName(startTier),
    maxTier: effectiveMaxTier,
    environment: IS_LAMBDA ? 'lambda' : 'local',
    siteConfigReason
  });

  const errors = [];
  let currentTier = startTier;

  while (currentTier <= effectiveMaxTier) {
    // Skip Tier 4 unless explicitly enabled
    if (currentTier === 4 && !enableInteractive) {
      console.log(`⏭️  [Orchestrator] Skipping Tier 4 (Interactive) - not enabled`);
      currentTier++;
      continue;
    }

    const tierName = getTierName(currentTier);
    console.log(`\n📍 [Orchestrator] Attempting Tier ${currentTier}: ${tierName}`);

    // Emit tier attempt progress
    emitProgress('tier_attempt', {
      tier: currentTier,
      tierName,
      attempt: errors.length + 1
    });

    try {
      // Validate tier availability
      validateTierAvailability(currentTier);

      // Load scraper
      const scraper = loadTierScraper(currentTier);
      
      if (!scraper) {
        throw new Error(`Scraper for Tier ${currentTier} not available`);
      }

      // Emit scraping start progress
      emitProgress('scraping', {
        tier: currentTier,
        tierName,
        message: `Scraping with ${tierName}...`
      });

      // Execute scraping - pass onProgress through to tier scraper if it supports it
      const tierScraperOptions = { ...scraperOptions };
      
      // For tiers that support onProgress (Tier 1, 2, 3), pass it through
      // but wrap it to add tier context
      if (currentTier >= 1 && currentTier <= 3 && onProgress) {
        tierScraperOptions.onProgress = (progressData) => {
          emitProgress('tier_progress', {
            tier: currentTier,
            tierName,
            ...progressData
          });
        };
      }
      
      const result = await scraper(url, tierScraperOptions);

      // If the page looks like a bot-protection / gate, escalate to next tier
      if (detectBotProtection(result)) {
        const err = new Error('Bot protection / gating detected in scraper result');
        err.code = 'BOT_PROTECTION_DETECTED';
        // include a short sample to help diagnostics
        err.sample = (result.text || result.html || result.content || '').slice(0, 800);
        throw err;
      }

      // Check if result requires login
      if (requiresLogin(result)) {
        console.log(`🔒 [Orchestrator] Login required detected at Tier ${currentTier}`);
        await handleLoginRequired(url, options);
      }

      // Success!
      console.log(`✅ [Orchestrator] Success at Tier ${currentTier}: ${tierName}`);
      console.log(`📊 Stats: ${result.text?.length || 0} chars, ${result.links?.length || 0} links`);
      console.log(`${'='.repeat(70)}\n`);
      
      // Emit success progress
      emitProgress('success', {
        tier: currentTier,
        tierName,
        contentLength: result.text?.length || result.content?.length || 0,
        linksCount: result.links?.length || 0,
        imagesCount: result.images?.length || 0
      });
      
      return result;

    } catch (error) {
      console.error(`❌ [Orchestrator] Tier ${currentTier} failed:`, error.message);
      
      // Emit error progress
      emitProgress('tier_error', {
        tier: currentTier,
        tierName,
        error: error.message,
        code: error.code
      });
      
      errors.push({
        tier: currentTier,
        tierName,
        error: error.message,
        code: error.code,
        status: error.status || error.statusCode
      });

      // Check if we should escalate to next tier
      if (shouldEscalate(error, currentTier)) {
        console.log(`⬆️  [Orchestrator] Escalating to Tier ${currentTier + 1}`);
        
        // Emit escalation progress
        emitProgress('escalating', {
          fromTier: currentTier,
          toTier: currentTier + 1,
          fromTierName: tierName,
          toTierName: getTierName(currentTier + 1),
          reason: error.message
        });
        
        currentTier++;
      } else {
        // Don't escalate - error is not tier-related or we've hit limit
        if (error.code === 'TIER_NOT_AVAILABLE' || error.code === 'TIER_LIMIT_EXCEEDED') {
          throw error;
        }
        
        // Other non-escalatable error
        throw createTierLimitError(currentTier, error);
      }
    }
  }

  // All tiers exhausted
  console.error(`\n❌ [Orchestrator] All tiers exhausted`);
  console.error(`📋 Errors encountered:`);
  errors.forEach(e => {
    console.error(`   - Tier ${e.tier} (${e.tierName}): ${e.error}`);
  });
  console.error(`${'='.repeat(70)}\n`);

  throw createTierLimitError(effectiveMaxTier, errors[errors.length - 1]?.error);
}

module.exports = {
  // Utility functions
  getEnvironmentConstraints,
  shouldEscalate,
  requiresLogin,
  handleLoginRequired,
  getTierName,
  createTierLimitError,
  validateTierAvailability,
  loadTierScraper,
  
  // Main orchestrator
  scrapeWithTierFallback
};
