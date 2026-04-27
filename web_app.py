#!/usr/bin/env python3
"""Web-based dashboard for YouTube Booster."""

import os
import datetime
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
# Use 5001 as default since macOS AirPlay uses 5000
DEFAULT_PORT = 5001


def find_available_port(preferred_port):
    """Find an available localhost port, starting from preferred_port."""
    import socket
    for port in range(preferred_port, preferred_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    # Fallback to any free port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def ensure_credentials():
    """Ensure credentials.json exists, creating it from env var if needed."""
    if not os.path.exists('credentials.json'):
        # Check if credentials are in environment variable (for deployment)
        import base64
        if os.environ.get('GOOGLE_CREDENTIALS_BASE64'):
            try:
                creds_base64 = os.environ.get('GOOGLE_CREDENTIALS_BASE64')
                creds_json = base64.b64decode(creds_base64).decode('utf-8')
                # Write to file
                with open('credentials.json', 'w') as f:
                    f.write(creds_json)
                print("[OK] Created credentials.json from environment variable")
            except Exception as e:
                print(f"[WARN] Error creating credentials from env var: {e}")
                raise Exception("Could not create credentials.json from GOOGLE_CREDENTIALS_BASE64")


def get_api_client():
    """Get or initialize API client."""
    global api_client
    if api_client is None:
        # Ensure credentials exist before initializing
        ensure_credentials()
        print("[AUTH] Initializing YouTube API client (this may take a moment on first run)...")
        try:
            api_client = YouTubeAPIClient()
            print("[OK] API client initialized successfully")
        except Exception as e:
            print(f"[ERROR] Error initializing API client: {e}")
            raise
    return api_client


@app.route('/')
def index():
    """Main dashboard page."""
    # Cache-buster for static assets (helps on platforms like Elastic Beanstalk where
    # the browser/proxy may keep old JS/CSS after redeploys)
    try:
        js_path = os.path.join(app.root_path, 'static', 'js', 'dashboard.js')
        css_path = os.path.join(app.root_path, 'static', 'css', 'dashboard.css')
        static_version = str(int(max(os.path.getmtime(js_path), os.path.getmtime(css_path))))
    except Exception:
        static_version = str(int(datetime.datetime.now().timestamp()))

    return render_template('dashboard.html', static_version=static_version)


@app.route('/api/channel/analyze')
def analyze_channel():
    """API endpoint to analyze channel."""
    try:
        import traceback
        print("[ANALYZE] Starting channel analysis...")
        
        days = int(request.args.get('days', 30))
        channel_id = request.args.get('channel_id')
        
        print("[LOOKUP] Getting API client...")
        client = get_api_client()
        print("[OK] API client ready")
        
        analyzer = WatchTimeAnalyzer(client)
        
        if channel_id is None:
            print("[LOOKUP] Looking up channel ID...")
            # Try to get authenticated user's channel first
            try:
                channel_id = client.get_channel_id()  # No args = authenticated user
                print(f"[OK] Found channel ID: {channel_id}")
            except Exception as e1:
                print(f"[WARN] Could not get authenticated channel: {e1}")
                # Fallback: try the handle if available
                try:
                    channel_id = client.get_channel_id('@maxkantorcooking')
                    print(f"[OK] Found channel ID via handle: {channel_id}")
                except Exception as e2:
                    error_msg = f'Could not determine channel ID. Error: {str(e1)}'
                    print(f"[ERROR] {error_msg}")
                    return jsonify({'error': error_msg}), 400
        
        if not channel_id:
            return jsonify({'error': 'Could not determine channel ID'}), 400
        
        print(f"[ANALYZE] Analyzing channel {channel_id}...")
        try:
            analysis = analyzer.analyze_channel(channel_id, days=days)
            print("[OK] Analysis complete!")
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"[ERROR] Error during analysis: {e}")
            print(f"Traceback: {error_trace}")
            # Return partial data if available
            raise Exception(f"Analysis failed: {str(e)}")
        
        # Convert to JSON-serializable format
        result = json.loads(json.dumps(analysis, default=str))
        return jsonify(result)
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Error in analyze_channel: {e}")
        print(f"Traceback: {error_trace}")
        return jsonify({'error': str(e), 'traceback': error_trace}), 500


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
            # Try authenticated user's channel first
            try:
                channel_id = client.get_channel_id()
            except Exception:
                # Fallback
                try:
                    channel_id = client.get_channel_id('@maxkantorcooking')
                except Exception as e:
                    return jsonify({'error': f'Could not determine channel ID: {str(e)}'}), 400
        
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
            # Try authenticated user's channel first
            try:
                channel_id = client.get_channel_id()
            except Exception:
                # Fallback
                try:
                    channel_id = client.get_channel_id('@maxkantorcooking')
                except Exception as e:
                    return jsonify({'error': f'Could not determine channel ID: {str(e)}'}), 400
        
        videos = client.get_videos(channel_id, max_results=max_results)
        
        # Convert to JSON-serializable format
        result = json.loads(json.dumps(videos, default=str))
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


