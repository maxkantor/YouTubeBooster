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
    } else if (tabName === 'traffic') {
        loadTrafficTools();
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

async function copyText(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        console.warn('Clipboard API unavailable:', error);
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
}

async function copyDecodedText(encodedText, successMessage) {
    const text = decodeURIComponent(encodedText);
    const copied = await copyText(text);
    if (copied) {
        alert(successMessage || 'Copied to clipboard');
    } else {
        showError('Could not copy to clipboard');
    }
}

function renderTrafficVideoCard(video) {
    const publishedLabel = video.age_days == null
        ? 'Published date unavailable'
        : `${video.age_days} days ago`;

    return `
        <div class="traffic-card">
            <div class="traffic-card-header">
                <h4>${escapeHtml(video.title)}</h4>
                <span class="traffic-chip">${video.engagement_rate.toFixed(2)}% engagement</span>
            </div>
            <p class="traffic-card-reason">${escapeHtml(video.reason)}</p>
            <div class="video-meta">
                <span>👁️ ${formatNumber(video.view_count)} views</span>
                <span>👍 ${formatNumber(video.like_count)} likes</span>
                <span>💬 ${formatNumber(video.comment_count)} comments</span>
                <span>🗓️ ${publishedLabel}</span>
            </div>
            <div class="traffic-card-actions">
                <a class="btn-secondary traffic-link-btn" href="${video.watch_url}" target="_blank" rel="noopener">Open on YouTube</a>
                <button class="btn-secondary" onclick="copyDecodedText('${encodeURIComponent(video.watch_url)}', 'Watch link copied')">Copy Link</button>
                <button class="btn-secondary" onclick="copyDecodedText('${encodeURIComponent(video.share_text)}', 'Share text copied')">Copy Share Text</button>
                <button class="btn-primary" onclick="analyzeVideoSEO('${video.video_id}')">Analyze SEO</button>
            </div>
        </div>
    `;
}

function renderChecklistItem(item) {
    return `
        <div class="traffic-checklist-item">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.details)}</p>
        </div>
    `;
}

function renderSeriesIdea(series) {
    const examples = Array.isArray(series.examples) ? series.examples : [];
    return `
        <div class="traffic-card">
            <div class="traffic-card-header">
                <h4>${escapeHtml(series.title)}</h4>
            </div>
            <p class="traffic-card-reason">${escapeHtml(series.description || '')}</p>
            ${examples.length > 0 ? `
                <ul class="traffic-example-list">
                    ${examples.map(example => `<li>${escapeHtml(example)}</li>`).join('')}
                </ul>
            ` : ''}
        </div>
    `;
}

async function loadTrafficTools() {
    showLoading();
    hideError();

    try {
        const response = await fetch('/api/channel/traffic_tools');
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || `Server error: ${response.status}`);
        }

        const promotionList = document.getElementById('traffic-promotion-list');
        const reshareList = document.getElementById('traffic-reshare-list');
        const checklist = document.getElementById('traffic-checklist');
        const followups = document.getElementById('traffic-followups');
        const series = document.getElementById('traffic-series');

        promotionList.innerHTML = (data.promotion_candidates || []).length
            ? data.promotion_candidates.map(renderTrafficVideoCard).join('')
            : '<div class="traffic-empty">No promotion candidates available yet.</div>';

        reshareList.innerHTML = (data.top_performers || []).length
            ? data.top_performers.map(renderTrafficVideoCard).join('')
            : '<div class="traffic-empty">No top performers available yet.</div>';

        checklist.innerHTML = (data.checklist || []).length
            ? data.checklist.map(renderChecklistItem).join('')
            : '<div class="traffic-empty">No checklist items available yet.</div>';

        followups.innerHTML = (data.content_suggestions || []).length
            ? data.content_suggestions.map(idea => `<div class="suggestion-item">${escapeHtml(idea)}</div>`).join('')
            : '<div class="traffic-empty">No follow-up ideas available yet.</div>';

        series.innerHTML = (data.series_ideas || []).length
            ? data.series_ideas.map(renderSeriesIdea).join('')
            : '<div class="traffic-empty">No series ideas available yet.</div>';

        hideLoading();
    } catch (error) {
        showError(error.message || 'Failed to load traffic tools.');
        hideLoading();
    }
}

