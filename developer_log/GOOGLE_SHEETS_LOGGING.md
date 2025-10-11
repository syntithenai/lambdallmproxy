# Google Sheets Logging - Quick Start

## What's Been Implemented

✅ Automatic logging of all LLM API requests to Google Sheets  
✅ Tracks: user email, provider, model, tokens, cost, duration, timestamp  
✅ Non-blocking async logging (doesn't slow down responses)  
✅ Graceful fallback if logging fails  
✅ Model pricing database for cost calculation  

## Files Added/Modified

1. **`src/services/google-sheets-logger.js`** - New logging service
2. **`src/endpoints/chat.js`** - Integrated logging at request completion
3. **`.env`** - Added Google Sheets configuration template
4. **`GOOGLE_SHEETS_LOGGING_SETUP.md`** - Complete setup guide

## Quick Setup (5 minutes)

1. **Create Google Service Account**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project or select existing
   - Enable "Google Sheets API"
   - Create Service Account with Sheets access
   - Download JSON key file

2. **Create Google Sheet**:
   - Create new spreadsheet at [sheets.google.com](https://sheets.google.com/)
   - Copy the Spreadsheet ID from URL
   - Share with service account email (Editor permissions)

3. **Configure `.env`**:
   ```bash
   GOOGLE_SHEETS_LOG_SPREADSHEET_ID=your_spreadsheet_id_here
   GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYour\\nKey\\nHere\\n-----END PRIVATE KEY-----\\n"
   ```

4. **Deploy**:
   ```bash
   make deploy-env
   ```

5. **Test**:
   - Make an LLM request through your proxy
   - Check your Google Sheet for the logged entry

## Sheet Columns

| Column | Description | Example |
|--------|-------------|---------|
| Timestamp | ISO 8601 timestamp | 2025-01-11T15:30:00Z |
| User Email | Authenticated user email | user@example.com |
| Provider | LLM provider | gemini, openai, groq |
| Model | Specific model | gemini-2.0-flash |
| Tokens In | Input/prompt tokens | 594 |
| Tokens Out | Output/completion tokens | 125 |
| Total Tokens | Sum of in + out | 719 |
| Cost ($) | Calculated cost | 0.0080 |
| Duration (s) | Request duration | 1.23 |

## Cost Tracking

The system includes pricing for common models:

- **Gemini**: Free tier (tracked as $0.00)
- **OpenAI GPT-4o**: $2.50/$10.00 per 1M tokens (in/out)
- **OpenAI GPT-4o-mini**: $0.15/$0.60 per 1M tokens
- **Groq**: Free tier (tracked as $0.00)

Update pricing in `src/services/google-sheets-logger.js` as needed.

## Disabling Logging

To disable, simply don't set the environment variables or comment them out:

```bash
# GOOGLE_SHEETS_LOG_SPREADSHEET_ID=...
# GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=...
# GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY=...
```

The system will automatically skip logging with message: `ℹ️ Google Sheets logging not configured (skipping)`

## Troubleshooting

**No logs appearing?**
- Check CloudWatch logs for error messages
- Verify service account has Editor access to sheet
- Ensure Google Sheets API is enabled
- Confirm private key format (must have \\n for newlines)

**Logs show "Failed to log to Google Sheets"?**
- Check the specific error in CloudWatch
- Common: "The caller does not have permission" = share sheet with service account
- Common: "OAuth failed" = check private key formatting

**Cost showing $0.00 for paid models?**
- Update PRICING object in `google-sheets-logger.js`
- Redeploy with `make deploy-lambda-fast`

## Benefits

✅ **Usage Monitoring**: Track API consumption per user  
✅ **Cost Analysis**: Calculate spending by model and user  
✅ **Performance Tracking**: Monitor request durations  
✅ **Audit Trail**: Complete log of all LLM requests  
✅ **Budget Management**: Identify high-usage users or models  

## Security Notes

⚠️ **Never commit the service account JSON key to git**  
⚠️ **Treat the private key like a password**  
⚠️ **Use separate accounts for dev/prod**  
⚠️ **Rotate keys regularly (every 90 days)**  

---

For detailed setup instructions, see **`GOOGLE_SHEETS_LOGGING_SETUP.md`**