RUNNER_DATA_DIR = os.path.join(os.path.dirname(__file__), 'runner_data')
RUNNER_LOG_FILE = os.path.join(RUNNER_DATA_DIR, 'issue_log.jsonl')


def _parse_published_at(timestamp):
    """Parse a YouTube RFC3339 timestamp into a datetime."""
    if not timestamp:
        return None
    try:
        return datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except ValueError:
        return None


def _build_watch_url(video_id):
    """Build the standard watch URL for a YouTube video."""
    return f'https://www.youtube.com/watch?v={video_id}'


def _build_share_text(title, url):
    """Create a simple share-ready message for a video."""
    return f"Check out this video: {title}\n{url}"


def _serialize_video_for_growth(video, reason):
    """Add growth-tool metadata to a video payload."""
    view_count = int(video.get('view_count', 0) or 0)
    like_count = int(video.get('like_count', 0) or 0)
    comment_count = int(video.get('comment_count', 0) or 0)
    engagement_rate = ((like_count + comment_count) / view_count * 100) if view_count else 0.0
    published_at = video.get('published_at')
    published_dt = _parse_published_at(published_at)
    age_days = None
    if published_dt is not None:
        now = datetime.datetime.now(datetime.timezone.utc)
        age_days = max((now - published_dt).days, 0)

    watch_url = _build_watch_url(video['video_id'])
    return {
        'video_id': video['video_id'],
        'title': video['title'],
        'description': video.get('description', ''),
        'published_at': published_at,
        'age_days': age_days,
        'view_count': view_count,
        'like_count': like_count,
        'comment_count': comment_count,
        'engagement_rate': round(engagement_rate, 2),
        'watch_url': watch_url,
        'share_text': _build_share_text(video['title'], watch_url),
        'reason': reason,
    }


