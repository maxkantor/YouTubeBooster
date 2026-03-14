import { useState } from 'react';
import { Link } from 'react-router-dom';

const IFRAME_SRC = 'https://mk-ai-global-page.s3.us-east-1.amazonaws.com/platform/index.html';

export function PlatformPage() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="platform-page">
      <header className="platform-header">
        <Link to="/" className="platform-back" onClick={() => window.scrollTo(0, 0)}>
          ← Back
        </Link>
        <h1 className="platform-title">MK Platform</h1>
      </header>
      <main className="platform-main">
        {loading && (
          <div className="platform-loading" aria-hidden>
            <div className="platform-spinner" />
            <span>Loading platform…</span>
          </div>
        )}
        <iframe
          title="MK Platform"
          src={IFRAME_SRC}
          className="platform-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoading(false)}
        />
      </main>
      <footer className="platform-footer">
        © Max Kantor — MK AI Platform. All rights reserved.
      </footer>
    </div>
  );
}
