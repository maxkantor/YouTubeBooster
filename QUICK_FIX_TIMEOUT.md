# ⚡ Fix: API Timeout Error

If you're seeing "Request timed out", the API call is taking too long. Here's how to fix it:

## Quick Fix

### Option 1: Check Terminal Logs

Look at the terminal where you ran `python3 web_app.py`. You should see progress messages:
- "📊 Starting channel analysis..."
- "📍 Looking up channel ID..."
- "📈 Analyzing channel..."

**Where does it stop?** That tells us what's hanging.

### Option 2: Reduce Video Count

The code now fetches 25 videos instead of 50 for faster loading. This should help!

### Option 3: Skip Analytics API

If Analytics API is causing timeout, the code will skip it and still show video data.

### Option 4: Test Channel ID Manually

Try providing channel ID directly:

```bash
# In browser console or via API:
http://localhost:5001/api/channel/analyze?channel_id=YOUR_CHANNEL_ID&days=7
```

---

## Common Causes

1. **Large channel** - Many videos take longer to fetch
2. **Analytics API quota** - Rate limiting
3. **Network issues** - Slow connection to YouTube API
4. **First-time fetch** - Caching helps subsequent calls

---

## Debugging

1. **Check terminal logs:**
   ```bash
   # Where does it hang? Look for last printed message
   ```

2. **Try smaller time period:**
   ```
   http://localhost:5001/api/channel/analyze?days=7
   ```

3. **Skip analytics (just get videos):**
   ```
   http://localhost:5001/api/channel/videos
   ```

4. **Check browser console** (F12 → Console) for errors

---

## Quick Test

Try this to see if basic API works:

```bash
# Test if API client works
python3 -c "from youtube_booster.api_client import YouTubeAPIClient; c = YouTubeAPIClient(); print('Channel:', c.get_channel_id())"
```

---

**Most likely:** The Analytics API call is slow or timing out. The code will skip it and still show video data!

