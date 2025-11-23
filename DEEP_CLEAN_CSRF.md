# 🔧 Deep Clean for Persistent CSRF Errors

If you're **still** getting CSRF errors after basic cleanup, try this deeper fix:

## Complete Cleanup Process

### Step 1: Stop Everything
```bash
cd /Users/maxkantor/Desktop/YoutubeBooster

# Kill all Python processes related to your app
pkill -f web_app.py
pkill -f "python.*youtube"
pkill -f gunicorn

# Wait a moment
sleep 3
```

### Step 2: Delete All Token/Cache Files
```bash
# Delete token file
rm -f token.pickle

# Clean Python cache
find . -name "*.pyc" -delete
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

# Clean any temporary files
rm -rf .pytest_cache
rm -rf *.log
```

### Step 3: Clear Browser Completely

**On macOS:**

1. **Close ALL browser windows** (Cmd+Q)
2. **Clear browser cache:**
   - Safari: Safari → Settings → Privacy → Manage Website Data → Remove All
   - Chrome: Chrome → Clear Browsing Data → Cookies and Cached Images → Clear
   - Firefox: Firefox → Settings → Privacy → Clear Data → Cookies and Cache

3. **Or use incognito/private mode** (easiest):
   - Safari: File → New Private Window (Cmd+Shift+N)
   - Chrome: File → New Incognito Window (Cmd+Shift+N)
   - Firefox: File → New Private Window (Cmd+Shift+N)

### Step 4: Start Fresh in Incognito Mode

```bash
# Make sure everything is clean
rm -f token.pickle

# Start the app
python3 web_app.py
```

**Then:**
- When browser opens (or URL shows), use an **incognito/private window**
- Complete OAuth in that ONE incognito window
- Don't switch tabs or windows
- Wait for completion

---

## Alternative: Use a Different Port

Sometimes port conflicts cause issues. Try:

```bash
# Edit web_app.py and change port from 5000 to something else like 5001
# Or set environment variable:
export PORT=5001
python3 web_app.py
```

---

## Nuclear Option: Re-authenticate from Scratch

If nothing works:

1. **Delete credentials.json temporarily:**
   ```bash
   mv credentials.json credentials.json.backup
   ```

2. **Go to Google Cloud Console:**
   - https://console.cloud.google.com/
   - Create NEW OAuth credentials
   - Download new credentials.json

3. **Replace the file:**
   ```bash
   mv credentials.json.backup credentials.json
   # Or keep new one
   ```

4. **Try OAuth again with new credentials**

---

## Why This Might Be Happening

The CSRF error persists because:
- Browser cached the OAuth state
- Multiple OAuth flows happening simultaneously
- Cookies/session data conflicting
- Port being reused with old state

---

## Best Practice: Use Incognito Mode

**For OAuth, always use incognito/private mode:**
- No cached cookies
- No cached state
- Fresh session every time
- Avoids most CSRF issues

---

## After Successful OAuth

Once OAuth succeeds:
1. **Token will be saved** as `token.pickle`
2. **Future runs won't need OAuth** (until token expires)
3. **For Render deployment**, convert token to base64:
   ```bash
   base64 -i token.pickle | pbcopy
   ```

---

**Try incognito mode first - it's usually the quickest fix! 🎯**

