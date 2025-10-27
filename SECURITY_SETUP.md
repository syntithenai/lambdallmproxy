# Security and Code Quality Setup

This document describes the automated security scanning and code quality tools configured for this project.

## 🛡️ Security Tools

### ESLint Security Plugins

**Installed Plugins:**
- `eslint-plugin-security` - Detects common security vulnerabilities
- `eslint-plugin-no-secrets` - Prevents hard-coded API keys and secrets

**Configuration:** `.eslintrc.json`

**Run Manually:**
```bash
npm run lint              # Check backend code
npm run lint:fix          # Auto-fix issues
npm run lint:security     # Security-focused scan
make lint                 # Via Makefile
```

### Semgrep Security Scanner

**Configuration:** `.semgrep.yml`

Custom rules detect:
- Hard-coded secrets (API keys, tokens)
- Command injection vulnerabilities
- SQL injection risks
- XSS vulnerabilities
- Path traversal issues
- Weak cryptography
- Missing error handling

**Run Manually:**
```bash
semgrep --config=.semgrep.yml src/
```

### Pre-commit Hooks (Husky)

**Configuration:** `.husky/pre-commit`

Automatically runs before every commit:
1. ✅ ESLint with auto-fix on staged files
2. ✅ Hard-coded secret detection
3. ⚠️ Console.log warning (not blocking)

**Setup:**
```bash
npm install                # Installs husky automatically via prepare script
chmod +x .husky/pre-commit # Make hook executable
```

**Skip Hooks (Emergency Only):**
```bash
git commit --no-verify
```

### GitHub Actions CI/CD

**Workflow:** `.github/workflows/security-scan.yml`

Runs automatically on:
- Every push to `main` or `develop`
- Every pull request
- Daily at 2 AM UTC (scheduled scan)

**Scans Include:**
- ESLint security checks
- Hard-coded secret detection
- Semgrep vulnerability scan
- npm audit for dependency vulnerabilities
- Security TODO comment detection

## 🔍 Quick Security Scan

Run comprehensive security check:

```bash
make security-scan
# Or
npm run security-scan
```

This runs:
1. Hard-coded secret detection
2. ESLint security rules
3. Reports any issues found

## 🚨 What to Do If Security Issues Are Found

### Hard-Coded Secrets

**Problem:** API key found in source code

**Solution:**
1. Remove the hard-coded value from code
2. Add to `.env` file:
   ```bash
   MY_API_KEY=your-actual-key-here
   ```
3. Update code to use environment variable:
   ```javascript
   const apiKey = process.env.MY_API_KEY;
   ```
4. Deploy environment variables:
   ```bash
   make deploy-env
   ```
5. Add to `.env.example` with placeholder:
   ```bash
   MY_API_KEY=your-api-key-here
   ```

### XSS Vulnerabilities

**Problem:** Unsanitized HTML rendering

**Solution:**
1. Import sanitization utility:
   ```typescript
   import { sanitizeHTML, highlightKeywordsSafe } from '../utils/sanitize';
   ```
2. Replace dangerous code:
   ```typescript
   // BEFORE (UNSAFE):
   element.innerHTML = userInput;
   
   // AFTER (SAFE):
   element.innerHTML = sanitizeHTML(userInput);
   ```

### SQL Injection

**Problem:** Concatenated SQL queries

**Solution:**
Use parameterized queries:
```javascript
// BEFORE (UNSAFE):
const sql = `SELECT * FROM users WHERE id = ${userId}`;

// AFTER (SAFE):
const sql = 'SELECT * FROM users WHERE id = ?';
const result = await db.execute({ sql, args: [userId] });
```

### Command Injection

**Problem:** User input in shell commands

**Solution:**
1. Avoid shell commands when possible
2. Use libraries with proper escaping
3. Validate and whitelist allowed values
4. Never pass unsanitized user input to `exec()` or `spawn()`

## 📊 Security Metrics

### Current Status (as of Oct 27, 2025)

**BLOCKER Issues:** 0 ✅
- Hard-coded credentials: 0 (was 1)
- XSS vulnerabilities: 0 (was 5+)

**CRITICAL Issues:** 0 ✅
- Unhandled promise rejections: Protected
- Resource leaks: Verified clean
- Global error handlers: Implemented

**Code Quality:**
- ESLint: Configured with security rules
- Pre-commit hooks: Active
- CI/CD scanning: Automated
- Test coverage: [Target 80%]

## 🔧 Maintenance

### Weekly

- Review GitHub Actions security scan results
- Check for new npm audit vulnerabilities
- Update dependencies if security patches available

### Monthly

- Review CloudWatch logs for security events
- Audit environment variable usage
- Review and update security rules
- Check for new ESLint security rules

### Quarterly

- Full security audit per `LLM_CODE_REVIEW_FINDINGS_AND_FIXES.md`
- Dependency updates and testing
- Review and update this documentation

## 📚 Related Documentation

- `developer_log/LLM_CODE_REVIEW_FINDINGS_AND_FIXES.md` - Comprehensive security audit results
- `.eslintrc.json` - ESLint configuration
- `.semgrep.yml` - Semgrep rules
- `.husky/pre-commit` - Git pre-commit hook

## 🆘 Support

**Security Issue Found?**
1. Check `LLM_CODE_REVIEW_FINDINGS_AND_FIXES.md` for remediation guidance
2. Run `make security-scan` to verify the issue
3. Apply the recommended fix from the documentation
4. Verify fix with another security scan

**False Positive?**
If a security tool reports a false positive:
1. Review the code carefully to confirm it's safe
2. Add an ESLint or Semgrep exception with justification:
   ```javascript
   // eslint-disable-next-line security/detect-non-literal-fs-filename -- Safe: path is validated
   const content = fs.readFileSync(validatedPath);
   ```

## 🔒 Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Sanitize all user input** - Prevent XSS, injection attacks
3. **Use parameterized queries** - Prevent SQL injection
4. **Validate file paths** - Prevent path traversal
5. **Add error handling** - Catch promise rejections
6. **Clean up resources** - Remove event listeners
7. **Review changes** - Pre-commit hooks catch issues early
8. **Monitor logs** - CloudWatch for production issues

---

**Last Updated:** October 27, 2025  
**Maintainer:** Development Team  
**Security Contact:** [Your security contact info]
