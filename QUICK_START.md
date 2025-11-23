# Quick Start Guide 🚀

## Installation

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Set up YouTube API credentials:**

   a. Go to [Google Cloud Console](https://console.cloud.google.com/)
   
   b. Create a new project or select an existing one
   
   c. Enable the following APIs:
      - YouTube Data API v3
      - YouTube Analytics API
   
   d. Create OAuth 2.0 credentials:
      - Go to "APIs & Services" > "Credentials"
      - Click "Create Credentials" > "OAuth client ID"
      - Choose "Desktop app" as application type
      - Download the JSON file
   
   e. Save the downloaded file as `credentials.json` in the project root

## Usage

### 1. Analyze Your Channel Performance

Analyze your channel's watch time, engagement, and top-performing content:

```bash
python3 main.py analyze --channel-id YOUR_CHANNEL_ID
```

Or use your channel handle:
```bash
python3 main.py analyze
# It will automatically detect @maxkantorUSA
```

**Output includes:**
- Channel statistics (subscribers, views, videos)
- Top performing videos
- Average engagement rates
- Actionable recommendations

### 2. Optimize Video SEO

Get SEO optimization suggestions for a specific video:

```bash
python3 main.py seo --video-id VIDEO_ID
```

**Output includes:**
- SEO score (0-100)
- Title optimization suggestions
- Description recommendations
- Tag suggestions
- Specific issues to fix

### 3. Get Content Suggestions

Analyze your top-performing videos and get content ideas:

```bash
python3 main.py suggestions --channel-id YOUR_CHANNEL_ID
```

**Output includes:**
- Top performing videos analysis
- Common patterns in successful content
- Content ideas based on your best videos

## Example Workflow

1. **First, analyze your channel:**
```bash
python3 main.py analyze
```

2. **Optimize your best-performing video:**
```bash
python3 main.py seo --video-id VIDEO_ID_FROM_ANALYSIS
```

3. **Get new content ideas:**
```bash
python3 main.py suggestions --top-n 10
```

## Finding Your Channel ID

If you need to find your channel ID:

1. Go to your YouTube channel
2. Look at the URL: `youtube.com/channel/CHANNEL_ID_HERE`
3. Or use your channel handle: `@maxkantorUSA`

The tool can automatically detect your channel using the handle `@maxkantorUSA`.

## Tips for Maximizing Watch Time

1. **Optimize Your Titles**: Use 50-60 characters, include keywords and numbers
2. **Write Detailed Descriptions**: At least 200-300 words with keywords, timestamps, and links
3. **Use Relevant Tags**: 10-15 tags mixing broad and specific keywords
4. **Create Series**: Build content series to increase watch time per viewer
5. **Analyze Retention**: Focus on videos with high retention rates
6. **Post Consistently**: Regular posting helps build subscriber retention

## Troubleshooting

**"command not found: python" or "zsh: command not found: python"**
- On macOS, use `python3` instead of `python`
- All commands in this guide use `python3`

**"credentials.json not found"**
- Make sure you've downloaded and saved the OAuth credentials file

**"Channel not found"**
- Verify your channel ID or handle is correct
- Make sure your channel is public

**"Permission denied"**
- Make sure you've authorized the application during first run
- Check that the required APIs are enabled in Google Cloud Console

## Next Steps

- Run regular analyses to track your growth
- Optimize all your videos' SEO
- Create content based on successful patterns
- Track which optimizations lead to the most growth

Happy growing! 🎉

