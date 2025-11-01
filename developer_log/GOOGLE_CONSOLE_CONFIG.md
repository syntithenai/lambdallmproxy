# Google Console Configuration for OAuth

This document provides instructions for configuring Google Cloud Console settings required for YouTube transcription functionality.

## Prerequisites

Before configuring the Google Console, ensure you have:
- A Google Cloud Platform (GCP) project
- Enabled the YouTube Data API v3
- The necessary API credentials for your application

## Step-by-Step Configuration

### 1. Create or Select a Project

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Select your existing project or create a new one:
   - Click "Select a project" in the top navigation bar
   - Click "New Project"
   - Enter a project name (e.g., `llmproxy-dev`)
   - Click "Create"

### 2. Enable YouTube Data API v3

1. In the Google Cloud Console, navigate to "APIs & Services" → "Library"
2. Search for "YouTube Data API v3"
3. Click on the API and then click "Enable"

### 3. Create OAuth 2.0 Credentials

#### a) Configure OAuth Consent Screen
1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type (recommended for development)
3. Fill in:
   - Application name: `llmproxy` or similar
   - User support email: Your email address
   - Developer contact information: Your email address
4. Click "Save and continue"
5. Click "Add or remove scopes" and add:
   - `https://www.googleapis.com/auth/youtube.readonly`
6. Click "Save and continue"
7. Click "Review and publish"

#### b) Create OAuth Client ID
1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Web application"
4. Configure:
   - Application name: `llmproxy`
   - Authorized JavaScript origins:
     - `http://localhost:8081` (for development UI)
     - `http://localhost:5173` (for development UI)
     - `http://localhost:3000` (for local Lambda server)
   - Authorized redirect URIs:
     - `http://localhost:3000/oauth/callback` (for local development)
     - `https://your-lambda-url.lambda-url.us-east-1.on.aws/oauth/callback` (for production)
5. Click "Create"

### 4. Configure Environment Variables

After creating the OAuth client ID, update your `.env` file:

```bash
# Google OAuth 2.0 credentials for YouTube Data API v3
GGL_CID=your-client-id.apps.googleusercontent.com
GGL_SEC=GOCSPX-your-client-secret
OAUTH_URI=http://localhost:3000/oauth/callback
```

### 5. Register Callback URI

Make sure to register the OAuth redirect URI in your `.env` file:
- For local development: `http://localhost:3000/oauth/callback`
- For production: `https://your-lambda-url.lambda-url.us-east-1.on.aws/oauth/callback`

## Important Notes

### Port Configuration
The default port used for the Lambda development server is 3000, which matches the OAuth redirect URI in your environment file. If you change this port:
1. Update the `OAUTH_URI` in your `.env` file to match the new port
2. Update the "Authorized redirect URIs" in the Google Console

### Testing OAuth Locally
1. Start the local development servers with `make dev`
2. The OAuth redirect URI should be automatically detected by the UI
3. The system will automatically use the correct callback URL based on the running server

### Production Deployment
When deploying to production:
1. Update your `.env` file with production URLs
2. Add the production callback URI in Google Console
3. Deploy environment variables using `make deploy-env`

## Troubleshooting

### Common Issues

#### 1. "Invalid redirect_uri" Error
- Ensure your OAuth redirect URI matches exactly what's configured in Google Console
- Check that your `.env` file has the correct `OAUTH_URI`
- For local development, make sure you're using port 3000 (as per default configuration)

#### 2. "Client secrets do not match" Error  
- Verify that `GGL_CID` and `GGL_SEC` in your `.env` exactly match what's in Google Console
- Ensure you're using the correct client ID and secret from the OAuth client created in step 3b

#### 3. CORS Issues
- If you see CORS errors during OAuth flow, ensure that localhost origins are properly configured:
  - `http://localhost:8081`
  - `http://localhost:5173` 
  - `http://localhost:3000`

### Verification Steps

After configuration:

1. Start local development with `make dev`
2. Verify OAuth redirect URI in browser console
3. Test YouTube transcription functionality
4. Check that the system can access YouTube Data API using the credentials

## Security Best Practices

- Never commit OAuth client secrets to version control
- Use environment variables for all sensitive information
- Regularly rotate credentials if necessary
- Set up appropriate IAM roles and permissions
- Monitor usage through Google Cloud Console billing and logging