function extractYouTubeVideoId(input) {
    const value = (input || '').trim();
    if (!value) return '';

    // Already looks like a bare YouTube video ID.
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
        return value;
    }

    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();

        if (host === 'youtu.be') {
            const shortId = url.pathname.replace(/^\/+/, '').split('/')[0];
            if (/^[A-Za-z0-9_-]{11}$/.test(shortId)) {
                return shortId;
            }
        }

        const videoParam = url.searchParams.get('v');
        if (videoParam && /^[A-Za-z0-9_-]{11}$/.test(videoParam)) {
            return videoParam;
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        const knownPrefixes = new Set(['shorts', 'embed', 'live', 'watch']);
        if (pathParts.length >= 2 && knownPrefixes.has(pathParts[0]) && /^[A-Za-z0-9_-]{11}$/.test(pathParts[1])) {
            return pathParts[1];
        }
    } catch (error) {
        // Not a valid URL, fall through to validation below.
    }

    return '';
}

async function analyzeSEO() {
    const inputValue = document.getElementById('video-id-input').value.trim();
    const videoId = extractYouTubeVideoId(inputValue);
    
    if (!videoId) {
        showError('Please enter a valid YouTube video ID or URL');
        return;
    }
    
    showLoading();
    hideError();
    
    try {
        const response = await fetch(`/api/video/seo/${encodeURIComponent(videoId)}`);
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            throw new Error(responseText.startsWith('<')
                ? 'The server returned a non-JSON error response.'
                : 'Could not parse the server response.');
        }
        
        if (!response.ok || data.error) {
            showError(data.error || `Server error: ${response.status}`);
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

/* ═══════════════════════════════════════════════
   Continuous Runner
═══════════════════════════════════════════════ */

const runner = {
    player: null,
    ytReady: false,
    videos: [],        // full list from API
    playOrder: [],     // indices into this.videos
    currentIdx: 0,     // position in playOrder
    running: false,
    desiredSpeed: 10,
    actualSpeed: null,
    rateTimer: null,
    statusTimer: null,
    watchSeconds: 0,
    _videoStartSeconds: null,
    _watchLimitFired: false,
    // session metrics (for testing runner functionality)
    state: 'IDLE',
    sessionStarted: 0,
    sessionEnded: 0,
    sessionWallSeconds: 0,
    _sessionTickMs: null,
    maxTimer: null,
};

// Called by YouTube IFrame API once the script loads
function onYouTubeIframeAPIReady() {
    runner.ytReady = true;
    runnerLog('YouTube IFrame API ready.');
}

// Ensure the callback is registered globally (iframe_api expects window.onYouTubeIframeAPIReady)
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Fallback: if the API is already loaded, mark ready.
if (window.YT && window.YT.Player) {
    onYouTubeIframeAPIReady();
} else {
    setTimeout(() => {
        if (window.YT && window.YT.Player) {
            onYouTubeIframeAPIReady();
        } else {
            runnerLog('YouTube IFrame API not ready yet, please wait.');
        }
    }, 2000);
}

function runnerEnsureYouTubeApiLoaded() {
    if (runner.ytReady) return true;
    try {
        if (window.YT && typeof window.YT.Player === 'function') {
            runner.ytReady = true;
            return true;
        }
    } catch (e) {
        // ignore
    }

    // Best-effort: ensure the iframe_api script is present.
    const hasScript = !!document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!hasScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }
    return false;
}

function runnerLog(msg) {
    const el = document.getElementById('runner-log');
    if (!el) return;
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    el.textContent = line + el.textContent;
}

function runnerUpdateStatus(statusText) {
    const el = document.getElementById('runner-status-text');
    if (el) el.textContent = statusText;
}

function runnerUpdateSessionPanel() {
    const startedEl = document.getElementById('runner-session-started');
    const endedEl = document.getElementById('runner-session-ended');
    const wallEl = document.getElementById('runner-session-wall');
    const viewsEl = document.getElementById('runner-session-views');
    const hoursEl = document.getElementById('runner-session-hours');

    if (startedEl) startedEl.textContent = String(runner.sessionStarted);
    if (endedEl) endedEl.textContent = String(runner.sessionEnded);
    if (wallEl) wallEl.textContent = String(Math.floor(runner.sessionWallSeconds));

    // Local/simulated metrics for testing (not YouTube public metrics)
    const runnerViews = runner.sessionStarted;
    const runnerHours = runner.sessionWallSeconds / 3600;
    if (viewsEl) viewsEl.textContent = String(runnerViews);
    if (hoursEl) hoursEl.textContent = runnerHours.toFixed(2);
}

function runnerSetServerStatus(text) {
    const el = document.getElementById('runner-server-status');
    if (el) el.textContent = text;
}

async function runnerTestServer() {
    runnerSetServerStatus('Testing…');
    try {
        const resp = await fetch('/api/runner/ping', { cache: 'no-store' });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
            runnerSetServerStatus('Error');
            runnerLog('Server ping failed: ' + (data.error || `HTTP ${resp.status}`));
            return;
        }
        runnerSetServerStatus('OK');
        runnerLog('Server ping OK.');
    } catch (e) {
        runnerSetServerStatus('Offline');
        runnerLog('Server ping exception: ' + e.message);
    }
}

