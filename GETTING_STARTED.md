# Getting Started with YouTube Booster 📈

Welcome! This tool will help you legitimately grow your YouTube channel **@maxkantorUSA** by providing data-driven insights and optimization recommendations.

## What This Tool Does

✅ **Analyzes your channel performance** - Identifies top-performing videos and patterns  
✅ **Optimizes SEO** - Improves titles, descriptions, and tags for better discoverability  
✅ **Suggests content ideas** - Recommends new content based on your best-performing videos  
✅ **Tracks watch time** - Monitors growth and identifies optimization opportunities  

❌ **What it does NOT do** - This tool does NOT:
- Generate fake views or watch time
- Use bots or automation to inflate metrics
- Violate YouTube's Terms of Service

All growth is **organic** and based on improving your actual content quality.

## First-Time Setup (5 minutes)

### Step 1: Install Python packages
```bash
cd /Users/maxkantor/Desktop/YoutubeBooster
python3 -m pip install -r requirements.txt
```

### Step 2: Get YouTube API credentials

1. Visit: https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable these APIs:
   - YouTube Data API v3
   - YouTube Analytics API
4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: "Desktop app"
   - Name it "YouTube Booster"
   - Click "Create"
   - Click "Download JSON"
5. Save the downloaded file as `credentials.json` in this folder:
   ```bash
   mv ~/Downloads/client_secret_*.json ./credentials.json
   ```

6. **IMPORTANT: Add yourself as a test user**
   - Go to "APIs & Services" > "OAuth consent screen"
   - Scroll down to the **"Test users"** section
   - Click **"+ ADD USERS"**
   - Enter your Google account email (the one linked to @maxkantorUSA)
   - Click **"ADD"**
   - This allows you to use the app while it's in testing mode

### Step 3: Run your first analysis!

**Option 1: Web Dashboard (Recommended - Beautiful UI! 🌐)**

```bash
python3 web_app.py
```

Then open your browser and go to: **http://localhost:5000**

You'll see a beautiful dashboard with:
- 📊 Interactive charts and stats
- 📹 Your top performing videos
- 💡 Personalized recommendations
- 🔍 SEO optimizer
- 💡 Content suggestions

**Option 2: Command Line**

```bash
python3 main.py analyze
```

On first run, it will:
- Open your browser for authentication
- Ask you to log in with your YouTube account
- Request permission to view your channel analytics
- Save authentication token for future runs

## Quick Commands

### Analyze Your Channel
```bash
python3 main.py analyze
# Automatically detects @maxkantorUSA channel
```

### Analyze specific time period
```bash
python3 main.py analyze --days 60
```

### Optimize a video's SEO
```bash
python3 main.py seo --video-id YOUR_VIDEO_ID
```

### Get content suggestions
```bash
python3 main.py suggestions --top-n 10
```

### Save results to file
```bash
python3 main.py analyze --output analysis.json
```

## What to Look For

After running `python3 main.py analyze`, you'll see:

1. **Top Performing Videos** - Which videos get the most views?
2. **Engagement Rate** - How many viewers like/comment? (Goal: >5%)
3. **Recommendations** - Specific actions to improve watch time

## Common Use Cases

### Use Case 1: Weekly Performance Review
```bash
# Every Monday, analyze last 7 days
python3 main.py analyze --days 7 --output weekly_report.json
```

### Use Case 2: Before Publishing a New Video
```bash
# Optimize SEO before uploading
python3 main.py seo --video-id NEW_VIDEO_ID
# Use the suggestions to improve title, description, and tags
```

### Use Case 3: Content Planning
```bash
# Get ideas for next videos
python3 main.py suggestions
# Look at common patterns in your top videos
```

## Tips for Maximum Watch Time Growth

Based on your analysis results:

1. **Double Down on What Works**
   - If "Tutorial" videos perform well, make more tutorials
   - If "Top 10" format works, create more list videos

2. **Optimize Everything**
   - Run SEO optimization on ALL your videos
   - Better discoverability = more views = more watch time

3. **Create Series**
   - If a video performs well, make it part 1 of a series
   - Series increase watch time per viewer

4. **Post Consistently**
   - Regular posting builds subscriber retention
   - Use your top videos' publishing schedule as a guide

5. **Engage Your Audience**
   - Respond to comments
   - Ask for likes/subscribes (increases engagement rate)
   - Create community posts

## Troubleshooting

**Q: "command not found: python" or "zsh: command not found: python"**  
A: On macOS, use `python3` instead of `python`. All commands in this guide use `python3`.  
   If you want to use just `python`, you can create an alias: add `alias python=python3` to your `~/.zshrc` file.

**Q: "credentials.json not found"**  
A: Make sure you downloaded and saved the OAuth credentials file to this folder.

**Q: "Channel not found"**  
A: The tool automatically looks for @maxkantorUSA. Make sure your channel is public.

**Q: "App is currently being tested" or "can only be accessed by developer-approved testers"**  
A: You need to add yourself as a test user in Google Cloud Console:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Click "+ ADD USERS" in the Test users section
   - Add your Google account email
   - See `OAUTH_SETUP_FIX.md` for detailed instructions

**Q: "Permission denied"**  
A: During first run, make sure you authorize all requested permissions in the browser.

**Q: "No videos found"**  
A: Make sure your channel has public videos. Private videos won't be analyzed.

## Next Steps

1. ✅ Run your first analysis: `python3 main.py analyze`
2. ✅ Review the recommendations
3. ✅ Optimize your top 10 videos' SEO
4. ✅ Create 3 new videos based on suggestions
5. ✅ Re-analyze after 30 days to track growth

## Need Help?

- Check `QUICK_START.md` for detailed setup instructions
- Review `README.md` for full documentation
- The tool will show helpful error messages if something goes wrong

Happy growing! 🚀

