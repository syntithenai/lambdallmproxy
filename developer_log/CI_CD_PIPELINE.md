# CI/CD Pipeline Documentation

**Date**: October 25, 2025  
**Status**: Fully implemented with GitHub Actions

---

## Overview

This project uses GitHub Actions for continuous integration and deployment with three main workflows:

1. **Test** - Automated testing on every PR and push
2. **Deploy UI** - Automatic deployment of React UI to GitHub Pages
3. **Deploy Lambda** - Manual deployment of AWS Lambda backend

---

## Workflows

### 1. Test Workflow (`.github/workflows/test.yml`)

**Triggers**:
- Every pull request to `main` branch
- Every push to `main` branch
- Manual trigger via Actions tab

**What it does**:
- ✅ Installs Node.js 20 and dependencies
- ✅ Runs unit tests (`npm run test:unit`)
- ✅ Runs integration tests (`npm run test:integration`)
- ✅ Generates coverage report (`npm run test:coverage`)
- ✅ Uploads coverage artifacts (30-day retention)
- ✅ Checks coverage threshold (warns if <50%)

**Viewing Results**:
1. Go to **Actions** tab → **Test** workflow
2. Click on latest run
3. Download coverage report from **Artifacts** section
4. View inline test results in workflow logs

---

### 2. Deploy UI Workflow (`.github/workflows/deploy-ui.yml`)

**Triggers**:
- Automatic on push to `main` when UI files change:
  - `ui-new/**`
  - `scripts/build-docs.sh`
  - `scripts/deploy-docs.sh`
- Manual trigger via Actions tab

**What it does**:
- ✅ Installs Node.js 20 and UI dependencies
- ✅ Builds React app via `scripts/build-docs.sh`
- ✅ Deploys to GitHub Pages via `scripts/deploy-docs.sh`
- ✅ Auto-commits to `main` branch with build artifacts

**Live URL**: https://syntithenai.github.io/lambdallmproxy/

**Manual Deployment**:
1. Go to **Actions** → **Deploy UI**
2. Click **Run workflow**
3. Select branch: `main`
4. Click **Run workflow** button

---

### 3. Deploy Lambda Workflow (`.github/workflows/deploy-lambda.yml`)

**Triggers**:
- **Manual only** (workflow_dispatch) for safety

**What it does**:
- ✅ Installs dependencies and configures AWS credentials
- ✅ Deploys Lambda function code
- ✅ Optionally deploys environment variables

**Deployment Types**:
- **Fast** (recommended): Code-only deployment (~10 seconds)
  - Uses pre-built Lambda layer with dependencies
  - Run `make setup-layer` locally first (one-time)
- **Full**: Complete deployment with dependencies (~2-3 minutes)
  - Rebuilds entire deployment package
  - Use when `package.json` changes

**Environment Variables**:
- Optional checkbox: "Also deploy environment variables"
- Creates `.env.lambda` from GitHub Secrets
- Deploys to AWS Lambda configuration

**Manual Deployment**:
1. Go to **Actions** → **Deploy Lambda**
2. Click **Run workflow**
3. Select deployment type: **fast** or **full**
4. Check "Also deploy environment variables" if needed
5. Click **Run workflow** button
6. Monitor logs for errors

---

## GitHub Secrets Setup

**CRITICAL**: You must configure secrets before workflows can deploy.

### Required Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

#### AWS Credentials

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `AWS_REGION` | AWS region (default: `us-east-1`) |

#### API Keys (Lambda Environment)

| Secret | Description |
|--------|-------------|
| `GROQ_API_KEY` | Groq LLM API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

#### Google Integration

| Secret | Description |
|--------|-------------|
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` | Google Sheets service account |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret |

#### Application Config

| Secret | Description | Default |
|--------|-------------|---------|
| `AUTHORIZED_USERS` | Comma-separated emails | - |
| `LAMBDA_PROFIT_MARGIN` | Infrastructure cost multiplier | `6` |

#### Payment Processing

| Secret | Description |
|--------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret |

**Full setup guide**: See `.github/SECRETS_SETUP.md`

---

## Local Development vs CI/CD

### Local Development (Primary Workflow)

```bash
# Backend changes
make dev                # Start local Lambda + UI servers
                        # Backend: http://localhost:3000
                        # Frontend: http://localhost:8081

# DO NOT deploy after every change
# Test locally, deploy when production-ready
```

### CI/CD Deployment (Production)

```bash
# UI changes (automatic on git push)
git add ui-new/
git commit -m "feat: new feature"
git push origin main
# → Triggers Deploy UI workflow automatically

