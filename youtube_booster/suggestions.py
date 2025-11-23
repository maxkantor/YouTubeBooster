"""Content suggestions and trending topics analyzer."""

import requests
from typing import List, Dict
from .api_client import YouTubeAPIClient
from datetime import datetime, timedelta


class ContentSuggestions:
    """Generate content suggestions based on channel analysis and trends."""
    
    def __init__(self, api_client: YouTubeAPIClient):
        """Initialize content suggestions generator.
        
        Args:
            api_client: YouTubeAPIClient instance
        """
        self.api_client = api_client
    
    def analyze_top_performers(self, channel_id: str = None, top_n: int = 5) -> Dict:
        """Analyze top performing videos to identify successful patterns.
        
        Args:
            channel_id: Channel ID (if None, uses authenticated user's channel)
            top_n: Number of top videos to analyze
            
        Returns:
            Dictionary with analysis and suggestions
        """
        if channel_id is None:
            channel_id = self.api_client.get_channel_id()
        
        videos = self.api_client.get_videos(channel_id, max_results=50)
        
        if not videos:
            return {'error': 'No videos found'}
        
        # Sort by views
        videos_sorted = sorted(videos, key=lambda x: x['view_count'], reverse=True)
        top_videos = videos_sorted[:top_n]
        
        # Extract common patterns
        common_words = self._extract_common_words([v['title'] for v in top_videos])
        common_tags = self._extract_common_tags([v.get('tags', []) for v in top_videos])
        
        # Generate suggestions based on patterns
        suggestions = self._generate_content_ideas(top_videos, common_words, common_tags)
        
        return {
            'top_performers': [
                {
                    'title': v['title'],
                    'views': v['view_count'],
                    'engagement': v['like_count'] + v['comment_count'],
                    'video_id': v['video_id']
                }
                for v in top_videos
            ],
            'common_patterns': {
                'common_words': common_words[:10],
                'common_tags': common_tags[:10]
            },
            'content_suggestions': suggestions
        }
    
    def _extract_common_words(self, titles: List[str]) -> List[str]:
        """Extract common words from titles.
        
        Args:
            titles: List of video titles
            
        Returns:
            List of common words (sorted by frequency)
        """
        import re
        from collections import Counter
        
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 
                     'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 
                     'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 
                     'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
                     'how', 'what', 'when', 'where', 'why', 'who', 'which'}
        
        words = []
        for title in titles:
            title_words = re.findall(r'\b\w+\b', title.lower())
            words.extend([w for w in title_words if w not in stop_words and len(w) > 3])
        
        word_counts = Counter(words)
        return [word for word, count in word_counts.most_common()]
    
    def _extract_common_tags(self, tags_lists: List[List[str]]) -> List[str]:
        """Extract common tags from multiple tag lists.
        
        Args:
            tags_lists: List of tag lists
            
        Returns:
            List of common tags (sorted by frequency)
        """
        from collections import Counter
        
        all_tags = []
        for tags in tags_lists:
            all_tags.extend(tags)
        
        tag_counts = Counter(all_tags)
        return [tag for tag, count in tag_counts.most_common()]
    
    def _generate_content_ideas(self, top_videos: List[Dict], common_words: List[str], 
                               common_tags: List[str]) -> List[str]:
        """Generate content ideas based on top performers.
        
        Args:
            top_videos: List of top performing videos
            common_words: Common words from titles
            common_tags: Common tags
            
        Returns:
            List of content suggestions
        """
        suggestions = []
        
        # Suggestions based on top performers
        if top_videos:
            for video in top_videos[:3]:
                title = video['title']
                suggestions.append(f"Create a sequel or follow-up to: '{title}'")
                suggestions.append(f"Make a detailed tutorial version of: '{title}'")
                suggestions.append(f"Create a 'Part 2' or advanced version of: '{title}'")
        
        # Suggestions based on common patterns
        if common_words:
            main_topics = common_words[:3]
            suggestions.extend([
                f"Create a 'Complete Guide' video about {main_topics[0]}",
                f"Make a 'Top 10 Tips' video combining {main_topics[0]} and {main_topics[1] if len(main_topics) > 1 else 'your niche'}",
                f"Create a beginner-friendly tutorial about {main_topics[0]}"
            ])
        
        # Generic successful formats
        suggestions.extend([
            "Create a 'How I...' personal story video",
            "Make a comparison video: 'X vs Y'",
            "Create a 'Common Mistakes' or 'What NOT to Do' video",
            "Make a 'Behind the Scenes' or 'Day in the Life' video",
            "Create a Q&A or FAQ video addressing viewer questions"
        ])
        
        return suggestions[:10]
    
    def get_trending_keywords(self, query: str = None) -> List[str]:
        """Get trending keywords (placeholder - would use YouTube Trends API if available).
        
        Args:
            query: Optional query to filter trends
            
        Returns:
            List of trending keywords
        """
        # Note: YouTube doesn't provide a public trends API
        # This is a placeholder that suggests using YouTube's search autocomplete
        # In a real implementation, you might scrape autocomplete or use third-party tools
        
        suggestions = [
            "Top trending topics in your niche",
            "Check YouTube search autocomplete for trending keywords",
            "Use Google Trends for related topics",
            "Monitor competitor channels for trending content",
            "Check YouTube's 'Trending' tab for inspiration"
        ]
        
        return suggestions
    
    def get_video_series_ideas(self, channel_id: str = None) -> List[Dict]:
        """Suggest video series ideas based on existing content.
        
        Args:
            channel_id: Channel ID (if None, uses authenticated user's channel)
            
        Returns:
            List of series suggestions
        """
        if channel_id is None:
            channel_id = self.api_client.get_channel_id()
        
        videos = self.api_client.get_videos(channel_id, max_results=50)
        
        if not videos:
            return []
        
        # Group similar videos
        series_suggestions = []
        
        # Look for videos that could be part of a series
        titles = [v['title'] for v in videos]
        
        # Check for numbered patterns
        numbered_titles = [t for t in titles if any(char.isdigit() for char in t)]
        if numbered_titles:
            series_suggestions.append({
                'title': 'Numbered Series',
                'description': 'You have videos with numbers - consider creating a formal series',
                'examples': numbered_titles[:3]
            })
        
        # Suggest common series formats
        series_suggestions.extend([
            {
                'title': 'Beginner to Advanced Series',
                'description': 'Create a progression series for your main topic',
                'examples': ['Part 1: Basics', 'Part 2: Intermediate', 'Part 3: Advanced']
            },
            {
                'title': 'Weekly/Monthly Roundup',
                'description': 'Regular summary or recap videos',
                'examples': ['This Week in [Topic]', 'Monthly Recap', 'What Happened This Month']
            },
            {
                'title': 'Tutorial Series',
                'description': 'Multi-part comprehensive tutorial',
                'examples': ['Complete Guide: Part 1', 'Step-by-Step Tutorial Series']
            }
        ])
        
        return series_suggestions

