# Google Sheets Logging Setup Guide

This guide walks you through setting up Google Sheets logging for LLM API requests.

## Overview

The system will automatically log every LLM request to a Google Sheet with:
- **Timestamp**: When the request was made
- **User Email**: Email of the authenticated user
- **Provider**: LLM provider (openai, groq, gemini)
- **Model**: Specific model used (gpt-4o, gemini-2.0-flash, etc.)
- **Tokens In**: Input/prompt tokens
- **Tokens Out**: Output/completion tokens
- **Total Tokens**: Sum of input + output
- **Cost ($)**: Calculated cost based on model pricing
- **Duration (s)**: Request duration in seconds

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name: `LLM Proxy Logger` (or your preferred name)
4. Click **Create**

---

## Step 2: Enable Google Sheets API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for **Google Sheets API**
3. Click on it and click **Enable**

---

## Step 3: Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in the details:
   - **Service account name**: `llm-logger`
   - **Service account ID**: (auto-generated, e.g., `llm-logger@project.iam.gserviceaccount.com`)
   - **Description**: `Service account for logging LLM requests to Google Sheets`
4. Click **Create and Continue**
5. Skip role assignment (not needed for Sheets API)
6. Click **Done**

---

## Step 4: Create Service Account Key

1. In **Credentials**, find your newly created service account
2. Click on the service account email
3. Go to the **Keys** tab
4. Click **Add Key** → **Create new key**
5. Select **JSON** format
6. Click **Create**
7. A JSON file will download automatically - **KEEP THIS SECURE!**

The JSON file will look like this:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n",
  "client_email": "llm-logger@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

---

## Step 5: Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet
3. Name it: `LLM API Usage Log` (or your preferred name)
4. Note the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0/edit
                                          ^^^^^^^^^^^^^^^^^^^
                                          This is your Spreadsheet ID
   ```

---

## Step 6: Share Sheet with Service Account

**CRITICAL STEP**: You must give the service account access to the spreadsheet!

1. In your Google Sheet, click **Share** (top-right corner)
2. Add the service account email (from Step 3):
   - Example: `llm-logger@your-project.iam.gserviceaccount.com`
3. Set permission to **Editor**
4. Click **Send**

---

## Step 7: Configure Environment Variables

Add these variables to your `.env` file:

```bash
# ----------------------------------------------------------------
# GOOGLE SHEETS LOGGING (Optional)
# ----------------------------------------------------------------

# Enable Google Sheets logging for LLM API requests
# Leave these unset to disable logging

# Your Google Sheet ID (from the URL)
GOOGLE_SHEETS_LOG_SPREADSHEET_ID=1a2b3c4d5e6f7g8h9i0

# Service account email (from the JSON key file)
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=llm-logger@your-project.iam.gserviceaccount.com

# Service account private key (from the JSON key file)
# IMPORTANT: Must include the full key with header/footer
# Keep the \\n escape sequences for newlines
GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg...full key here...\\n-----END PRIVATE KEY-----\\n"

# Optional: Sheet name (defaults to "LLM Usage Log")
GOOGLE_SHEETS_LOG_SHEET_NAME=LLM Usage Log
```

### Important Notes:

1. **Private Key Format**: 
   - Keep the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
   - Use `\\n` for newlines (double backslash)
   - Wrap the entire key in quotes

2. **Private Key Example**:
   ```bash
   GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5...\\n...full key...\\n-----END PRIVATE KEY-----\\n"
   ```

---

## Step 8: Deploy Environment Variables

After updating `.env`, deploy to Lambda:

```bash
make deploy-env
```

---

## Step 9: Initialize Sheet Headers (Optional)

The system will automatically create headers on first use, but you can manually initialize:

```javascript
const { initializeSheet } = require('./src/services/google-sheets-logger');
await initializeSheet();
```

Or the system will auto-create headers on the first log entry.

---

## Step 10: Test the Integration

1. Make a test LLM request through your proxy
2. Check your Google Sheet - you should see a new row with:
   - Timestamp
   - User email
   - Model info
   - Token counts
   - Cost
   - Duration

---

## Pricing Configuration

Model pricing is configured in `src/services/google-sheets-logger.js`. Update the `PRICING` object to reflect current rates:

```javascript
const PRICING = {
    'gpt-4o': { input: 2.50, output: 10.00 },  // per 1M tokens
    'gpt-4o-mini': { input: 0.150, output: 0.600 },
    // ... add more models as needed
};
```

Prices are per 1 million tokens.

---

## Troubleshooting

### Error: "The caller does not have permission"
- Make sure you shared the spreadsheet with the service account email
- Check that the service account has Editor permissions

### Error: "OAuth failed"
- Verify the private key is correctly formatted with `\\n` for newlines
- Ensure the entire key including BEGIN/END markers is present
- Check that Google Sheets API is enabled in your project

### No logs appearing
- Check CloudWatch logs for error messages
- Verify all environment variables are set correctly
- Run `make deploy-env` to update Lambda configuration

### Cost showing $0.00 for paid models
- Update the `PRICING` object in `google-sheets-logger.js`
- Redeploy: `make deploy-lambda-fast`

---

## Security Best Practices

1. **Never commit the service account JSON file to git**
2. **Keep the private key secure** - treat it like a password
3. **Use separate service accounts** for dev/staging/production
4. **Regularly rotate service account keys** (recommended: every 90 days)
5. **Limit service account permissions** to only Google Sheets API
6. **Monitor the Google Sheet** for unusual activity

---

## Sheet Format

The sheet will have these columns:

| Timestamp | User Email | Provider | Model | Tokens In | Tokens Out | Total Tokens | Cost ($) | Duration (s) |
|-----------|------------|----------|-------|-----------|------------|--------------|----------|--------------|
| 2025-01-11T15:30:00Z | user@example.com | gemini | gemini-2.0-flash | 594 | 125 | 719 | 0.0000 | 1.23 |
| 2025-01-11T15:31:00Z | user@example.com | openai | gpt-4o | 1200 | 500 | 1700 | 0.0080 | 2.45 |

You can add charts, pivot tables, or formulas to analyze your usage!

---

## Disabling Logging

To disable Google Sheets logging:
1. Remove or comment out the environment variables
2. Run `make deploy-env`

The system will automatically skip logging when variables aren't configured.
