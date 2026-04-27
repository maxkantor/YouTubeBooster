#!/usr/bin/env python3
"""Main entry point for YouTube Booster application."""

import argparse
import json
from datetime import datetime, timedelta
from youtube_booster.api_client import YouTubeAPIClient
from youtube_booster.analyzer import WatchTimeAnalyzer
from youtube_booster.seo_optimizer import SEOOptimizer
from youtube_booster.suggestions import ContentSuggestions


def format_number(num):
    """Format number with commas."""
    return f"{num:,}"


def print_channel_analysis(analysis):
    """Print formatted channel analysis."""
    print("\n" + "="*60)
    print("📊 CHANNEL ANALYSIS")
    print("="*60)
    
    channel = analysis['channel_info']
    print(f"\nChannel: {channel['title']}")
    print(f"Subscribers: {format_number(channel['subscriber_count'])}")
    print(f"Total Videos: {format_number(channel['video_count'])}")
    print(f"Total Views: {format_number(channel['view_count'])}")
    
    perf = analysis['video_performance']
    print(f"\n📹 Video Performance:")
    print(f"  Videos Analyzed: {perf['total_videos']}")
    print(f"  Total Views: {format_number(perf['total_views'])}")
    print(f"  Average Views per Video: {format_number(int(perf['avg_views_per_video']))}")
    print(f"  Average Engagement Rate: {perf['avg_engagement_rate']:.2f}%")
    
    print(f"\n⭐ Top Performing Videos by Views:")
    for i, video in enumerate(perf['top_videos_by_views'], 1):
        print(f"  {i}. {video['title']} ({format_number(video['view_count'])} views)")
    
    print(f"\n💡 Recommendations:")
    for rec in analysis['recommendations']:
        print(f"  {rec}")


def print_seo_analysis(seo_analysis):
    """Print formatted SEO analysis."""
    print("\n" + "="*60)
    print("🔍 SEO OPTIMIZATION ANALYSIS")
    print("="*60)
    
    if 'error' in seo_analysis:
        print(f"\n❌ Error: {seo_analysis['error']}")
        return
    
    print(f"\nVideo: {seo_analysis['video_title']}")
    
    seo_score = seo_analysis['seo_score']
    print(f"\nSEO Score: {seo_score['score']}/100 ({seo_score['rating'].upper()})")
    
    if seo_score['issues']:
        print("\n⚠️  Issues:")
        for issue in seo_score['issues']:
            print(f"  - {issue}")
    
    title = seo_analysis['title_analysis']
    print(f"\n📝 Title Analysis ({title['current_length']} characters):")
    for suggestion in title['suggestions']:
        priority = suggestion['priority'].upper()
        icon = "🔴" if suggestion['type'] == 'warning' else "💡"
        print(f"  {icon} [{priority}] {suggestion['message']}")
    
    if title['optimized_examples']:
        print("\n  Suggested Title Examples:")
        for ex in title['optimized_examples']:
            print(f"    - {ex}")
    
    desc = seo_analysis['description_analysis']
    print(f"\n📄 Description Analysis ({desc['word_count']} words):")
    for suggestion in desc['suggestions']:
        priority = suggestion['priority'].upper()
        icon = "🔴" if suggestion['type'] == 'warning' else "💡"
        print(f"  {icon} [{priority}] {suggestion['message']}")
    
    print(f"\n🏷️  Tags:")
    print(f"  Current: {', '.join(seo_analysis['current_tags'][:10])}")
    print(f"  Suggested: {', '.join(seo_analysis['suggested_tags'][:10])}")


