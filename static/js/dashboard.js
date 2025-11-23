// Dashboard JavaScript

function formatNumber(num) {
    return new Intl.NumberFormat().format(num || 0);
}

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Load data if needed
    if (tabName === 'overview' && !document.getElementById('subscribers').textContent.includes('-')) {
        // Already loaded
    } else if (tabName === 'overview') {
        loadOverview();
    }
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = '❌ Error: ' + message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

async function loadOverview() {
    showLoading();
    hideError();
    
    try {
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        let response;
        try {
            response = await fetch('/api/channel/analyze?days=30', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timed out. The API call took too long. Check server logs.');
            }
            throw fetchError;
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            hideLoading();
            return;
        }
        
        // Update stats
        const channel = data.channel_info;
        document.getElementById('channel-name').textContent = channel.title || '@maxkantorUSA';
        document.getElementById('subscribers').textContent = formatNumber(channel.subscriber_count);
        document.getElementById('total-views').textContent = formatNumber(channel.view_count);
        document.getElementById('video-count').textContent = formatNumber(channel.video_count);
        
        // Update engagement
        const perf = data.video_performance;
        if (perf && perf.avg_engagement_rate !== undefined) {
            document.getElementById('engagement-rate').textContent = perf.avg_engagement_rate.toFixed(2) + '%';
        }
        
        // Show top videos
        if (perf && perf.top_videos_by_views) {
            const topVideosDiv = document.getElementById('top-videos');
            topVideosDiv.innerHTML = perf.top_videos_by_views.map((video, index) => `
                <div class="video-item">
                    <h3>${index + 1}. ${escapeHtml(video.title)}</h3>
                    <div class="video-meta">
                        <span>👁️ ${formatNumber(video.view_count)} views</span>
                        <span>📝 Video ID: ${video.video_id}</span>
                    </div>
                </div>
            `).join('');
        }
        
        // Show recommendations
        if (data.recommendations) {
            const recsDiv = document.getElementById('recommendations');
            recsDiv.innerHTML = data.recommendations.map(rec => `
                <div class="recommendation-item">${escapeHtml(rec)}</div>
            `).join('');
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error loading overview:', error);
        showError(error.message || 'Failed to load channel data. Check console for details.');
        hideLoading();
    }
}

async function loadVideos() {
    showLoading();
    hideError();
    
    try {
        const response = await fetch('/api/channel/videos?max_results=50');
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            hideLoading();
            return;
        }
        
        const videosDiv = document.getElementById('all-videos');
        videosDiv.innerHTML = data.map(video => `
            <div class="video-item">
                <h3>${escapeHtml(video.title)}</h3>
                <div class="video-meta">
                    <span>👁️ ${formatNumber(video.view_count)} views</span>
                    <span>👍 ${formatNumber(video.like_count)} likes</span>
                    <span>💬 ${formatNumber(video.comment_count)} comments</span>
                </div>
                <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
                    Published: ${new Date(video.published_at).toLocaleDateString()}
                </p>
                <button class="btn-primary" style="margin-top: 10px;" onclick="analyzeVideoSEO('${video.video_id}')">
                    Analyze SEO
                </button>
            </div>
        `).join('');
        
        hideLoading();
    } catch (error) {
        showError(error.message);
        hideLoading();
    }
}

async function loadSuggestions() {
    showLoading();
    hideError();
    
    try {
        const response = await fetch('/api/channel/suggestions?top_n=10');
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            hideLoading();
            return;
        }
        
        const suggestionsDiv = document.getElementById('content-suggestions');
        
        let html = '';
        
        if (data.top_performers && data.top_performers.length > 0) {
            html += '<h3>Top Performing Videos:</h3>';
            data.top_performers.forEach((video, index) => {
                html += `
                    <div class="video-item" style="margin-bottom: 15px;">
                        <h4>${index + 1}. ${escapeHtml(video.title)}</h4>
                        <div class="video-meta">
                            <span>${formatNumber(video.views)} views</span>
                            <span>${formatNumber(video.engagement)} engagement</span>
                        </div>
                    </div>
                `;
            });
        }
        
        if (data.content_suggestions && data.content_suggestions.length > 0) {
            html += '<h3 style="margin-top: 30px;">Content Ideas:</h3>';
            data.content_suggestions.forEach(suggestion => {
                html += `
                    <div class="suggestion-item">${escapeHtml(suggestion)}</div>
                `;
            });
        }
        
        suggestionsDiv.innerHTML = html;
        hideLoading();
    } catch (error) {
        showError(error.message);
        hideLoading();
    }
}

async function analyzeSEO() {
    const videoId = document.getElementById('video-id-input').value.trim();
    
    if (!videoId) {
        showError('Please enter a video ID');
        return;
    }
    
    showLoading();
    hideError();
    
    try {
        const response = await fetch(`/api/video/seo/${videoId}`);
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            hideLoading();
            return;
        }
        
        const resultsDiv = document.getElementById('seo-results');
        const seoScore = data.seo_score;
        
        let html = `
            <div class="seo-results">
                <h2>${escapeHtml(data.video_title)}</h2>
                <div class="seo-score ${seoScore.rating}">${seoScore.score}/100</div>
                <p style="text-align: center; font-size: 1.2em; margin-bottom: 30px;">${seoScore.rating.toUpperCase()}</p>
                
                ${seoScore.issues && seoScore.issues.length > 0 ? `
                    <h3>⚠️ Issues to Fix:</h3>
                    <ul style="margin-bottom: 30px;">
                        ${seoScore.issues.map(issue => `<li style="margin: 10px 0;">${escapeHtml(issue)}</li>`).join('')}
                    </ul>
                ` : ''}
                
                <h3>📝 Title Analysis:</h3>
                ${data.title_analysis.suggestions.map(s => `
                    <div class="recommendation-item" style="margin-bottom: 10px;">
                        <strong>[${s.priority.toUpperCase()}]</strong> ${escapeHtml(s.message)}
                    </div>
                `).join('')}
                
                ${data.title_analysis.optimized_examples && data.title_analysis.optimized_examples.length > 0 ? `
                    <h3 style="margin-top: 30px;">Suggested Titles:</h3>
                    <ul>
                        ${data.title_analysis.optimized_examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}
                    </ul>
                ` : ''}
                
                <h3 style="margin-top: 30px;">📄 Description Analysis:</h3>
                ${data.description_analysis.suggestions.map(s => `
                    <div class="recommendation-item" style="margin-bottom: 10px;">
                        <strong>[${s.priority.toUpperCase()}]</strong> ${escapeHtml(s.message)}
                    </div>
                `).join('')}
                
                <h3 style="margin-top: 30px;">🏷️ Tags:</h3>
                <p><strong>Current:</strong> ${data.current_tags.join(', ')}</p>
                <p style="margin-top: 10px;"><strong>Suggested:</strong> ${data.suggested_tags.join(', ')}</p>
            </div>
        `;
        
        resultsDiv.innerHTML = html;
        hideLoading();
    } catch (error) {
        showError(error.message);
        hideLoading();
    }
}

function analyzeVideoSEO(videoId) {
    document.getElementById('video-id-input').value = videoId;
    showTab('seo');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes('SEO')) {
            btn.classList.add('active');
        }
    });
    analyzeSEO();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load overview on page load
window.addEventListener('DOMContentLoaded', () => {
    loadOverview();
});

