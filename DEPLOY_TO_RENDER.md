# 🚀 Deploy to Render.com (Step-by-Step)

Render.com is the easiest way to deploy your dashboard for free!

## Step 1: Prepare Your Code

1. **Make sure credentials.json is NOT committed:**
   ```bash
   # Check .gitignore includes credentials.json
   cat .gitignore | grep credentials
   ```

2. **Create a GitHub repository** (if you haven't):
   ```bash
   git init
   git add .
   git commit -m "Initial commit - YouTube Booster Dashboard"
   ```
   
   Then push to GitHub:
   - Go to https://github.com/new
   - Create a new repository
   - Follow GitHub's instructions to push your code

## Step 2: Create Render Account

1. Go to: https://render.com
2. Sign up with GitHub (easiest - connects automatically)
3. You'll get a free tier with:
   - 750 hours/month free
   - SSL/HTTPS included
   - Persistent URLs

## Step 3: Deploy on Render

1. **In Render dashboard, click "New" → "Web Service"**

2. **Connect your GitHub repository:**
   - Select the repository you just created
   - Click "Connect"

3. **Configure the service:**
   - **Name:** `youtube-booster` (or any name you like)
   - **Environment:** `Python 3`
   - **Region:** Choose closest to you
   - **Branch:** `main` (or `master`)
   - **Root Directory:** Leave blank (or `./` if needed)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn web_app:app`
   - **Plan:** Free

4. **Add Environment Variables:**
   - Click "Advanced" → "Add Environment Variable"
   - Key: `PYTHON_VERSION`
   - Value: `3.9.6`

5. **Click "Create Web Service"**

## Step 4: Upload Credentials (IMPORTANT!)

Since we can't commit `credentials.json`, you need to add it as an environment variable:

1. **Convert credentials.json to base64:**
   ```bash
   # On macOS/Linux
   base64 credentials.json
   ```
   Copy the output

2. **In Render dashboard:**
   - Go to your service → "Environment"
   - Click "Add Environment Variable"
   - Key: `GOOGLE_CREDENTIALS_BASE64`
   - Value: (paste the base64 string)
   - Click "Save Changes"

3. **Update web_app.py to load from environment:**
   (I'll create an updated version that checks for this)

4. **Or manually upload via Render shell:**
   - Go to your service → "Shell"
   - Upload `credentials.json` file
   - Place it in the project root

## Step 5: Wait for Deployment

- Render will build and deploy your app
- First deployment takes 2-3 minutes
- You'll see logs in real-time

## Step 6: Access Your Dashboard!

Once deployed, your dashboard will be available at:
**https://your-app-name.onrender.com**

🎉 **You can now access it from anywhere!**

---

## Important Notes

### Security:
- ⚠️ **Your dashboard will be PUBLIC** - anyone with the URL can access it
- Consider adding authentication before deploying

### Credentials:
- Never commit `credentials.json` or `token.pickle`
- Use environment variables or Render's secret management

### First Run:
- On first access, you'll need to authenticate with Google
- The token will be stored on Render's server
- Future visits won't require re-authentication

### Updating:
- Push changes to GitHub
- Render will automatically redeploy
- Or manually trigger deployment in Render dashboard

---

## Troubleshooting

**"Module not found" errors:**
- Check `requirements.txt` includes all dependencies
- Check build logs in Render dashboard

**"Credentials not found":**
- Make sure you uploaded `credentials.json`
- Check it's in the project root directory
- Verify environment variables if using that method

**App crashes:**
- Check logs in Render dashboard
- Make sure port is set correctly (Render uses `$PORT` env var)
- Check that `gunicorn` is in requirements.txt

---

## Quick Deploy Checklist

- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] Web service created and connected to repo
- [ ] Environment variables set
- [ ] credentials.json uploaded (via shell or env var)
- [ ] First deployment successful
- [ ] Dashboard accessible at your URL

---

**Need help?** Check Render's docs: https://render.com/docs

