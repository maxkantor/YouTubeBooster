# 🔧 Fix CSRF Error (mismatching_state)

This error happens when the OAuth flow is interrupted or restarted. Here's how to fix it:

## Quick Fix

### Option 1: Delete Token and Re-authenticate (Recommended)

```bash
cd /Users/maxkantor/Desktop/YoutubeBooster

# Delete the existing token
rm token.pickle

# Run again - it will start fresh OAuth flow
python3 web_app.py
```

This will:
- Clear the old/incomplete OAuth session
- Start a fresh authentication flow
- Complete the OAuth process from scratch

---

### Option 2: Clear Browser Cookies

If Option 1 doesn't work:

1. **Clear browser cookies** for `localhost` and `accounts.google.com`
2. **Close all browser tabs** related to the OAuth flow
3. **Delete token.pickle:**
   ```bash
   rm token.pickle
   ```
4. **Run again:**
   ```bash
   python3 web_app.py
   ```

---

### Option 3: Use Incognito/Private Window

1. **Open an incognito/private browser window**
2. **Delete token.pickle:**
   ```bash
   rm token.pickle
   ```
3. **Run the app:**
   ```bash
   python3 web_app.py
   ```
4. **Complete OAuth in the incognito window**

---

## Why This Happens

The CSRF error occurs when:
- ✅ OAuth flow was interrupted (you closed the browser, refreshed, etc.)
- ✅ Multiple OAuth flows happening at the same time
- ✅ Browser cached an old OAuth state
- ✅ Token file exists but OAuth session is incomplete

## Prevention

1. **Don't interrupt the OAuth flow** - let it complete
2. **Don't refresh the page** during authentication
3. **Close other OAuth tabs** before starting a new one
4. **Wait for the flow to complete** before closing the app

---

## For Deployment (Render)

If you're deploying to Render and getting this error:

1. **Pre-authenticate locally first:**
   ```bash
   python3 web_app.py
   # Complete OAuth flow
   ```

2. **Convert token to base64:**
   ```bash
   base64 -i token.pickle
   ```

3. **Add to Render as `GOOGLE_TOKEN_BASE64`**

4. **This avoids OAuth on Render entirely!**

---

## Still Having Issues?

If the error persists:

1. **Check for multiple instances:**
   ```bash
   # Kill any running instances
   pkill -f web_app.py
   ```

2. **Clear everything:**
   ```bash
   rm token.pickle
   rm -rf __pycache__
   ```

3. **Start fresh:**
   ```bash
   python3 web_app.py
   ```

4. **Complete OAuth in ONE browser tab/window**

---

**The quickest fix is usually:** `rm token.pickle` and run again! 🎯