function runnerTickSessionWallTime() {
    if (!runner.running) return;
    const now = Date.now();
    if (runner._sessionTickMs == null) {
        runner._sessionTickMs = now;
        return;
    }
    const dt = (now - runner._sessionTickMs) / 1000;
    runner._sessionTickMs = now;
    if (runner.state === 'PLAYING' && dt > 0 && dt < 10) {
        runner.sessionWallSeconds += dt;
        runnerUpdateSessionPanel();
    }
}

function runnerMaybeSkipByWatchLimit() {
    if (!runner.running) return;
    if (!runner.player) return;
    if (!runner.watchSeconds || runner.watchSeconds <= 0) return;
    if (runner._watchLimitFired) return;
    if (runner.state !== 'PLAYING') return;

    try {
        const nowPos = runner.player.getCurrentTime();
        if (nowPos == null || isNaN(nowPos)) return;
        const startPos = runner._videoStartSeconds == null ? 0 : runner._videoStartSeconds;
        const elapsed = nowPos - startPos;
        if (elapsed >= runner.watchSeconds) {
            runner._watchLimitFired = true;
            runner.sessionEnded += 1;
            runnerUpdateSessionPanel();
            runnerLog(`Watch limit reached (${runner.watchSeconds}s). Advancing.`);
            runnerAdvance();
        }
    } catch (e) {
        // ignore
    }
}

async function runnerLoadVideos() {
    runnerLog('Loading videos…');
    try {
        const resp = await fetch('/api/channel/videos?max_results=200');
        const data = await resp.json();
        if (data.error) { runnerLog('Error: ' + data.error); return; }
        runner.videos = Array.isArray(data) ? data : (data.items || []);
        const listEl = document.getElementById('runner-video-list');
        listEl.innerHTML = runner.videos.map((v, i) => `
            <label>
                <input type="checkbox" class="runner-pick" data-idx="${i}">
                ${escapeHtml(v.title || v.video_id)}
            </label>`).join('');
        document.getElementById('runner-total').textContent = runner.videos.length;
        runnerLog(`Loaded ${runner.videos.length} videos.`);
    } catch (e) {
        runnerLog('Failed to load videos: ' + e.message);
    }
}

