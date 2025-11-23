# 🚀 Deploy to GitHub & Render Now!

Since your local setup is working, let's deploy it! Follow these steps:

## Step 1: Prepare Your Files for Git

First, make sure sensitive files aren't committed:

```bash
cd /Users/maxkantor/Desktop/YoutubeBooster

# Check what will be committed (should NOT see credentials.json or token.pickle)
git status
```

✅ **Good files to commit:**
- All Python files
- HTML/CSS/JS files
- requirements.txt
- README files
- Configuration files

❌ **Should NOT be committed:**
- credentials.json (handled via env var)
- token.pickle (handled via env var)
- __pycache__/ folders
- .env files

---

## Step 2: Create GitHub Repository

### Option A: Using GitHub Website (Easiest)

1. **Go to:** https://github.com/new

2. **Repository settings:**
   - Repository name: `youtube-booster` (or any name you like)
   - Description: "YouTube channel analytics dashboard"
   - Visibility: **Public** (free) or **Private** (your choice)
   - ✅ Do NOT initialize with README (we already have files)

3. **Click "Create repository"**

4. **Copy the repository URL** (you'll see it on the next page)
   - It will look like: `https://github.com/YOUR_USERNAME/youtube-booster.git`

### Option B: Using GitHub CLI

```bash
# If you have gh CLI installed
gh repo create youtube-booster --public --source=. --remote=origin --push
```

---

## Step 3: Push to GitHub

Run these commands in your terminal:

```bash
cd /Users/maxkantor/Desktop/YoutubeBooster

# Initialize git (if not already done)
git init

# Add all files (except those in .gitignore)
git add .

# Check what will be committed (verify no credentials.json)
git status

# Commit
git commit -m "Initial commit - YouTube Booster Dashboard"

# Add your GitHub repository as remote
# REPLACE YOUR_USERNAME and REPO_NAME with your actual values
git remote add origin https://github.com/YOUR_USERNAME/youtube-booster.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Note:** If asked for credentials:
- Use a Personal Access Token (not password)
- Or use GitHub CLI: `gh auth login`

---

## Step 4: Deploy to Render

### 4.1: Create Render Account

1. **Go to:** https://render.com
2. **Sign up** with GitHub (recommended - connects automatically)
3. **Verify your email** if needed

### 4.2: Create New Web Service

1. **In Render dashboard, click:** "New" → "Web Service"

2. **Connect your repository:**
   - Click "Connect GitHub" or "Connect account"
   - Authorize Render to access your repos
   - Select your `youtube-booster` repository

3. **Configure the service:**

   **Basic Settings:**
   - **Name:** `youtube-booster` (or any name)
   - **Environment:** `Python 3`
   - **Region:** Choose closest to you (e.g., Oregon)
   - **Branch:** `main` (or `master` if that's your branch)

   **Build & Deploy:**
   - **Root Directory:** (leave blank, or use `./`)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn web_app:app`

   **Plan:**
   - **Free** (750 hours/month free)

4. **Add Environment Variables:**

   Click "Advanced" → "Add Environment Variable"

   Add these one by one:

   **Variable 1:**
   - Key: `PYTHON_VERSION`
   - Value: `3.9.6`
   - Click "Save"

   **Variable 2: Credentials (Base64)**
   ```bash
   # In your local terminal, run:
   base64 -i credentials.json
   # Copy the ENTIRE output
   ```
   - Key: `GOOGLE_CREDENTIALS_BASE64`
   - Value: (paste the base64 string you copied)
   - Click "Save"

   **Variable 3: Token (Base64) - Important!**
   ```bash
   # In your local terminal, run:
   base64 -i token.pickle
   # Copy the ENTIRE output
   ```
   - Key: `GOOGLE_TOKEN_BASE64`
   - Value: (paste the base64 string you copied)
   - Click "Save"

5. **Click "Create Web Service"**

### 4.3: Wait for Deployment

- Render will build and deploy (takes 2-3 minutes)
- Watch the logs in real-time
- You'll see build progress

### 4.4: Access Your Dashboard!

Once deployed, your dashboard will be live at:
**https://your-app-name.onrender.com**

🎉 **Your dashboard is now accessible from anywhere!**

---

## Step 5: Verify Everything Works

1. **Open your Render URL** in a browser
2. **Test the dashboard:**
   - Should load without errors
   - Click "Overview" tab
   - Data should load

3. **If there are errors:**
   - Check Render logs (click "Logs" tab in Render dashboard)
   - Common issues:
     - Missing environment variables
     - Invalid base64 strings (make sure you copied the entire string)
     - Port issues (should be handled automatically)

---

## Troubleshooting

### "Build failed"
- Check that `requirements.txt` includes all dependencies
- Check that `gunicorn` is in requirements.txt
- Verify `PYTHON_VERSION` is set

### "Credentials not found"
- Make sure `GOOGLE_CREDENTIALS_BASE64` is set
- Verify you copied the ENTIRE base64 string (it's very long, no line breaks)
- Check logs for decoding errors

### "Token expired"
- The token might have expired
- Re-generate locally: `python3 web_app.py` (complete OAuth)
- Convert new token: `base64 -i token.pickle`
- Update `GOOGLE_TOKEN_BASE64` in Render
- Redeploy

### "Module not found"
- Check that all packages are in `requirements.txt`
- Check build logs to see which module is missing

---

## Quick Commands Reference

```bash
# Convert credentials to base64 (for Render)
base64 -i credentials.json

# Convert token to base64 (for Render)
base64 -i token.pickle

# Check git status
git status

# Push updates to GitHub
git add .
git commit -m "Update description"
git push

# Render will auto-deploy when you push to GitHub!
```

---

## Updating Your Deployment

After making changes:

1. **Make your changes locally**

2. **Test locally:**
   ```bash
   python3 web_app.py
   ```

3. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```

4. **Render auto-deploys!** (or manually trigger in Render dashboard)

---

## Next Steps

✅ Your dashboard is live!
✅ Accessible from anywhere
✅ Updates automatically when you push to GitHub

**Optional:**
- Add a custom domain (in Render dashboard)
- Set up monitoring
- Add authentication (if you want to restrict access)

---

**You're all set! 🎉**

Need help? Check the logs in Render dashboard or see `TROUBLESHOOTING.md`

