# Environment Variable Management Best Practices

This document outlines best practices for managing environment variables to prevent leakage between branches and ensure secure development workflows.

## Preventing Environment Variable Leakage Between Branches

### 1. Use .gitignore for Local Files

All `.env` files should be in `.gitignore`. The project already includes:
```bash
.env
.env.*
```

This ensures that local environment files are never committed to version control.

### 2. Separate Environment Files for Different Environments

The project uses different environment file patterns:
- `.env.example` - Template with placeholder values (safe to commit)
- `.env` - Local development variables (ignored by git)
- `.env.lambda` - Lambda deployment variables (separate from local)

### 3. Branch-Specific Configuration Management

For teams working across multiple branches:

#### Option A: Use Git Hooks
Create a pre-commit hook that checks for sensitive information:
```bash
#!/bin/bash
# .git/hooks/pre-commit
grep -r "API_KEY\|SECRET\|PASSWORD" --exclude-dir=.git .
if [ $? -eq 0 ]; then
  echo "⚠️  Warning: Potential secrets detected in commit"
  exit 1
fi
```

#### Option B: Use Environment Variable Validation in CI/CD
In your continuous integration pipeline, add security checks:
```yaml
# Example GitHub Actions workflow
- name: Check for Secrets
  run: |
    # Scan for common secret patterns
    git diff --cached --name-only | xargs grep -l "sk-[a-zA-Z0-9_\-]\{32\}\|gsk_[a-zA-Z0-9_\-]\{32\}" || true
```

### 4. Recommended Workflow for Branch Management

1. **Create feature branch** from main:
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Work locally without committing secrets**:
   - Never commit `.env` files 
   - Never commit `.env.*` files
   - Use `.env.example` as template for new configurations

3. **Use branch-specific configurations**:
   - For local development, use your personal `.env`
   - When working with shared branches, avoid adding environment variables to the branch
   - If sharing configuration is required, create a `.env.shared` file that's safe to commit (but must not contain secrets)

### 5. Using Environment Variables in Development

When setting up environment variables for development:

1. Create your local `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your actual credentials (these won't be committed due to gitignore)

3. Use the environment variables in code:
   - Vite: `process.env.VITE_PORT`
   - Node.js: `process.env.LOCAL_LAMBDA_PORT`

### 6. Best Practices for Secure Environment Management

#### Never Store Sensitive Information in Version Control
- API keys, secrets, passwords, tokens
- Private certificates
- Database connection strings with passwords

#### Use Separate Environments
- Local development: `.env` 
- Staging: `.env.staging`
- Production: Deployed via AWS Lambda Console or CI/CD pipeline

#### Regular Security Audits
- Periodically review committed files for secrets
- Use tools like `trufflehog`, `detect-secrets`, or `gitleaks`

#### Clear Documentation
Document all environment variables in `.env.example` with clear descriptions of what they're used for and how to obtain values.

## Implementation Details

### Current Project Setup

The project already implements good practices:
1. All `.env` files are in `.gitignore`
2. `.env.example` provides comprehensive template with placeholders
3. The Makefile clearly documents which files contain sensitive data
4. Environment variables are loaded using `dotenv` package

### Recommended Git Configuration

Add to your global git configuration to help prevent accidental commits:
```bash
git config --global core.excludesfile ~/.gitignore_global
```

Create `~/.gitignore_global` with:
```
.env
.env.*
.DS_Store
node_modules/
*.log
```

## Troubleshooting

### If You Accidentally Commit Secrets

1. **Rewrite git history**:
   ```bash
   # Remove file from all commits
   git filter-branch --force --index-filter 'git rm -r --cached --ignore-unmatch .env' --prune-empty --tag-name-filter cat -- --all
   
   # Push to remote (force push)
   git push origin --force --all
   ```

2. **Revoke the compromised credentials** at the service provider

3. **Update your local repository**:
   ```bash
   git fetch
   git reset --hard origin/main
   ```

### Verifying Your Environment Setup

1. Run `git status` to ensure no `.env` files are staged for commit
2. Check that only `.env.example` and other non-sensitive files are tracked
3. Verify environment variables are loaded properly in your development environment