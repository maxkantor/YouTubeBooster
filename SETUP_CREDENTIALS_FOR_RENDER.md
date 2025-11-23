# 🔐 Setting Up Credentials for Render (Free Method)

Since Render Shell is not free, here's how to upload your credentials **for free** using environment variables:

## Method 1: Base64 Environment Variable (Easiest - Already Supported!)

Your `web_app.py` already supports loading credentials from an environment variable. Here's how:

### Step 1: Convert credentials.json to Base64

On your Mac/Linux terminal:

```bash
cd /Users/maxkantor/Desktop/YoutubeBooster
base64 -i credentials.json
```

**Copy the entire output** (it will be a long string like `ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAg...`)

### Step 2: Add to Render

1. Go to your Render dashboard: https://dashboard.render.com
2. Click on your web service
3. Go to "Environment" tab (left sidebar)
4. Click "Add Environment Variable"
5. Add:
   - **Key:** `GOOGLE_CREDENTIALS_BASE64`
   - **Value:** (paste the base64 string you copied)
6. Click "Save Changes"

### Step 3: Redeploy

Render will automatically redeploy when you save environment variables. Or click:
- "Manual Deploy" → "Deploy latest commit"

### Step 4: Verify

Your app will now automatically:
- Read the `GOOGLE_CREDENTIALS_BASE64` variable
- Decode it to recreate `credentials.json`
- Use it for authentication

✅ **Done! No shell access needed!**

---

## Method 2: Individual Environment Variables (If Method 1 Doesn't Work)

If base64 doesn't work, extract individual values:

1. **Open credentials.json:**
   ```bash
   cat credentials.json
   ```

2. **Add these environment variables in Render:**
   - `GOOGLE_CLIENT_ID` = (value of "client_id" from JSON)
   - `GOOGLE_CLIENT_SECRET` = (value of "client_secret" from JSON)
   - `GOOGLE_PROJECT_ID` = (value of "project_id" from JSON)
   - etc.

3. **Update code** to read from these variables (I can help with this)

But **Method 1 should work** since the code already supports it!

---

## Method 3: Alternative Free Hosting (If Render Doesn't Work)

If you prefer a different free option:

### Railway.app (Free tier with shell access)
- Sign up: https://railway.app
- Free tier includes shell access
- Follow similar deployment steps

### Fly.io (Free tier with shell access)
- Sign up: https://fly.io
- Free tier includes shell access
- Global deployment

### PythonAnywhere (Free tier)
- Sign up: https://www.pythonanywhere.com
- Free tier with file upload via web interface
- No shell needed - upload files directly

---

## Quick Command Reference

```bash
# Convert to base64
base64 -i credentials.json | pbcopy  # macOS (copies to clipboard)

# View base64 (for verification)
base64 -i credentials.json

# Decode base64 (to verify it worked)
echo "YOUR_BASE64_STRING" | base64 -d
```

---

## Troubleshooting

**"Credentials not found" error:**
- Make sure you copied the ENTIRE base64 string (it's very long)
- Check for line breaks - the string should be on one line
- Verify the environment variable is named exactly: `GOOGLE_CREDENTIALS_BASE64`
- Check Render logs to see if the variable is being read

**"Invalid credentials" error:**
- Verify your base64 string decodes correctly:
  ```bash
  echo "YOUR_BASE64_STRING" | base64 -d | python3 -m json.tool
  ```
- Should show valid JSON

**Still having issues?**
- Try Method 2 (individual environment variables)
- Or use Railway/Fly.io which have free shell access
- Or use PythonAnywhere which has web-based file upload

---

**Method 1 (base64) is the easiest and already supported by your code!** 🎉

