# Google Cloud Setup for YouTube Data API

This guide walks you through setting up a YouTube Data API key for the LLM Proxy application.

## Prerequisites

- A Google Cloud account (free tier is sufficient)
- Access to [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top of the page
3. Click **"New Project"**
4. Enter a project name (e.g., "LLM Proxy YouTube")
5. Click **"Create"**
6. Wait for the project to be created, then select it

## Step 2: Enable YouTube Data API v3

1. In the Google Cloud Console, navigate to **"APIs & Services"** > **"Library"**
2. Search for **"YouTube Data API v3"**
3. Click on **"YouTube Data API v3"** in the results
4. Click the **"Enable"** button
5. Wait for the API to be enabled (this may take a few seconds)

## Step 3: Create an API Key

1. Navigate to **"APIs & Services"** > **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"API key"** from the dropdown
4. A new API key will be generated and displayed
5. **Copy the API key** - you'll need this for your application
6. Click **"EDIT API KEY"** to configure restrictions (recommended)

## Step 4: Configure API Key Restrictions (Recommended)

### Application Restrictions

1. Under **"Application restrictions"**, select **"HTTP referrers (web sites)"**
2. Click **"+ ADD AN ITEM"** and add the following referrers:
   - `https://lambdallmproxy.pages.dev/*` (production site)
   - `http://localhost:8081/*` (local development)
   - `https://*.lambda-url.us-east-1.on.aws/*` (Lambda function URL)
3. If you're testing and encountering issues, you can temporarily select **"None"** to disable restrictions

### API Restrictions

1. Under **"API restrictions"**, select **"Restrict key"**
2. From the dropdown, select:
   - ✅ **YouTube Data API v3**
3. Click **"Save"**

## Step 5: Configure the API Key in Your Application

### Backend Configuration

Update the API key in `src/tools.js`:

```javascript
// Use YouTube Data API v3 with API key
const apiKey = 'YOUR_API_KEY_HERE';
```

### Environment Variables (Alternative)

For better security, you can store the API key as an environment variable:

1. Add to your `.env` file:
   ```
   YOUTUBE_API_KEY=YOUR_API_KEY_HERE
   ```

2. Update `src/tools.js` to read from environment:
   ```javascript
   const apiKey = process.env.YOUTUBE_API_KEY || 'YOUR_FALLBACK_KEY';
   ```

## Step 6: Set Up API Quotas (Optional)

YouTube Data API has daily quota limits. For most use cases, the default quota is sufficient, but you can monitor and adjust as needed:

1. Navigate to **"APIs & Services"** > **"Dashboard"**
2. Click on **"YouTube Data API v3"**
3. View the **"Quotas"** tab to monitor usage
4. Default quota: **10,000 units per day**
5. Each search request costs approximately **100 units**
6. Request quota increase if needed (navigate to **"Quotas & System Limits"**)

## Common Issues and Troubleshooting

### Issue: "Requests from referer <empty> are blocked"

**Solution**: Configure HTTP referrer restrictions in Step 4, or temporarily disable application restrictions.

### Issue: "API key not valid"

**Solution**: 
- Verify the API key is correctly copied
- Ensure YouTube Data API v3 is enabled
- Check that API restrictions include YouTube Data API v3

### Issue: "The request cannot be completed because you have exceeded your quota"

**Solution**:
- Wait for the daily quota to reset (midnight Pacific Time)
- Request a quota increase from Google Cloud Console
- Optimize search queries to reduce API calls

### Issue: "Daily Limit Exceeded"

**Solution**:
- Each video search costs ~100 quota units
- Each caption check costs ~50 quota units
- Default limit is 10,000 units/day (approx 100 searches)
- Consider implementing caching to reduce API calls

## API Cost Breakdown

YouTube Data API v3 quota costs:

| Operation | Quota Cost |
|-----------|------------|
| Search query | 100 units |
| Video details | 1 unit |
| Captions list | 50 units |
| Caption download | 200 units |

**Example**: Searching for 10 videos with caption checking and transcript fetching costs:
- Search: 100 units
- Captions check (10 videos): 10 × 50 = 500 units
- **Total**: 600 units per search

**Note**: Transcript fetching uses YouTube's public timedtext API which does not count against your quota. Only the captions.list API call (to check caption availability) consumes quota units.

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for production deployments
3. **Enable API restrictions** to limit which APIs can be called
4. **Enable HTTP referrer restrictions** to prevent unauthorized use
5. **Rotate API keys** periodically
6. **Monitor usage** in Google Cloud Console
7. **Set up billing alerts** to avoid unexpected charges

## Additional Resources

- [YouTube Data API Documentation](https://developers.google.com/youtube/v3/docs)
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [YouTube Data API Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Google Cloud Free Tier](https://cloud.google.com/free)

## Support

For issues with:
- **API Key Configuration**: Check Google Cloud Console documentation
- **Application Integration**: See main README.md
- **API Quota Issues**: Contact Google Cloud Support or request quota increase

## Next Steps

After completing this setup:
1. Deploy your Lambda function with the API key configured
2. Test YouTube search functionality
3. Monitor API usage in Google Cloud Console
4. Consider implementing caching for frequently accessed videos