function runnerBuildPlayOrder() {
    const checked = Array.from(document.querySelectorAll('.runner-pick:checked'));
    let indices = checked.length > 0
        ? checked.map(cb => parseInt(cb.dataset.idx))
        : runner.videos.map((_, i) => i);

    if (document.getElementById('runner-shuffle').checked) {
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
    }
    return indices;
}

function runnerCurrentVideo() {
    const idx = runner.playOrder[runner.currentIdx];
    return runner.videos[idx] || null;
}

function runnerApplySpeed() {
    if (!runner.player || !runner.running) return;
    try {
        runner.player.setPlaybackRate(runner.desiredSpeed);
        const actual = runner.player.getPlaybackRate();
        runner.actualSpeed = actual;
        document.getElementById('runner-actual-speed').textContent = actual;
        document.getElementById('runner-desired-speed').textContent = runner.desiredSpeed;
    } catch (e) { /* player not ready yet */ }
}

function runnerUpdateStatusPanel() {
    if (!runner.player || !runner.running) return;
    try {
        const pos = runner.player.getCurrentTime();
        document.getElementById('runner-position').textContent =
            pos !== undefined ? pos.toFixed(1) : '—';
    } catch (e) { /* ignore */ }
}

function runnerPlayCurrent() {
    const video = runnerCurrentVideo();
    if (!video) { runnerLog('No video to play.'); return; }

    runner.sessionStarted += 1;
    runnerUpdateSessionPanel();

    runner._videoStartSeconds = null;
    runner._watchLimitFired = false;

    const videoId = video.video_id || video.id;
    const title = video.title || videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    document.getElementById('runner-video-title').textContent = title;
    const linkEl = document.getElementById('runner-video-link');
    linkEl.href = url;
    linkEl.textContent = videoId;
    document.getElementById('runner-index').textContent = runner.currentIdx + 1;
    document.getElementById('runner-total').textContent = runner.playOrder.length;
    document.getElementById('runner-desired-speed').textContent = runner.desiredSpeed;

    runnerLog(`Playing [${runner.currentIdx + 1}/${runner.playOrder.length}] ${title} (${videoId})`);

    if (runner.player && runner.player.loadVideoById) {
        runner.player.loadVideoById(videoId);
        // In the reuse-player path, ensure we capture a start position after the player begins.
        setTimeout(() => {
            if (runner._videoStartSeconds == null && runner.player && runner.running) {
                try { runner._videoStartSeconds = runner.player.getCurrentTime() || 0; } catch (e) { runner._videoStartSeconds = 0; }
            }
        }, 800);
    } else {
        runner.player = new YT.Player('runner-player', {
            width: '100%',
            height: '100%',
            videoId: videoId,
            playerVars: { autoplay: 1, controls: 1 },
            events: {
                onReady: (e) => { runnerApplySpeed(); },
                onStateChange: (e) => {
                    if (e.data === YT.PlayerState.PLAYING) {
                        runner.state = 'PLAYING';
                        if (runner._videoStartSeconds == null) {
                            try { runner._videoStartSeconds = runner.player.getCurrentTime() || 0; } catch (err) { runner._videoStartSeconds = 0; }
                        }
                        runnerUpdateSessionPanel();
                    } else if (e.data === YT.PlayerState.PAUSED) {
                        runner.state = 'PAUSED';
                    } else if (e.data === YT.PlayerState.BUFFERING) {
                        runner.state = 'BUFFERING';
                    }
                    if (e.data === YT.PlayerState.ENDED) {
                        runner.state = 'ENDED';
                        runner.sessionEnded += 1;
                        runnerUpdateSessionPanel();
                        runnerAdvance();
                    }
                },
                onError: (e) => {
                    runnerLog(`Player error code ${e.data} on video ${videoId}. Skipping.`);
                    runnerAdvance();
                },
            },
        });
    }

    // Start periodic timers
    clearInterval(runner.rateTimer);
    clearInterval(runner.statusTimer);
    clearTimeout(runner.maxTimer);
    runner.rateTimer = setInterval(runnerApplySpeed, 1000);
    runner.statusTimer = setInterval(() => {
        runnerUpdateStatusPanel();
        runnerTickSessionWallTime();
        runnerMaybeSkipByWatchLimit();
    }, 500);
}

