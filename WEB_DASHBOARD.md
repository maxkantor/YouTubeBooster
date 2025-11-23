# 🌐 Web Dashboard Guide

## Quick Start

1. **Make sure you have Flask installed:**
```bash
python3 -m pip install flask
```
Or install all requirements:
```bash
python3 -m pip install -r requirements.txt
```

2. **Start the web server:**
```bash
python3 web_app.py
```

3. **Open your browser:**
Go to: **http://localhost:5000**

That's it! 🎉

## What You'll See

The dashboard has 4 main tabs:

### 📊 Overview Tab
- **Channel Statistics**: Subscribers, total views, video count, engagement rate
- **Top Performing Videos**: Your best videos ranked by views
- **Recommendations**: Actionable tips to improve your channel

### 📹 Videos Tab
- List of all your videos
- View counts, likes, comments
- Quick SEO analysis button for each video

### 💡 Suggestions Tab
- Content ideas based on your top performers
- Patterns found in successful videos
- Ideas for your next videos

### 🔍 SEO Optimizer Tab
- Enter a video ID to analyze
- Get SEO score (0-100)
- Title optimization suggestions
- Description improvements
- Tag recommendations

## Features

✅ **Beautiful UI** - Modern, responsive design  
✅ **Real-time Data** - Live analytics from YouTube  
✅ **Interactive** - Click buttons to refresh data  
✅ **Mobile Friendly** - Works on phones and tablets  

## Tips

- The dashboard automatically loads your channel data on startup
- Click "Refresh Videos" or "Get Suggestions" to reload data
- Use the SEO optimizer to improve individual videos
- Bookmark http://localhost:5000 for easy access

## Troubleshooting

**"ModuleNotFoundError: No module named 'flask'"**
- Install Flask: `python3 -m pip install flask`

**"Address already in use"**
- Another process is using port 5000
- Close other Flask apps or change the port in `web_app.py`

**Data not loading**
- Make sure you've authenticated with YouTube API
- Check that your credentials.json is in the project folder

## Stopping the Server

Press `Ctrl+C` in the terminal to stop the web server.

---

Enjoy your beautiful YouTube analytics dashboard! 📈