# Lambda changes (manual)
git add src/
git commit -m "fix: bug fix"
git push origin main
# → Go to Actions → Deploy Lambda → Run workflow (manual)
```

---

## Workflow Comparison: Local vs CI/CD

| Task | Local Command | CI/CD Workflow |
|------|---------------|----------------|
| Run tests | `npm test` | Automatic on PR/push |
| Deploy Lambda (fast) | `make deploy-lambda-fast` | **Deploy Lambda** (manual) |
| Deploy Lambda (full) | `make deploy-lambda` | **Deploy Lambda** (manual) |
| Deploy UI | `make deploy-ui` | **Deploy UI** (automatic) |
| Deploy env vars | `make deploy-env` | **Deploy Lambda** + check box |
| View logs | `make logs` | CloudWatch (via AWS Console) |

---

## Status Badges

Badges at the top of `README.md` show workflow status:

- [![Test](https://github.com/syntithenai/lambdallmproxy/actions/workflows/test.yml/badge.svg)](https://github.com/syntithenai/lambdallmproxy/actions/workflows/test.yml) - All tests passing
- [![Deploy UI](https://github.com/syntithenai/lambdallmproxy/actions/workflows/deploy-ui.yml/badge.svg)](https://github.com/syntithenai/lambdallmproxy/actions/workflows/deploy-ui.yml) - UI deployment status
- [![Deploy Lambda](https://github.com/syntithenai/lambdallmproxy/actions/workflows/deploy-lambda.yml/badge.svg)](https://github.com/syntithenai/lambdallmproxy/actions/workflows/deploy-lambda.yml) - Lambda deployment status

Green = Success, Red = Failed, Gray = Not run

---

## Troubleshooting

### Test Workflow Failures

**"npm ci failed"**:
- Check `package.json` and `package-lock.json` are in sync
- Run `npm install` locally and commit updated `package-lock.json`

**"Test failed"**:
- Run tests locally: `npm test`
- Fix failing tests before pushing

**"Coverage below threshold"**:
- Warning only, doesn't fail workflow
- Add tests to increase coverage

---

### Deploy Lambda Failures

**"InvalidClientTokenId"**:
- Check `AWS_ACCESS_KEY_ID` secret is correct
- Verify IAM user exists

**"AccessDeniedException"**:
- IAM user needs `AWSLambda_FullAccess` policy
- See `.github/SECRETS_SETUP.md` for IAM setup

**"Environment variables not updating"**:
- Ensure you checked "Also deploy environment variables"
- Verify all API key secrets are configured
- Check workflow logs for `.env.lambda` generation

**"Fast deployment failed - layer not found"**:
- Run `make setup-layer` locally once
- Or use "full" deployment type instead

---

### Deploy UI Failures

**"Build failed"**:
- Check UI builds locally: `cd ui-new && npm run build`
- Fix TypeScript/ESLint errors

**"Permission denied"**:
- `GITHUB_TOKEN` is auto-created, no setup needed
- Check repository settings: Pages enabled, source = `gh-pages` branch

**"UI not updating"**:
- GitHub Pages can take 1-2 minutes to update
- Hard refresh browser (Ctrl+Shift+R)
- Check workflow deployed to correct branch

---

## Best Practices

### ✅ Do

- **Test locally before pushing** (`make dev`, `npm test`)
- **Use fast Lambda deployment** when only code changes
- **Let UI auto-deploy** on UI file changes
- **Review workflow logs** after deployment
- **Keep secrets up to date** (rotate every 90 days)

### ❌ Don't

- **Don't deploy Lambda automatically** (kept manual for cost control)
- **Don't commit secrets** to git (use `.env.example` instead)
- **Don't skip tests** - workflow will catch failures early
- **Don't ignore failed workflows** - investigate and fix

---

## CI/CD Philosophy

**Local-First Development**:
- Primary development happens on `localhost`
- CI/CD is for **production deployment**, not development iteration
- Test thoroughly locally before deploying

**Selective Automation**:
- **UI**: Automatic deployment (safe, fast, free)
- **Lambda**: Manual deployment (costs money, requires review)
- **Tests**: Automatic on every PR (catch bugs early)

**Safety First**:
- Manual Lambda deployment prevents accidental costs
- Environment variables must be explicitly updated
- All deployments logged and auditable

---

## Migration Path

### From Local-Only to CI/CD

**Phase 1: Setup** (one-time)
1. Configure GitHub Secrets (`.github/SECRETS_SETUP.md`)
2. Create Lambda layer: `make setup-layer`
3. Test workflows: Create test PR, trigger manual deployments

**Phase 2: Adoption** (gradual)
1. Continue local development: `make dev`
2. When production-ready: Use GitHub Actions for deployment
3. Monitor workflow runs, adjust as needed

**Phase 3: Full Automation** (future)
- Could automate Lambda deployment to staging environment
- Could add approval gates for production deployment
- Could integrate with monitoring/alerting systems

---

## Quick Reference

### Common Tasks

**Run tests locally**:
```bash
npm test                    # All tests
npm run test:unit           # Unit only
npm run test:integration    # Integration only
npm run test:coverage       # With coverage
```

**Deploy manually**:
```bash
make deploy-lambda-fast     # Lambda (fast)
make deploy-ui              # UI
make deploy-env             # Environment variables
```

**Deploy via CI/CD**:
1. Push code: `git push origin main`
2. Go to **Actions** tab
3. Select workflow, click **Run workflow**

**View logs**:
```bash
make logs                   # Local: CloudWatch (last 5 min)
# Or: Actions → Workflow run → View logs
```

---

## Support

**Questions or Issues?**
- Check workflow logs in Actions tab
- Review `.github/SECRETS_SETUP.md` for secrets
- See `README.md` for project overview
- Check `Makefile` for all available commands

**Updating Workflows**:
- Edit files in `.github/workflows/`
- Test changes by triggering workflow manually
- Monitor for errors, iterate as needed
