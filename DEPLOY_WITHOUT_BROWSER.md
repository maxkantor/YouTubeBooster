# 🔐 Deploying Without Browser (Render/Headless)

When deploying to Render or other headless environments, you can't open a browser for OAuth. Here's how to handle it:

## Method 1: Pre-Generate Token Locally (Easiest)

**Do this ONCE on your local computer**, then upload the token to Render:

### Step 1: Generate Token Locally

1. **Run locally once** to authenticate:
   ```bash
   python3 web_app.py
   ```
   
2. **Complete OAuth flow** - this will create `token.pickle`

3. **Convert token to base64:**
   ```bash
   base64 -i token.pickle
   ```
   Copy the output

### Step 2: Add to Render Environment

1. In Render dashboard → Your service → Environment
2. Add environment variable:
   - Key: `GOOGLE_TOKEN_BASE64`
   - Value: (paste the base64 string)
3. Save and redeploy

### Step 3: Update Code to Load Token from Env

The code now automatically checks for `GOOGLE_TOKEN_BASE64` and creates `token.pickle` if found.

---

## Method 2: Use Console Authentication (For First-Time Setup on Render)

If you need to authenticate directly on Render (first time):

1. **Deploy your app to Render**

2. **Check Render logs** - you'll see a URL like:
   ```
   Please visit this URL to authorize this application: 
   https://accounts.google.com/o/oauth2/auth?...
   ```

3. **Copy that URL** and visit it in your browser

4. **Get the authorization code** from the redirect URL

5. **Paste it back** in the Render logs/console

6. **Token will be saved** - future restarts won't need this

**Note:** This is a one-time setup. After the token is saved, it will be reused.

---

## Method 3: Automated Setup Script

Create a setup script that you run once locally:

```bash
# setup_for_deployment.sh
python3 -c "
from youtube_booster.api_client import YouTubeAPIClient
# This will prompt for OAuth and create token.pickle
client = YouTubeAPIClient()
print('✅ Token created!')
"
```

Then upload both `credentials.json` and `token.pickle` as base64 env vars.

---

## Updated Code Features

The updated code now:
- ✅ Automatically detects headless environments
- ✅ Uses console authentication when no browser is available
- ✅ Can load `token.pickle` from `GOOGLE_TOKEN_BASE64` env var
- ✅ Can load `credentials.json` from `GOOGLE_CREDENTIALS_BASE64` env var

---

## Recommended Flow for Render

1. **Authenticate locally first:**
   ```bash
   python3 web_app.py
   # Complete OAuth flow
   # This creates token.pickle
   ```

2. **Convert both files to base64:**
   ```bash
   base64 -i credentials.json > creds_base64.txt
   base64 -i token.pickle > token_base64.txt
   ```

3. **Add to Render environment variables:**
   - `GOOGLE_CREDENTIALS_BASE64` = (from creds_base64.txt)
   - `GOOGLE_TOKEN_BASE64` = (from token_base64.txt)

4. **Deploy** - the app will automatically use the pre-authenticated token!

---

## Troubleshooting

**"could not locate runnable browser":**
- This is expected on Render
- The code will automatically use console authentication
- Check logs for the authorization URL

**"Token expired":**
- Tokens last for a while but can expire
- Re-run local setup and update `GOOGLE_TOKEN_BASE64`
- Or use Method 2 to re-authenticate on Render

**"No token found":**
- Make sure you've added `GOOGLE_TOKEN_BASE64` environment variable
- Or upload `token.pickle` as a file (if Render supports file uploads)

---

**Best Practice:** Use Method 1 (pre-generate token locally) - it's the most reliable! 🎯

