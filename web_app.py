#!/usr/bin/env python3
"""Web-based dashboard for YouTube Booster."""

import os
from flask import Flask, render_template, jsonify, request
from youtube_booster.api_client import YouTubeAPIClient
from youtube_booster.analyzer import WatchTimeAnalyzer
from youtube_booster.seo_optimizer import SEOOptimizer
from youtube_booster.suggestions import ContentSuggestions
import json

app = Flask(__name__)

# Global API client (will be initialized on first use)
api_client = None

# Port configuration for deployment
PORT = int(os.environ.get('PORT', 5000))


def get_api_client():
    """Get or initialize API client."""
    global api_client
    if api_client is None:
        # Check if credentials are in environment variable (for deployment)
        import base64
        if os.environ.get('GOOGLE_CREDENTIALS_BASE64'):
            creds_base64 = os.environ.get('GOOGLE_CREDENTIALS_BASE64')
            creds_json = base64.b64decode(creds_base64).decode('utf-8')
            # Write to temporary file
            with open('credentials.json', 'w') as f:
                f.write(creds_json)
        api_client = YouTubeAPIClient()
    return api_client


@app.route('/')
def index():
    """Main dashboard page."""
    return render_template('dashboard.html')


@app.route('/api/channel/analyze')
def analyze_channel():
    """API endpoint to analyze channel."""
    try:
        days = int(request.args.get('days', 30))
        channel_id = request.args.get('channel_id')
        
        client = get_api_client()
        analyzer = WatchTimeAnalyzer(client)
        
        if channel_id is None:
            channel_id = client.get_channel_id('@maxkantorUSA')
        
        if not channel_id:
            return jsonify({'error': 'Could not determine channel ID'}), 400
        
        analysis = analyzer.analyze_channel(channel_id, days=days)
        
        # Convert to JSON-serializable format
        result = json.loads(json.dumps(analysis, default=str))
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/video/seo/<video_id>')
def analyze_video_seo(video_id):
    """API endpoint to analyze video SEO."""
    try:
        client = get_api_client()
        optimizer = SEOOptimizer(client)
        seo_analysis = optimizer.optimize_video(video_id)
        
        # Convert to JSON-serializable format
        result = json.loads(json.dumps(seo_analysis, default=str))
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/channel/suggestions')
def get_suggestions():
    """API endpoint to get content suggestions."""
    try:
        channel_id = request.args.get('channel_id')
        top_n = int(request.args.get('top_n', 5))
        
        client = get_api_client()
        suggestions_gen = ContentSuggestions(client)
        
        if channel_id is None:
            channel_id = client.get_channel_id('@maxkantorUSA')
        
        suggestions = suggestions_gen.analyze_top_performers(channel_id, top_n=top_n)
        
        # Convert to JSON-serializable format
        result = json.loads(json.dumps(suggestions, default=str))
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/channel/videos')
def get_videos():
    """API endpoint to get channel videos."""
    try:
        channel_id = request.args.get('channel_id')
        max_results = int(request.args.get('max_results', 50))
        
        client = get_api_client()
        
        if channel_id is None:
            channel_id = client.get_channel_id('@maxkantorUSA')
        
        videos = client.get_videos(channel_id, max_results=max_results)
        
        # Convert to JSON-serializable format
        result = json.loads(json.dumps(videos, default=str))
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("🌐 Starting YouTube Booster Web Dashboard")
    print("="*60)
    print("\n📍 Dashboard will be available at:")
    print(f"   http://localhost:{PORT}")
    print("\n💡 Open this URL in your browser to view your analytics!")
    print("\n" + "="*60 + "\n")
    
    # Use 0.0.0.0 to allow external connections (for deployment)
    # Set debug=False for production
    debug_mode = os.environ.get('FLASK_ENV') != 'production'
    app.run(debug=debug_mode, host='0.0.0.0', port=PORT)

