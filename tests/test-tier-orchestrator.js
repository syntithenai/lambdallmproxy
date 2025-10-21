/**
 * Test suite for tier orchestrator
 * Validates environment-aware tier constraints and error handling
 */

const {
  getEnvironmentConstraints,
  shouldEscalate,
  requiresLogin,
  handleLoginRequired,
  getTierName,
  createTierLimitError,
  validateTierAvailability
} = require('../src/scrapers/tier-orchestrator');

// Test helper to mock environment
function mockEnvironment(config = {}) {
  const originalEnv = { ...process.env };
  
  // Clear relevant env vars
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.NODE_ENV;
  
  // Set new values
  if (config.isLambda) {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-lambda';
  }
  if (config.isDevelopment) {
    process.env.NODE_ENV = 'development';
  }
  
  return () => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (!originalEnv.hasOwnProperty(key)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  };
}

// Test suite
async function runTests() {
  console.log('🧪 Testing Tier Orchestrator\n');
  
  let passed = 0;
  let failed = 0;
  
  function test(name, fn) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(`   ${error.message}`);
      failed++;
    }
  }
  
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }
  
  // Test 1: Environment constraints - deployed Lambda
  test('Deployed Lambda should limit MAX_TIER to 1', () => {
    const restore = mockEnvironment({ isLambda: true });
    const constraints = getEnvironmentConstraints();
    assert(constraints.IS_LAMBDA === true, 'IS_LAMBDA should be true');
    assert(constraints.MAX_TIER === 1, 'MAX_TIER should be 1');
    assert(constraints.supportsPlaywright === false, 'Playwright should not be supported');
    assert(constraints.supportsSelenium === false, 'Selenium should not be supported');
    assert(constraints.supportsInteractive === false, 'Interactive should not be supported');
    restore();
  });
  
  // Test 2: Environment constraints - local development
  test('Local development should support all tiers', () => {
    const restore = mockEnvironment({ isDevelopment: true });
    const constraints = getEnvironmentConstraints();
    assert(constraints.IS_LAMBDA === false, 'IS_LAMBDA should be false');
    assert(constraints.IS_DEVELOPMENT === true, 'IS_DEVELOPMENT should be true');
    assert(constraints.MAX_TIER === 4, 'MAX_TIER should be 4');
    assert(constraints.supportsPlaywright === true, 'Playwright should be supported');
    assert(constraints.supportsSelenium === true, 'Selenium should be supported');
    assert(constraints.supportsInteractive === true, 'Interactive should be supported');
    restore();
  });
  
  // Test 3: shouldEscalate - 403 error should trigger escalation
  test('403 error should trigger escalation when tier < MAX_TIER', () => {
    const restore = mockEnvironment({ isDevelopment: true });
    const error = new Error('Access denied');
    error.status = 403;
    const shouldEsc = shouldEscalate(error, 0);
    assert(shouldEsc === true, 'Should escalate from tier 0 on 403');
    restore();
  });
  
  // Test 4: shouldEscalate - don't escalate at MAX_TIER
  test('Should not escalate when already at MAX_TIER', () => {
    const restore = mockEnvironment({ isLambda: true });
    const error = new Error('Access denied');
    error.status = 403;
    const shouldEsc = shouldEscalate(error, 1); // MAX_TIER is 1 in Lambda
    assert(shouldEsc === false, 'Should not escalate at MAX_TIER');
    restore();
  });
  
  // Test 5: shouldEscalate - augment error on Lambda when tier limit reached
  test('Should augment error with guidance when Lambda tier limit reached', () => {
    const restore = mockEnvironment({ isLambda: true });
    const error = new Error('Access denied');
    error.status = 403;
    shouldEscalate(error, 1); // At MAX_TIER in Lambda
    assert(error.requiresLocalEnvironment === true, 'Error should be marked as requiring local env');
    assert(error.suggestedAction?.includes('run locally'), 'Error should suggest running locally');
    assert(error.code === 'TIER_LIMIT_EXCEEDED', 'Error code should be TIER_LIMIT_EXCEEDED');
    restore();
  });
  
  // Test 6: shouldEscalate - CAPTCHA detection
  test('CAPTCHA error should trigger escalation', () => {
    const restore = mockEnvironment({ isDevelopment: true });
    const error = new Error('CAPTCHA detected');
    const shouldEsc = shouldEscalate(error, 0);
    assert(shouldEsc === true, 'Should escalate on CAPTCHA detection');
    restore();
  });
  
  // Test 7: requiresLogin - detect login requirement
  test('Should detect login requirement with multiple indicators', () => {
    const result = {
      url: 'https://example.com/login',
      html: '<form action="/login"><input type="password"></form>',
      content: 'Please sign in to continue'
    };
    const needsLogin = requiresLogin(result);
    assert(needsLogin === true, 'Should detect login requirement');
  });
  
  // Test 8: requiresLogin - don't false positive
  test('Should not detect login with insufficient indicators', () => {
    const result = {
      url: 'https://example.com/article',
      html: '<div>Some content</div>',
      content: 'Regular article content'
    };
    const needsLogin = requiresLogin(result);
    assert(needsLogin === false, 'Should not false positive on normal content');
  });
  
  // Test 9: handleLoginRequired - throw error in Lambda
  test('handleLoginRequired should throw in deployed Lambda', async () => {
    const restore = mockEnvironment({ isLambda: true });
    try {
      await handleLoginRequired('https://example.com', {});
      assert(false, 'Should have thrown error');
    } catch (error) {
      assert(error.code === 'LOGIN_REQUIRED', 'Error code should be LOGIN_REQUIRED');
      assert(error.requiresLocalEnvironment === true, 'Should require local environment');
      assert(error.message.includes('deployed Lambda environment'), 'Should mention deployment constraint');
    }
    restore();
  });
  
  // Test 10: getTierName
  test('getTierName should return correct names', () => {
    assert(getTierName(0) === 'Direct HTTP', 'Tier 0 name');
    assert(getTierName(1) === 'Puppeteer', 'Tier 1 name');
    assert(getTierName(2) === 'Playwright', 'Tier 2 name');
    assert(getTierName(3) === 'Selenium', 'Tier 3 name');
    assert(getTierName(4) === 'Interactive', 'Tier 4 name');
  });
  
  // Test 11: createTierLimitError - Lambda environment
  test('createTierLimitError should provide guidance for Lambda', () => {
    const restore = mockEnvironment({ isLambda: true });
    const lastError = new Error('Bot detected');
    const error = createTierLimitError(1, lastError);
    assert(error.code === 'ALL_TIERS_EXHAUSTED', 'Error code should be ALL_TIERS_EXHAUSTED');
    assert(error.maxTier === 1, 'maxTier should be 1');
    assert(error.requiresLocalEnvironment === true, 'Should require local environment');
    assert(error.message.includes('deployed Lambda environment'), 'Should mention deployment');
    assert(error.message.includes('run locally'), 'Should suggest running locally');
    restore();
  });
  
  // Test 12: createTierLimitError - local environment
  test('createTierLimitError should provide guidance for local', () => {
    const restore = mockEnvironment({ isDevelopment: true });
    const lastError = new Error('Bot detected');
    const error = createTierLimitError(4, lastError);
    assert(error.code === 'ALL_TIERS_EXHAUSTED', 'Error code should be ALL_TIERS_EXHAUSTED');
    assert(error.maxTier === 4, 'maxTier should be 4');
    assert(error.requiresLocalEnvironment === false, 'Should not require local (already local)');
    assert(error.message.includes('advanced bot protection'), 'Should mention bot protection');
    restore();
  });
  
  // Test 13: validateTierAvailability - valid tier
  test('validateTierAvailability should allow valid tier', () => {
    const restore = mockEnvironment({ isLambda: true });
    try {
      validateTierAvailability(0);
      validateTierAvailability(1);
      // Should not throw
    } catch (error) {
      assert(false, 'Should not throw for valid tiers');
    }
    restore();
  });
  
  // Test 14: validateTierAvailability - invalid tier
  test('validateTierAvailability should reject unavailable tier', () => {
    const restore = mockEnvironment({ isLambda: true });
    try {
      validateTierAvailability(2); // Playwright not available in Lambda
      assert(false, 'Should have thrown error');
    } catch (error) {
      assert(error.code === 'TIER_NOT_AVAILABLE', 'Error code should be TIER_NOT_AVAILABLE');
      assert(error.tier === 2, 'Should indicate tier 2');
      assert(error.maxTier === 1, 'Should indicate max tier 1');
      assert(error.requiresLocalEnvironment === true, 'Should require local environment');
    }
    restore();
  });
  
  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  console.log('='.repeat(50));
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