def print_content_suggestions(suggestions):
    """Print formatted content suggestions."""
    print("\n" + "="*60)
    print("💡 CONTENT SUGGESTIONS")
    print("="*60)
    
    if 'error' in suggestions:
        print(f"\n❌ Error: {suggestions['error']}")
        return
    
    print("\n⭐ Top Performing Videos:")
    for i, video in enumerate(suggestions['top_performers'], 1):
        print(f"  {i}. {video['title']}")
        print(f"     Views: {format_number(video['views'])} | "
              f"Engagement: {format_number(video['engagement'])}")
    
    print("\n🎯 Common Patterns Found:")
    if suggestions['common_patterns']['common_words']:
        print(f"  Words: {', '.join(suggestions['common_patterns']['common_words'][:5])}")
    if suggestions['common_patterns']['common_tags']:
        print(f"  Tags: {', '.join(suggestions['common_patterns']['common_tags'][:5])}")
    
    print("\n💡 Content Ideas:")
    for i, idea in enumerate(suggestions['content_suggestions'], 1):
        print(f"  {i}. {idea}")


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description='YouTube Booster - Grow your channel legitimately'
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Analyze command
    analyze_parser = subparsers.add_parser('analyze', help='Analyze channel performance')
    analyze_parser.add_argument('--channel-id', help='Channel ID (default: authenticated user)')
    analyze_parser.add_argument('--days', type=int, default=30, 
                               help='Number of days to analyze (default: 30)')
    analyze_parser.add_argument('--output', help='Output JSON file')
    
    # SEO optimize command
    seo_parser = subparsers.add_parser('seo', help='Optimize video SEO')
    seo_parser.add_argument('--video-id', required=True, help='Video ID to optimize')
    seo_parser.add_argument('--output', help='Output JSON file')
    
    # Suggestions command
    suggestions_parser = subparsers.add_parser('suggestions', 
                                              help='Get content suggestions')
    suggestions_parser.add_argument('--channel-id', 
                                   help='Channel ID (default: authenticated user)')
    suggestions_parser.add_argument('--top-n', type=int, default=5,
                                   help='Number of top videos to analyze (default: 5)')
    suggestions_parser.add_argument('--output', help='Output JSON file')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        # Initialize API client
        print("🔐 Authenticating with YouTube API...")
        api_client = YouTubeAPIClient()
        print("✅ Authentication successful!\n")
        
        if args.command == 'analyze':
            analyzer = WatchTimeAnalyzer(api_client)
            channel_id = args.channel_id
            
            if channel_id is None:
                # Try to get channel ID from authenticated user first
                try:
                    channel_id = api_client.get_channel_id()
                    if channel_id:
                        print(f"📍 Using your authenticated channel\n")
                except Exception as e:
                    # If that fails, try the handle
                    try:
                        channel_id = api_client.get_channel_id('@maxkantorcooking')
                        if channel_id:
                            print(f"📍 Found channel: {channel_id}\n")
                    except Exception as e2:
                        print(f"\n❌ Could not find channel automatically: {e2}")
                        print("\n💡 Options:")
                        print("   1. Use your channel URL: --channel-id YOUR_CHANNEL_URL")
                        print("   2. Use your channel ID: --channel-id UCxxxxx...")
                        print("   3. Run: python3 find_channel_id.py to find your channel ID")
                        return
            
            if not channel_id:
                print("❌ Could not determine channel ID. Please provide --channel-id")
                print("   Example: python3 main.py analyze --channel-id 'https://www.youtube.com/@maxkantorcooking'")
                return
            
            analysis = analyzer.analyze_channel(channel_id, days=args.days)
            print_channel_analysis(analysis)
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(analysis, f, indent=2, default=str)
                print(f"\n💾 Results saved to {args.output}")
        
        elif args.command == 'seo':
            optimizer = SEOOptimizer(api_client)
            seo_analysis = optimizer.optimize_video(args.video_id)
            print_seo_analysis(seo_analysis)
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(seo_analysis, f, indent=2, default=str)
                print(f"\n💾 Results saved to {args.output}")
        
        elif args.command == 'suggestions':
            suggestions_gen = ContentSuggestions(api_client)
            channel_id = args.channel_id
            
            if channel_id is None:
                channel_id = api_client.get_channel_id('@maxkantorcooking')
            
            suggestions = suggestions_gen.analyze_top_performers(channel_id, top_n=args.top_n)
            print_content_suggestions(suggestions)
            
            if args.output:
                with open(args.output, 'w') as f:
                    json.dump(suggestions, f, indent=2, default=str)
                print(f"\n💾 Results saved to {args.output}")
    
    except FileNotFoundError as e:
        print(f"\n❌ {e}")
        print("\nPlease follow these steps:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create a project or select an existing one")
        print("3. Enable YouTube Data API v3 and YouTube Analytics API")
        print("4. Create OAuth 2.0 credentials")
        print("5. Download credentials and save as 'credentials.json'")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()

