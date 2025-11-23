# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### ❌ "Credentials file 'credentials.json' not found"

This error means the app can't find your Google API credentials. Here's how to fix it:

#### **If running locally:**

1. **Check if credentials.json exists:**
   ```bash
   ls -la credentials.json
   ```

2. **If it doesn't exist:**
   - Go to https://console.cloud.google.com/
   - Create/download OAuth credentials
   - Save as `credentials.json` in the project folder

3. **Make sure you're in the right directory:**
   ```bash
   cd /Users/maxkantor/Desktop/YoutubeBooster
   python3 web_app.py
   ```

#### **If deploying to Render:**

1. **Convert credentials to base64:**
   ```bash
   base64 -i credentials.json
   ```
   Copy the entire output

2. **Add to Render environment variables:**
   - Go to Render dashboard → Your service → Environment
   - Add: `GOOGLE_CREDENTIALS_BASE64` = (paste base64 string)
   - Save

3. **The code will automatically:**
   - Read the environment variable
   - Create `credentials.json` from it
   - Use it for authentication

4. **Redeploy** after adding the environment variable

#### **Verify it's working:**

```bash
# Check if credentials.json exists
ls -la credentials.json

# Test the base64 decode (if using env var)
python3 -c "import os, base64; print('Env var exists' if os.environ.get('GOOGLE_CREDENTIALS_BASE64') else 'Not set')"
```

---

### ❌ "Channel not found"

See the channel lookup fixes in the main documentation. Try:

```bash
python3 find_channel_id.py
```

---

### ❌ "Module not found" errors

Install missing dependencies:

```bash
python3 -m pip install -r requirements.txt
```

---

### ❌ "Port already in use"

Another process is using port 5000. Either:

1. **Kill the other process:**
   ```bash
   lsof -ti:5000 | xargs kill
   ```

2. **Or change the port** in `web_app.py`:
   ```python
   PORT = int(os.environ.get('PORT', 8080))  # Use 8080 instead
   ```

---

### ❌ Dashboard loads but shows errors

1. **Check browser console** (F12 → Console tab)
2. **Check server logs** in terminal
3. **Verify authentication:**
   - Make sure you completed OAuth flow
   - Check that `token.pickle` exists (for local runs)

---

### ❌ "App is currently being tested" (OAuth error)

You need to add yourself as a test user:

1. Go to https://console.cloud.google.com/
2. APIs & Services → OAuth consent screen
3. Scroll to "Test users"
4. Click "+ ADD USERS"
5. Add your Google account email
6. Try again

See `OAUTH_SETUP_FIX.md` for details.

---

## Still Having Issues?

1. **Check the logs:**
   - Local: Look at terminal output
   - Render: Check "Logs" tab in dashboard

2. **Verify file structure:**
   ```bash
   ls -la
   # Should see: credentials.json, web_app.py, youtube_booster/, etc.
   ```

3. **Test API connection:**
   ```bash
   python3 -c "from youtube_booster.api_client import YouTubeAPIClient; c = YouTubeAPIClient(); print('✅ API connection works!')"
   ```

4. **Check Python version:**
   ```bash
   python3 --version
   # Should be 3.8 or higher
   ```

---

## Quick Diagnostic Commands

```bash
# Check if credentials exist
ls -la credentials.json

# Check if dependencies are installed
python3 -c "import flask; print('Flask OK')"

# Test API client
python3 find_channel_id.py

# Check environment variables (for deployment)
env | grep GOOGLE
```

---

Need more help? Check the main documentation files or create an issue!

