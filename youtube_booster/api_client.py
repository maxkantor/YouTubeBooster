"""YouTube API client for authentication and data retrieval."""

import os
import pickle
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
]


class YouTubeAPIClient:
    """Client for interacting with YouTube Data API and Analytics API."""
    
    def __init__(self, credentials_file='credentials.json', token_file='token.pickle'):
        """Initialize the YouTube API client.
        
        Args:
            credentials_file: Path to OAuth 2.0 credentials JSON file
            token_file: Path to store authentication token
        """
        self.credentials_file = credentials_file
        self.token_file = token_file
        self.youtube_data = None
        self.youtube_analytics = None
        self.creds = self._authenticate()
        
    def _authenticate(self):
        """Authenticate and get credentials."""
        creds = None
        
        # Load existing token
        if os.path.exists(self.token_file):
            with open(self.token_file, 'rb') as token:
                creds = pickle.load(token)
        
        # If no valid credentials, get new ones
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(self.credentials_file):
                    raise FileNotFoundError(
                        f"Credentials file '{self.credentials_file}' not found. "
                        "Please download it from Google Cloud Console and save it as 'credentials.json'"
                    )
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, SCOPES)
                creds = flow.run_local_server(port=0)
            
            # Save credentials for next run
            with open(self.token_file, 'wb') as token:
                pickle.dump(creds, token)
        
        # Build API services
        self.youtube_data = build('youtube', 'v3', credentials=creds)
        self.youtube_analytics = build('youtubeAnalytics', 'v2', credentials=creds)
        
        return creds
    
    def get_channel_id(self, channel_handle=None, channel_url=None):
        """Get channel ID from channel handle, username, or URL.
        
        Args:
            channel_handle: Channel handle (e.g., '@maxkantorUSA') or username
            channel_url: Full YouTube channel URL
            
        Returns:
            Channel ID string
        """
        try:
            # First, try to get authenticated user's channel if no specific channel requested
            if not channel_handle and not channel_url:
                try:
                    request = self.youtube_data.channels().list(
                        part='id,snippet',
                        mine=True
                    )
                    response = request.execute()
                    
                    if response['items']:
                        channel_info = response['items'][0]
                        print(f"✅ Found your channel: {channel_info['snippet']['title']} ({channel_info['id']})")
                        return channel_info['id']
                except Exception:
                    pass  # Will try other methods below
            
            # Extract channel ID from URL if provided
            if channel_url:
                import re
                # Handle different URL formats
                patterns = [
                    r'youtube\.com/channel/([a-zA-Z0-9_-]+)',  # Direct channel ID
                    r'youtube\.com/@([a-zA-Z0-9_-]+)',        # Handle format
                    r'youtube\.com/c/([a-zA-Z0-9_-]+)',       # Custom URL
                    r'youtube\.com/user/([a-zA-Z0-9_-]+)'     # Username
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, channel_url)
                    if match:
                        channel_id_or_handle = match.group(1)
                        # If it looks like a channel ID (long string starting with UC)
                        if len(channel_id_or_handle) > 20 or channel_id_or_handle.startswith('UC'):
                            # Try to get channel info to verify
                            try:
                                request = self.youtube_data.channels().list(
                                    part='id,snippet',
                                    id=channel_id_or_handle
                                )
                                response = request.execute()
                                if response['items']:
                                    print(f"✅ Found channel: {response['items'][0]['snippet']['title']}")
                                    return response['items'][0]['id']
                            except:
                                pass
                        # Otherwise treat as handle
                        channel_handle = '@' + channel_id_or_handle
                        break
            
            if channel_handle:
                # Remove @ if present for some methods
                clean_handle = channel_handle.lstrip('@')
                
                # Try method 1: Direct channel list by custom URL
                if channel_handle.startswith('@'):
                    # Try to search and find exact match
                    request = self.youtube_data.search().list(
                        part='snippet',
                        q=channel_handle,
                        type='channel',
                        maxResults=10  # Get more results to find exact match
                    )
                    response = request.execute()
                    
                    if response['items']:
                        # Look for exact handle match
                        for item in response['items']:
                            channel_snippet = item['snippet']
                            # Check if the customUrl matches
                            custom_url = channel_snippet.get('customUrl', '')
                            if custom_url and clean_handle.lower() in custom_url.lower():
                                print(f"✅ Found channel: {channel_snippet['title']}")
                                return channel_snippet['channelId']
                        
                        # If no exact match, return first result
                        print(f"✅ Found channel (using search): {response['items'][0]['snippet']['title']}")
                        return response['items'][0]['snippet']['channelId']
                
                # Try method 2: Username lookup (for older channels)
                try:
                    request = self.youtube_data.channels().list(
                        part='id,snippet',
                        forUsername=clean_handle
                    )
                    response = request.execute()
                    
                    if response['items']:
                        print(f"✅ Found channel: {response['items'][0]['snippet']['title']}")
                        return response['items'][0]['id']
                except:
                    pass
                
                # If we get here, channel not found
                error_msg = (
                    f"❌ Channel '{channel_handle}' not found.\n\n"
                    f"💡 To find your channel ID:\n"
                    f"1. Go to your YouTube channel page\n"
                    f"2. Look at the URL - it should look like:\n"
                    f"   - youtube.com/channel/CHANNEL_ID_HERE (use the CHANNEL_ID)\n"
                    f"   - youtube.com/@yourhandle (use the full URL)\n"
                    f"3. Or run: python3 -c \"from youtube_booster.api_client import YouTubeAPIClient; c = YouTubeAPIClient(); print(c.get_channel_id())\""
                )
                raise ValueError(error_msg)
            else:
                # Final fallback: try authenticated user
                request = self.youtube_data.channels().list(
                    part='id,snippet',
                    mine=True
                )
                response = request.execute()
                
                if response['items']:
                    channel_info = response['items'][0]
                    print(f"✅ Using your authenticated channel: {channel_info['snippet']['title']}")
                    return channel_info['id']
                else:
                    raise ValueError(
                        "❌ Could not determine channel ID.\n\n"
                        "💡 Please provide your channel ID or URL:\n"
                        "- Channel ID: UCxxxxx... (from youtube.com/channel/UCxxxxx)\n"
                        "- Channel URL: https://www.youtube.com/@maxkantorUSA"
                    )
        except HttpError as e:
            raise Exception(f"Error getting channel ID: {e}")
        except ValueError:
            raise  # Re-raise ValueError as-is
        except Exception as e:
            raise Exception(f"Unexpected error getting channel ID: {e}")
    
    def get_channel_stats(self, channel_id):
        """Get channel statistics.
        
        Args:
            channel_id: YouTube channel ID
            
        Returns:
            Dictionary with channel statistics
        """
        try:
            request = self.youtube_data.channels().list(
                part='statistics,snippet',
                id=channel_id
            )
            response = request.execute()
            
            if not response['items']:
                raise ValueError(f"Channel {channel_id} not found")
            
            channel = response['items'][0]
            return {
                'channel_id': channel_id,
                'title': channel['snippet']['title'],
                'subscriber_count': int(channel['statistics'].get('subscriberCount', 0)),
                'video_count': int(channel['statistics'].get('videoCount', 0)),
                'view_count': int(channel['statistics'].get('viewCount', 0))
            }
        except HttpError as e:
            raise Exception(f"Error getting channel stats: {e}")
    
    def get_videos(self, channel_id, max_results=50):
        """Get videos from a channel.
        
        Args:
            channel_id: YouTube channel ID
            max_results: Maximum number of videos to retrieve
            
        Returns:
            List of video dictionaries
        """
        try:
            # First, get the uploads playlist ID
            request = self.youtube_data.channels().list(
                part='contentDetails',
                id=channel_id
            )
            response = request.execute()
            
            if not response['items']:
                raise ValueError(f"Channel {channel_id} not found")
            
            uploads_playlist_id = response['items'][0]['contentDetails']['relatedPlaylists']['uploads']
            
            # Get videos from uploads playlist
            videos = []
            next_page_token = None
            
            while len(videos) < max_results:
                request = self.youtube_data.playlistItems().list(
                    part='snippet,contentDetails',
                    playlistId=uploads_playlist_id,
                    maxResults=min(50, max_results - len(videos)),
                    pageToken=next_page_token
                )
                response = request.execute()
                
                video_ids = [item['contentDetails']['videoId'] for item in response['items']]
                
                # Get detailed video information
                if video_ids:
                    video_request = self.youtube_data.videos().list(
                        part='snippet,statistics,contentDetails',
                        id=','.join(video_ids)
                    )
                    video_response = video_request.execute()
                    
                    for video in video_response['items']:
                        videos.append({
                            'video_id': video['id'],
                            'title': video['snippet']['title'],
                            'description': video['snippet']['description'],
                            'published_at': video['snippet']['publishedAt'],
                            'view_count': int(video['statistics'].get('viewCount', 0)),
                            'like_count': int(video['statistics'].get('likeCount', 0)),
                            'comment_count': int(video['statistics'].get('commentCount', 0)),
                            'duration': video['contentDetails']['duration'],
                            'tags': video['snippet'].get('tags', [])
                        })
                
                next_page_token = response.get('nextPageToken')
                if not next_page_token:
                    break
            
            return videos[:max_results]
        except HttpError as e:
            raise Exception(f"Error getting videos: {e}")
    
    def get_analytics(self, channel_id, start_date, end_date, metrics='views,estimatedMinutesWatched,subscribersGained'):
        """Get YouTube Analytics data.
        
        Args:
            channel_id: YouTube channel ID
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format
            metrics: Comma-separated list of metrics
            
        Returns:
            Dictionary with analytics data
        """
        try:
            request = self.youtube_analytics.reports().query(
                ids=f'channel=={channel_id}',
                startDate=start_date,
                endDate=end_date,
                metrics=metrics,
                dimensions='day'
            )
            response = request.execute()
            
            return {
                'rows': response.get('rows', []),
                'columnHeaders': response.get('columnHeaders', [])
            }
        except HttpError as e:
            raise Exception(f"Error getting analytics: {e}")

