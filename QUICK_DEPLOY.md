# ⚡ Quick Deploy Guide

## Fastest Option: ngrok (5 minutes)

Perfect for quick testing or temporary access from anywhere:

```bash
# Terminal 1: Start your app
python3 web_app.py

# Terminal 2: Start ngrok
ngrok http 5000
```

You'll get a public URL like: `https://abc123.ngrok.io`

**Pros:**
- ✅ Instant
- ✅ Free
- ✅ No setup needed

**Cons:**
- ❌ URL changes each time
- ❌ Not permanent

---

## Best Free Option: Render.com (15 minutes)

### 1. Push to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
# Create repo on GitHub, then:
git remote add origin YOUR_REPO_URL
git push -u origin main
```

### 2. Deploy on Render:
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your repo
5. Settings:
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn web_app:app`
   - Plan: Free
6. Add env var: `PYTHON_VERSION=3.9.6`
7. Click "Create"

### 3. Upload credentials:
- Go to Shell in Render dashboard
- Upload `credentials.json` file

**Done!** Your app is live at: `https://your-app.onrender.com`

See `DEPLOY_TO_RENDER.md` for detailed steps.

---

## All Options:

1. **ngrok** - Instant, temporary (this guide)
2. **Render.com** - Free, permanent (recommended) ⭐
3. **Railway** - Free, easy
4. **Fly.io** - Free, global
5. **PythonAnywhere** - Free Python hosting

See `DEPLOYMENT.md` for all options.

