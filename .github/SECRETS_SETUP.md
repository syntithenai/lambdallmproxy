# GitHub Actions Secrets Setup

This document lists all secrets that need to be configured in GitHub repository settings for CI/CD pipelines.

## Required Secrets

Go to: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### AWS Deployment

| Secret Name | Description | Example |
|------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key ID | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret access key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCY...` |
| `AWS_REGION` | AWS region for Lambda | `us-east-1` |

**AWS IAM Permissions Required:**
- `lambda:UpdateFunctionCode`
- `lambda:UpdateFunctionConfiguration`
- `lambda:GetFunction`
- `lambda:GetFunctionConfiguration`
- `logs:DescribeLogStreams`
- `logs:GetLogEvents`

### API Keys (Lambda Environment)

| Secret Name | Description |
|------------|-------------|
| `GROQ_API_KEY` | Groq LLM API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

### Google Integration

| Secret Name | Description |
|------------|-------------|
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` | Google Sheets service account email |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 2.0 client secret |

**Note**: The Google Sheets private key is stored in AWS Secrets Manager (too large for Lambda env vars).

### Application Configuration

| Secret Name | Description | Default |
|------------|-------------|---------|
| `AUTHORIZED_USERS` | Comma-separated list of authorized emails | `user@example.com,admin@example.com` |
| `LAMBDA_PROFIT_MARGIN` | Infrastructure cost multiplier | `6` |

### Payment Processing

| Secret Name | Description |
|------------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret |

## Auto-Generated Secrets

These are automatically provided by GitHub:

| Secret Name | Description |
|------------|-------------|
| `GITHUB_TOKEN` | GitHub Actions token for repo access (auto-created) |

## Setup Instructions

### 1. Create AWS IAM User

```bash
# Create IAM user for GitHub Actions
aws iam create-user --user-name github-actions-lambdallmproxy

# Attach necessary policies
aws iam attach-user-policy \
  --user-name github-actions-lambdallmproxy \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess

# Create access key
aws iam create-access-key --user-name github-actions-lambdallmproxy
```

Save the `AccessKeyId` and `SecretAccessKey` from the output.

### 2. Add Secrets to GitHub

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret from the table above

### 3. Verify Secrets

After adding secrets, check the Deploy Lambda workflow:

1. Go to **Actions** tab
2. Click **Deploy Lambda** workflow
3. Click **Run workflow**
4. Select deployment type and trigger
5. Check logs for successful authentication

## Security Best Practices

- ✅ **Never commit secrets** to git (use `.env.example` with placeholder values)
- ✅ **Rotate access keys** every 90 days
- ✅ **Use least privilege** IAM policies (only Lambda permissions)
- ✅ **Enable AWS CloudTrail** to audit API calls
- ✅ **Review GitHub Actions logs** for exposed secrets before making repository public
- ⚠️ **Secrets are redacted** in GitHub Actions logs but exercise caution

## Troubleshooting

**"InvalidClientTokenId" error:**
- Check `AWS_ACCESS_KEY_ID` is correct
- Verify IAM user has required permissions

**"AccessDeniedException" error:**
- Attach AWSLambda_FullAccess policy to IAM user
- Or create custom policy with specific Lambda permissions

**Environment variables not updating:**
- Ensure you checked "Also deploy environment variables" when running workflow
- Verify all API key secrets are configured in GitHub

**UI deployment failing:**
- `GITHUB_TOKEN` is auto-generated, no setup needed
- Check repository has Pages enabled (Settings → Pages → Source: gh-pages branch)

## Migration from Local `.env`

To migrate your local `.env` to GitHub Secrets:

```bash
# List all variables in your .env
cat .env | grep -v '^#' | grep '=' | cut -d '=' -f 1

# For each variable, add it to GitHub Secrets:
# 1. Copy the value from .env
# 2. Go to GitHub Settings → Secrets → New repository secret
# 3. Paste name and value
```

**Important**: Only add Lambda-specific secrets, not local development settings like `NODE_ENV=development` or `HEADLESS=true`.