function runnerAdvance() {
    runner.currentIdx = (runner.currentIdx + 1) % runner.playOrder.length;
    runnerPlayCurrent();
}

function runnerStart() {
    runnerLog('Start clicked.');
    if (!runnerEnsureYouTubeApiLoaded()) {
        runnerUpdateStatus('Waiting for YouTube API…');
        runnerLog('YouTube API not ready yet (maybe blocked by browser/extension). Waiting…');
        return;
    }
    if (runner.videos.length === 0) {
        runnerUpdateStatus('No videos loaded');
        runnerLog('No videos loaded. Click "Load Videos" first.');
        return;
    }

    runner.desiredSpeed = parseFloat(document.getElementById('runner-speed').value) || 10;
    runner.watchSeconds = parseInt(document.getElementById('runner-watch-seconds')?.value || '0', 10) || 0;
    runner.playOrder = runnerBuildPlayOrder();
    runner.currentIdx = 0;
    runner.running = true;
    runner.state = 'IDLE';
    runner.sessionStarted = 0;
    runner.sessionEnded = 0;
    runner.sessionWallSeconds = 0;
    runner._sessionTickMs = null;
    runner._videoStartSeconds = null;
    runner._watchLimitFired = false;
    runnerSetServerStatus('—');
    runnerUpdateSessionPanel();

    document.getElementById('runner-start-btn').disabled = true;
    document.getElementById('runner-stop-btn').disabled = false;
    document.getElementById('runner-skip-btn').disabled = false;
    runnerUpdateStatus('Running');
    runnerTestServer();
    runnerPlayCurrent();
}

function runnerStop() {
    runner.running = false;
    runner.state = 'STOPPED';
    clearInterval(runner.rateTimer);
    clearInterval(runner.statusTimer);
    clearTimeout(runner.maxTimer);
    try { runner.player && runner.player.stopVideo(); } catch (e) { /* ignore */ }
    runner._sessionTickMs = null;
    document.getElementById('runner-start-btn').disabled = false;
    document.getElementById('runner-stop-btn').disabled = true;
    document.getElementById('runner-skip-btn').disabled = true;
    runnerUpdateStatus('Stopped');
    runnerLog('Runner stopped.');
}

function runnerSkip() {
    if (!runner.running) return;
    runnerLog('Skipping current video.');
    runnerAdvance();
}

async function runnerMarkIssue() {
    const video = runnerCurrentVideo();
    const videoId = video ? (video.video_id || video.id) : '';
    const title = video ? (video.title || '') : '';
    const note = document.getElementById('runner-issue-note').value;

    let position = null;
    try { position = runner.player ? runner.player.getCurrentTime() : null; } catch (e) { /* ignore */ }

    const payload = {
        video_id: videoId,
        title: title,
        desired_speed: runner.desiredSpeed,
        actual_speed: runner.actualSpeed,
        position_seconds: position,
        note: note,
    };

    try {
        const resp = await fetch('/api/runner/log_issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await resp.json();
        if (data.error) {
            runnerLog('Issue log error: ' + data.error);
        } else {
            runnerLog(`Issue marked: "${note}" @ ${position ? position.toFixed(1) : '?'}s (${videoId})`);
            document.getElementById('runner-issue-note').value = '';
        }
    } catch (e) {
        runnerLog('Failed to post issue: ' + e.message);
    }
}

