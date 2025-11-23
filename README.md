# YouTube Booster 🚀

A legitimate tool to help grow your YouTube channel's watch time through data-driven insights, SEO optimization, and content strategy.

## Features

- **Analytics Dashboard**: Track watch time, retention, and engagement metrics
- **SEO Optimizer**: Optimize titles, descriptions, and tags for better discoverability
- **Content Analyzer**: Identify your best-performing videos and what makes them successful
- **Engagement Insights**: Analyze audience retention patterns and optimize content structure
- **Trending Topics**: Discover trending topics in your niche
- **Content Suggestions**: Get data-driven recommendations for new content

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up YouTube API credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable YouTube Data API v3 and YouTube Analytics API
   - Create credentials (OAuth 2.0 Client ID)
   - Download the credentials and save as `credentials.json`

3. Run the application:
```bash
python3 main.py
```

## Usage

### 🌐 Web Dashboard (Recommended - Beautiful UI!)

For the best visual experience, use the web-based dashboard:

```bash
python3 web_app.py
```

Then open your browser to: **http://localhost:5000**

The dashboard includes:
- 📊 Beautiful, interactive UI with charts
- 📈 Real-time analytics visualization
- 📹 Top performing videos display
- 🔍 SEO optimization tools
- 💡 Content suggestions and ideas

### 📝 Command Line Interface

### Analyze Your Channel
```bash
python3 main.py analyze --channel-id YOUR_CHANNEL_ID
```

### Optimize Video Metadata
```bash
python3 main.py seo --video-id VIDEO_ID
```

### Get Content Suggestions
```bash
python3 main.py suggestions --channel-id YOUR_CHANNEL_ID
```

## Disclaimer

This tool helps you legitimately grow your YouTube channel through:
- Better content optimization
- SEO improvements
- Data-driven insights
- Engagement analysis

**This tool does NOT:**
- Generate fake views or watch time
- Use bots or automation to inflate metrics
- Violate YouTube's Terms of Service

All growth is organic and based on improving your actual content quality and discoverability.

