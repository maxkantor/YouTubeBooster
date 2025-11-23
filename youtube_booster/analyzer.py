"""Watch time and engagement analyzer."""

import pandas as pd
from datetime import datetime, timedelta, timezone
from typing import List, Dict
from .api_client import YouTubeAPIClient


class WatchTimeAnalyzer:
    """Analyze watch time and identify optimization opportunities."""
    
    def __init__(self, api_client: YouTubeAPIClient):
        """Initialize analyzer with API client.
        
        Args:
            api_client: YouTubeAPIClient instance
        """
        self.api_client = api_client
    
    def analyze_channel(self, channel_id: str = None, days: int = 30) -> Dict:
        """Analyze channel performance over specified time period.
        
        Args:
            channel_id: Channel ID (if None, uses authenticated user's channel)
            days: Number of days to analyze
            
        Returns:
            Dictionary with analysis results
        """
        if channel_id is None:
            channel_id = self.api_client.get_channel_id()
        
        # Get channel stats
        channel_stats = self.api_client.get_channel_stats(channel_id)
        
        # Get analytics data
        now = datetime.now(timezone.utc)
        end_date = now.strftime('%Y-%m-%d')
        start_date = (now - timedelta(days=days)).strftime('%Y-%m-%d')
        
        try:
            analytics = self.api_client.get_analytics(
                channel_id,
                start_date,
                end_date,
                metrics='views,estimatedMinutesWatched,subscribersGained,averageViewDuration,likes,comments'
            )
        except Exception as e:
            print(f"Warning: Could not fetch analytics data: {e}")
            analytics = None
        
        # Get videos
        videos = self.api_client.get_videos(channel_id, max_results=50)
        
        # Analyze video performance
        video_analysis = self._analyze_videos(videos)
        
        return {
            'channel_info': channel_stats,
            'analytics': analytics,
            'videos_analyzed': len(videos),
            'video_performance': video_analysis,
            'recommendations': self._generate_recommendations(videos, video_analysis)
        }
    
    def _analyze_videos(self, videos: List[Dict]) -> Dict:
        """Analyze individual video performance.
        
        Args:
            videos: List of video dictionaries
            
        Returns:
            Dictionary with video analysis metrics
        """
        if not videos:
            return {}
        
        df = pd.DataFrame(videos)
        
        # Calculate engagement rate
        df['engagement_rate'] = (
            (df['like_count'] + df['comment_count']) / df['view_count'].replace(0, 1) * 100
        ).fillna(0)
        
        # Parse duration to seconds
        df['duration_seconds'] = df['duration'].apply(self._parse_duration)
        
        # Calculate views per day (rough estimate)
        df['published_at'] = pd.to_datetime(df['published_at'], utc=True)
        now = datetime.now(timezone.utc)
        days_since_publish = (now - df['published_at']).dt.days.replace(0, 1)
        df['views_per_day'] = df['view_count'] / days_since_publish
        
        # Identify top performers
        top_views = df.nlargest(5, 'view_count')[['title', 'view_count', 'video_id']].to_dict('records')
        top_engagement = df.nlargest(5, 'engagement_rate')[['title', 'engagement_rate', 'video_id']].to_dict('records')
        top_daily = df.nlargest(5, 'views_per_day')[['title', 'views_per_day', 'video_id']].to_dict('records')
        
        return {
            'total_videos': len(df),
            'total_views': df['view_count'].sum(),
            'total_likes': df['like_count'].sum(),
            'avg_views_per_video': df['view_count'].mean(),
            'avg_engagement_rate': df['engagement_rate'].mean(),
            'top_videos_by_views': top_views,
            'top_videos_by_engagement': top_engagement,
            'top_videos_by_daily_views': top_daily,
            'metrics': {
                'avg_duration_seconds': df['duration_seconds'].mean(),
                'median_views': df['view_count'].median(),
                'std_views': df['view_count'].std()
            }
        }
    
    def _parse_duration(self, duration: str) -> int:
        """Parse ISO 8601 duration to seconds.
        
        Args:
            duration: ISO 8601 duration string (e.g., PT4M13S)
            
        Returns:
            Duration in seconds
        """
        import re
        pattern = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')
        match = pattern.match(duration)
        
        if not match:
            return 0
        
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        
        return hours * 3600 + minutes * 60 + seconds
    
    def _generate_recommendations(self, videos: List[Dict], analysis: Dict) -> List[str]:
        """Generate recommendations based on analysis.
        
        Args:
            videos: List of video dictionaries
            analysis: Video analysis results
            
        Returns:
            List of recommendation strings
        """
        recommendations = []
        
        if not videos:
            return recommendations
        
        df = pd.DataFrame(videos)
        
        # Check average engagement rate
        avg_engagement = analysis['avg_engagement_rate']
        if avg_engagement < 2:
            recommendations.append(
                "🔴 Low engagement rate (<2%). Focus on creating more engaging content "
                "and encourage viewers to like and comment."
            )
        elif avg_engagement < 5:
            recommendations.append(
                "🟡 Moderate engagement rate. Try to increase viewer interaction through "
                "call-to-actions and community-focused content."
            )
        else:
            recommendations.append(
                "🟢 Good engagement rate! Keep up the engaging content."
            )
        
        # Check video consistency
        if len(videos) < 10:
            recommendations.append(
                "📹 Build a larger content library. Consistent posting helps build "
                "watch time and subscriber retention."
            )
        
        # Check top performers
        if analysis['top_videos_by_views']:
            top_titles = [v['title'] for v in analysis['top_videos_by_views']]
            recommendations.append(
                f"⭐ Your top performing videos are: {', '.join(top_titles[:3])}. "
                "Consider creating similar content or sequels."
            )
        
        # Check for trends
        df['published_at'] = pd.to_datetime(df['published_at'], utc=True)
        now = datetime.now(timezone.utc)
        recent_videos = df[df['published_at'] > now - timedelta(days=30)]
        if len(recent_videos) > 0:
            recent_avg_views = recent_videos['view_count'].mean()
            overall_avg = df['view_count'].mean()
            
            if recent_avg_views < overall_avg * 0.8:
                recommendations.append(
                    "📉 Recent videos are underperforming. Review your content strategy, "
                    "SEO optimization, and promotion tactics."
                )
            elif recent_avg_views > overall_avg * 1.2:
                recommendations.append(
                    "📈 Recent videos are performing well! Your channel is growing. "
                    "Continue with your current strategy."
                )
        
        return recommendations
    
    def get_video_details(self, video_id: str) -> Dict:
        """Get detailed analysis for a specific video.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Dictionary with video details and recommendations
        """
        videos = self.api_client.get_videos(self.api_client.get_channel_id(), max_results=100)
        
        video = next((v for v in videos if v['video_id'] == video_id), None)
        
        if not video:
            return {'error': f'Video {video_id} not found in channel'}
        
        return {
            'video': video,
            'recommendations': self._get_video_specific_recommendations(video)
        }
    
    def _get_video_specific_recommendations(self, video: Dict) -> List[str]:
        """Get recommendations for a specific video.
        
        Args:
            video: Video dictionary
            
        Returns:
            List of recommendation strings
        """
        recommendations = []
        
        # Title optimization
        title_length = len(video['title'])
        if title_length < 30:
            recommendations.append(
                "📝 Title is too short. Longer, keyword-rich titles (50-60 chars) "
                "perform better for SEO."
            )
        elif title_length > 60:
            recommendations.append(
                "📝 Title might be too long. Consider shortening to 50-60 characters "
                "for better display."
            )
        
        # Description optimization
        desc_length = len(video['description'])
        if desc_length < 200:
            recommendations.append(
                "📄 Description is too short. Add more details, keywords, timestamps, "
                "and links (min 200-300 words for better SEO)."
            )
        
        # Tags
        if not video['tags'] or len(video['tags']) < 10:
            recommendations.append(
                "🏷️ Add more tags (10-15 relevant tags). Use a mix of broad and "
                "specific keywords."
            )
        
        # Engagement
        engagement_rate = ((video['like_count'] + video['comment_count']) / 
                          max(video['view_count'], 1) * 100)
        
        if engagement_rate < 2:
            recommendations.append(
                "💬 Low engagement. Add clear call-to-actions in your video asking "
                "viewers to like, comment, and subscribe."
            )
        
        return recommendations