@app.route('/api/channel/traffic_tools')
def get_traffic_tools():
    """API endpoint for legitimate traffic-driving tools and ideas."""
    try:
        channel_id = request.args.get('channel_id')

        client = get_api_client()
        suggestions_gen = ContentSuggestions(client)

        if channel_id is None:
            try:
                channel_id = client.get_channel_id()
            except Exception:
                try:
                    channel_id = client.get_channel_id('@maxkantorcooking')
                except Exception as e:
                    return jsonify({'error': f'Could not determine channel ID: {str(e)}'}), 400

        videos = client.get_videos(channel_id, max_results=50)
        if not videos:
            return jsonify({'error': 'No videos found'}), 404

        sorted_by_views = sorted(videos, key=lambda video: video.get('view_count', 0), reverse=True)
        top_performers = [
            _serialize_video_for_growth(
                video,
                'Already a proven winner. Reshare it in community posts, related descriptions, and social posts when the topic is timely.'
            )
            for video in sorted_by_views[:5]
        ]

        recent_cutoff_days = 120
        recent_videos = []
        for video in videos:
            published_dt = _parse_published_at(video.get('published_at'))
            if published_dt is None:
                continue
            age_days = (datetime.datetime.now(datetime.timezone.utc) - published_dt).days
            if age_days <= recent_cutoff_days:
                recent_videos.append(video)

        promotion_pool = recent_videos or videos
        promotion_candidates = sorted(
            promotion_pool,
            key=lambda video: (
                -(((video.get('like_count', 0) or 0) + (video.get('comment_count', 0) or 0)) / max(video.get('view_count', 0) or 0, 1)),
                video.get('view_count', 0),
            )
        )
        promotion_candidates = [
            _serialize_video_for_growth(
                video,
                'Strong engagement suggests this could travel further. Promote it with direct YouTube links, playlists, pinned comments, and social shares.'
            )
            for video in promotion_candidates[:5]
        ]

        follow_up_ideas = suggestions_gen.analyze_top_performers(channel_id, top_n=5)
        series_ideas = suggestions_gen.get_video_series_ideas(channel_id)[:3]

        checklist = [
            {
                'title': 'Share the standard YouTube watch link',
                'details': 'Use the normal watch page for community posts, newsletters, texts, and social posts so viewers watch in the standard YouTube experience.',
            },
            {
                'title': 'Link older winners from new uploads',
                'details': 'Add your strongest related videos in descriptions, pinned comments, end screens, and cards to move real viewers between videos.',
            },
            {
                'title': 'Reshare timely evergreen videos',
                'details': 'Bring back proven videos when the topic becomes relevant again instead of only promoting the newest upload.',
            },
            {
                'title': 'Turn winners into follow-ups',
                'details': 'Publish sequels, deeper dives, and series entries based on your highest-performing topics to capture existing demand.',
            },
            {
                'title': 'Improve click-through before promoting',
                'details': 'Run the SEO optimizer first so the title, description, and tags are stronger before you send more traffic.',
            },
        ]

        result = {
            'promotion_candidates': promotion_candidates,
            'top_performers': top_performers,
            'content_suggestions': follow_up_ideas.get('content_suggestions', []),
            'series_ideas': series_ideas,
            'common_patterns': follow_up_ideas.get('common_patterns', {}),
            'checklist': checklist,
        }
        return jsonify(json.loads(json.dumps(result, default=str)))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/runner/ping')
def runner_ping():
    """Health-check endpoint for the Continuous Runner UI."""
    return jsonify({
        'status': 'ok',
        'ts': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })


@app.route('/api/runner/log_issue', methods=['POST'])
def runner_log_issue():
    """API endpoint to log a runner issue entry."""
    try:
        data = request.get_json(force=True) or {}
        entry = {
            'ts': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'video_id': data.get('video_id', ''),
            'title': data.get('title', ''),
            'desired_speed': data.get('desired_speed'),
            'actual_speed': data.get('actual_speed'),
            'position_seconds': data.get('position_seconds'),
            'note': data.get('note', ''),
            'remote_addr': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', ''),
        }
        os.makedirs(RUNNER_DATA_DIR, exist_ok=True)
        with open(RUNNER_LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry) + '\n')
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("Starting YouTube Booster Web Dashboard")
    print("="*60)
    
    # Check for credentials before starting
    try:
        ensure_credentials()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        print("\nOptions:")
        print("   1. Make sure credentials.json exists in this folder")
        print("   2. Or set GOOGLE_CREDENTIALS_BASE64 environment variable")
        print("   3. For deployment, add GOOGLE_CREDENTIALS_BASE64 in Render dashboard")
        print("\n" + "="*60 + "\n")
        exit(1)
    
    env_port = os.environ.get('PORT')
    port = int(env_port) if env_port else find_available_port(DEFAULT_PORT)

    print("\nDashboard will be available at:")
    print(f"   http://localhost:{port}")
    print("\nOpen this URL in your browser to view your analytics!")
    print("\n" + "="*60 + "\n")
    
    # Use 0.0.0.0 to allow external connections (for deployment)
    # Set debug=False for production
    debug_mode = os.environ.get('FLASK_ENV') != 'production'
    # Auto-open browser unless disabled
    if os.environ.get('AUTO_OPEN', '1') != '0':
        # Avoid double-open when Flask reloader starts
        if not debug_mode or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
            import threading
            import webbrowser
            threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    app.run(debug=debug_mode, host='0.0.0.0', port=port)

