# ⚡ Quick Fix for CSRF Error

If you're seeing the CSRF error, follow these steps **exactly**:

## Step-by-Step Fix

### Step 1: Clean Everything
```bash
cd /Users/maxkantor/Desktop/YoutubeBooster

# Delete token
rm token.pickle

# Kill any running instances
pkill -f web_app.py

# Wait a moment
sleep 2
```

### Step 2: Close Browser Tabs
- **Close ALL browser tabs** (especially Google/OAuth ones)
- **Close the browser completely** (or use Cmd+Q on Mac)
- **Wait 5 seconds**

### Step 3: Start Fresh
```bash
python3 web_app.py
```

### Step 4: Complete OAuth (Important!)
When OAuth starts:
- ✅ Use **ONLY ONE** browser tab/window
- ✅ **Don't refresh** the page
- ✅ **Don't close** the browser
- ✅ **Don't click back** button
- ✅ Let it complete fully
- ✅ Wait for "✅ Authentication successful!" message

### Step 5: Wait for Dashboard
- The app will automatically save the token
- Dashboard should start at http://localhost:5000

---

## Common Mistakes to Avoid

❌ **Don't:**
- Open multiple browser tabs
- Refresh during OAuth
- Close browser during OAuth
- Run the app multiple times at once
- Interrupt the OAuth flow

✅ **Do:**
- Use ONE browser window
- Let OAuth complete fully
- Wait for success message
- Only then close/interrupt

---

## If Error Persists

If you still get CSRF errors after following above:

1. **Clear browser cache:**
   - Chrome: Cmd+Shift+Delete → Clear browsing data
   - Clear cookies for `localhost` and `accounts.google.com`

2. **Use incognito/private window:**
   ```bash
   rm token.pickle
   python3 web_app.py
   # Complete OAuth in incognito window
   ```

3. **Check for multiple instances:**
   ```bash
   ps aux | grep web_app.py
   # Kill any running instances
   pkill -f web_app.py
   ```

---

## Alternative: Use Pre-Generated Token for Deployment

If OAuth keeps failing locally, you can:

1. **Authenticate once successfully** (when it works)
2. **Convert token to base64:**
   ```bash
   base64 -i token.pickle | pbcopy
   ```
3. **Use for Render deployment** (add as `GOOGLE_TOKEN_BASE64`)

This avoids OAuth issues on Render!

---

**The key is: ONE browser tab, don't interrupt, let it finish! 🎯**

