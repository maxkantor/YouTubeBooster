# ✅ Render Deployment Checklist

Your code is on GitHub! Now let's deploy to Render.

## Quick Steps:

### 1. Prepare Your Credentials (2 minutes)

Open your terminal and run:

```bash
cd /Users/maxkantor/Desktop/YoutubeBooster

# Convert credentials to base64
base64 -i credentials.json | pbcopy  # macOS - copies to clipboard
# OR just display it:
base64 -i credentials.json
# Copy the ENTIRE output (it's a long string)

# Convert token to base64
base64 -i token.pickle | pbcopy  # macOS
# OR just display it:
base64 -i token.pickle
# Copy the ENTIRE output
```

📋 **Keep these copied** - you'll paste them into Render!

---

### 2. Create Render Account & Deploy (5 minutes)

1. **Go to:** https://render.com
2. **Sign up** with GitHub (recommended - connects automatically)

3. **Click:** "New" → "Web Service"

4. **Connect your repository:**
   - Click "Connect GitHub" 
   - Authorize Render
   - Find and select: `maxkantor/YouTubeBooster`

5. **Configure settings:**

   **Name:** `youtube-booster` (or any name you like)

   **Settings:**
   - Environment: `Python 3`
   - Region: `Oregon` (or closest to you)
   - Branch: `main`
   - Root Directory: (leave blank)

   **Build & Deploy:**
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn web_app:app`

   **Plan:**
   - Select: `Free`

6. **Add Environment Variables** (Click "Advanced"):

   **Variable 1:**
   - Key: `PYTHON_VERSION`
   - Value: `3.9.6`
   - Click "Save"

   **Variable 2:**
   - Key: `GOOGLE_CREDENTIALS_BASE64`
   - Value: (paste the base64 string from credentials.json)
   - Click "Save"

   **Variable 3:**
   - Key: `GOOGLE_TOKEN_BASE64`
   - Value: (paste the base64 string from token.pickle)
   - Click "Save"

7. **Click:** "Create Web Service"

---

### 3. Wait for Deployment (2-3 minutes)

- Watch the logs build in real-time
- Build will take ~2 minutes
- First deployment takes longer

---

### 4. Access Your Dashboard! 🎉

Once deployment succeeds, your dashboard will be live at:
**https://youtube-booster.onrender.com** (or similar)

Click the link or copy the URL from Render dashboard!

---

## ✅ Verification Checklist

- [ ] Code pushed to GitHub ✅ (Done!)
- [ ] Render account created
- [ ] Repository connected
- [ ] Environment variables added (PYTHON_VERSION, GOOGLE_CREDENTIALS_BASE64, GOOGLE_TOKEN_BASE64)
- [ ] Service created and deploying
- [ ] Build succeeded
- [ ] Dashboard accessible at Render URL

---

## 🚨 Troubleshooting

**Build fails:**
- Check that `gunicorn` is in `requirements.txt` ✅ (It is!)
- Check logs in Render dashboard

**"Credentials not found":**
- Make sure you copied the ENTIRE base64 string (very long, no line breaks)
- Verify `GOOGLE_CREDENTIALS_BASE64` is set correctly

**Dashboard loads but errors:**
- Check Render logs
- Verify `GOOGLE_TOKEN_BASE64` is set
- Token might need to be regenerated if expired

**Need to update:**
- Make changes locally
- `git add . && git commit -m "message" && git push`
- Render auto-deploys!

---

## 📝 Quick Commands Reference

```bash
# Convert credentials (macOS)
base64 -i credentials.json | pbcopy

# Convert token (macOS)
base64 -i token.pickle | pbcopy

# Push updates
git add .
git commit -m "Update description"
git push
```

---

**Ready to deploy? Go to:** https://render.com 🚀

