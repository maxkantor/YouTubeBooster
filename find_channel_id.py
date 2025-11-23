#!/usr/bin/env python3
"""Helper script to find your YouTube channel ID."""

from youtube_booster.api_client import YouTubeAPIClient
import sys

def main():
    print("\n" + "="*60)
    print("🔍 Finding Your YouTube Channel ID")
    print("="*60 + "\n")
    
    try:
        # Initialize API client
        print("🔐 Authenticating with YouTube API...")
        api_client = YouTubeAPIClient()
        print("✅ Authentication successful!\n")
        
        # Try to get authenticated user's channel
        print("📍 Trying to get your channel from authenticated account...")
        try:
            request = api_client.youtube_data.channels().list(
                part='id,snippet',
                mine=True
            )
            response = request.execute()
            
            if response['items']:
                channel = response['items'][0]
                print(f"\n✅ SUCCESS! Found your channel:\n")
                print(f"   Channel Name: {channel['snippet']['title']}")
                print(f"   Channel ID: {channel['id']}")
                print(f"   Handle: {channel['snippet'].get('customUrl', 'N/A')}")
                print(f"\n💡 You can use this channel ID in commands:")
                print(f"   python3 main.py analyze --channel-id {channel['id']}")
                print(f"   OR just use: python3 main.py analyze (it will auto-detect)\n")
                return channel['id']
        except Exception as e:
            print(f"⚠️  Could not get channel from authenticated account: {e}\n")
        
        # If we have command line arguments, try those
        if len(sys.argv) > 1:
            channel_input = sys.argv[1]
            print(f"🔍 Searching for channel: {channel_input}\n")
            
            try:
                channel_id = api_client.get_channel_id(channel_input)
                channel_stats = api_client.get_channel_stats(channel_id)
                
                print(f"✅ FOUND!\n")
                print(f"   Channel Name: {channel_stats['title']}")
                print(f"   Channel ID: {channel_id}\n")
                return channel_id
            except Exception as e:
                print(f"❌ Error: {e}\n")
                return None
        else:
            print("💡 To find a specific channel, provide:")
            print("   - Channel URL: python3 find_channel_id.py 'https://www.youtube.com/@maxkantorUSA'")
            print("   - Channel Handle: python3 find_channel_id.py '@maxkantorUSA'")
            print("   - Channel ID: python3 find_channel_id.py 'UCxxxxx...'\n")
            return None
            
    except FileNotFoundError as e:
        print(f"\n❌ {e}")
        print("\nPlease make sure credentials.json is in the project folder.\n")
        return None
    except Exception as e:
        print(f"\n❌ Error: {e}\n")
        import traceback
        traceback.print_exc()
        return None

if __name__ == '__main__':
    main()

