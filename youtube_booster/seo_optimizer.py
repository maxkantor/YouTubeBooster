"""SEO optimization tools for YouTube videos."""

import re
from typing import List, Dict
from .api_client import YouTubeAPIClient


class SEOOptimizer:
    """Optimize video titles, descriptions, and tags for better discoverability."""
    
    def __init__(self, api_client: YouTubeAPIClient):
        """Initialize SEO optimizer.
        
        Args:
            api_client: YouTubeAPIClient instance
        """
        self.api_client = api_client
    
    def optimize_title(self, current_title: str, topic: str = None) -> Dict:
        """Optimize a video title for SEO.
        
        Args:
            current_title: Current video title
            topic: Main topic/keyword for the video
            
        Returns:
            Dictionary with optimization suggestions
        """
        suggestions = []
        
        # Length check
        if len(current_title) < 30:
            suggestions.append({
                'type': 'warning',
                'message': f'Title is too short ({len(current_title)} chars). '
                          'Aim for 50-60 characters for optimal SEO and display.',
                'priority': 'high'
            })
        elif len(current_title) > 60:
            suggestions.append({
                'type': 'warning',
                'message': f'Title might be truncated ({len(current_title)} chars). '
                          'Consider keeping it under 60 characters.',
                'priority': 'medium'
            })
        
        # Check for numbers
        if not re.search(r'\d', current_title):
            suggestions.append({
                'type': 'tip',
                'message': 'Consider adding numbers (e.g., "5 Ways to...", "Top 10...") '
                          'as they tend to perform well.',
                'priority': 'low'
            })
        
        # Check for power words
        power_words = ['ultimate', 'complete', 'guide', 'best', 'top', 'secret', 
                      'proven', 'essential', 'amazing', 'incredible', 'ultimate']
        has_power_word = any(word.lower() in current_title.lower() for word in power_words)
        
        if not has_power_word:
            suggestions.append({
                'type': 'tip',
                'message': 'Consider adding power words to increase click-through rate.',
                'priority': 'low'
            })
        
        # Generate optimized title suggestions
        optimized_titles = []
        if topic:
            # Generate variations
            optimized_titles.extend([
                f"The Ultimate Guide to {topic}",
                f"Top 10 {topic} Tips You Need to Know",
                f"Complete {topic} Tutorial for Beginners",
                f"How to Master {topic} in 2024",
                f"{topic}: Everything You Need to Know"
            ])
        
        return {
            'current_title': current_title,
            'current_length': len(current_title),
            'suggestions': suggestions,
            'optimized_examples': optimized_titles[:3] if optimized_titles else []
        }
    
    def optimize_description(self, current_description: str, video_title: str = None) -> Dict:
        """Optimize video description for SEO.
        
        Args:
            current_description: Current video description
            video_title: Video title (for keyword extraction)
            
        Returns:
            Dictionary with optimization suggestions
        """
        suggestions = []
        
        # Length check
        word_count = len(current_description.split())
        if word_count < 200:
            suggestions.append({
                'type': 'warning',
                'message': f'Description is too short ({word_count} words). '
                          'Aim for at least 200-300 words with keywords, timestamps, and links.',
                'priority': 'high'
            })
        
        # Check for keywords in first 125 characters
        first_125 = current_description[:125]
        if not first_125.strip():
            suggestions.append({
                'type': 'warning',
                'message': 'First 125 characters are critical! Make sure to include '
                          'main keywords and a compelling hook.',
                'priority': 'high'
            })
        
        # Check for timestamps
        timestamp_pattern = r'\d{1,2}:\d{2}'
        if not re.search(timestamp_pattern, current_description):
            suggestions.append({
                'type': 'tip',
                'message': 'Add timestamps to help viewers navigate and improve watch time.',
                'priority': 'medium'
            })
        
        # Check for links
        link_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        if not re.search(link_pattern, current_description):
            suggestions.append({
                'type': 'tip',
                'message': 'Add relevant links (social media, resources, related videos) '
                          'to increase engagement.',
                'priority': 'low'
            })
        
        # Check for subscribe CTA
        if 'subscribe' not in current_description.lower():
            suggestions.append({
                'type': 'tip',
                'message': 'Include a subscribe call-to-action in your description.',
                'priority': 'medium'
            })
        
        return {
            'current_length': len(current_description),
            'word_count': word_count,
            'suggestions': suggestions
        }
    
    def generate_tags(self, topic: str, video_title: str, existing_tags: List[str] = None) -> List[str]:
        """Generate relevant tags for a video.
        
        Args:
            topic: Main topic/keyword
            video_title: Video title
            existing_tags: Existing tags (if any)
            
        Returns:
            List of suggested tags
        """
        tags = existing_tags or []
        
        # Extract keywords from title
        title_words = re.findall(r'\b\w+\b', video_title.lower())
        tags.extend([word for word in title_words if len(word) > 4])
        
        # Add topic variations
        if topic:
            tags.extend([
                topic,
                f"{topic} tutorial",
                f"{topic} guide",
                f"how to {topic}",
                f"{topic} tips",
                f"{topic} 2024"
            ])
        
        # Add general YouTube tags
        tags.extend([
            'youtube',
            'tutorial',
            'how to',
            'guide',
            'tips'
        ])
        
        # Remove duplicates and limit to 15
        unique_tags = list(dict.fromkeys(tags))[:15]
        
        return unique_tags
    
    def optimize_video(self, video_id: str) -> Dict:
        """Get complete SEO optimization for a video.
        
        Args:
            video_id: YouTube video ID
            
        Returns:
            Dictionary with complete optimization analysis
        """
        channel_id = self.api_client.get_channel_id()
        videos = self.api_client.get_videos(channel_id, max_results=100)
        
        video = next((v for v in videos if v['video_id'] == video_id), None)
        
        if not video:
            return {'error': f'Video {video_id} not found'}
        
        title_analysis = self.optimize_title(video['title'])
        description_analysis = self.optimize_description(video['description'], video['title'])
        
        # Extract topic from title (simple keyword extraction)
        title_words = video['title'].split()
        topic = title_words[0] if title_words else None
        
        suggested_tags = self.generate_tags(topic, video['title'], video.get('tags', []))
        
        return {
            'video_id': video_id,
            'video_title': video['title'],
            'title_analysis': title_analysis,
            'description_analysis': description_analysis,
            'current_tags': video.get('tags', []),
            'suggested_tags': suggested_tags,
            'seo_score': self._calculate_seo_score(title_analysis, description_analysis, 
                                                  len(video.get('tags', [])))
        }
    
    def _calculate_seo_score(self, title_analysis: Dict, description_analysis: Dict, 
                            tag_count: int) -> Dict:
        """Calculate overall SEO score.
        
        Args:
            title_analysis: Title optimization analysis
            description_analysis: Description optimization analysis
            tag_count: Number of tags
            
        Returns:
            Dictionary with SEO score and breakdown
        """
        score = 100
        issues = []
        
        # Title scoring
        title_length = title_analysis['current_length']
        if title_length < 30 or title_length > 60:
            score -= 20
            issues.append('Title length needs optimization')
        
        # Description scoring
        word_count = description_analysis['word_count']
        if word_count < 200:
            score -= 30
            issues.append('Description is too short')
        
        # Tags scoring
        if tag_count < 10:
            score -= 15
            issues.append('Not enough tags')
        elif tag_count > 15:
            score -= 5
            issues.append('Too many tags (YouTube recommends 10-15)')
        
        score = max(0, score)
        
        if score >= 80:
            rating = 'excellent'
        elif score >= 60:
            rating = 'good'
        elif score >= 40:
            rating = 'needs improvement'
        else:
            rating = 'poor'
        
        return {
            'score': score,
            'rating': rating,
            'issues': issues
        }

