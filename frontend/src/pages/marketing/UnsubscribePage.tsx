import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeoHead } from '../../SeoHead';

export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'ok' | 'already' | 'err'>('working');
  const [detail, setDetail] = useState('Updating your preference…');

  useEffect(() => {
    const api = import.meta.env.VITE_API_BASE_URL || '';
    if (!token) {
      setStatus('err');
      setDetail('This unsubscribe link is missing. No account or password is needed — use the link from your email.');
      return;
    }

    const apply = async () => {
      const urls = [
        `${api}/api/public/acq/unsubscribe?token=${encodeURIComponent(token)}`,
        `${api}/api/public/outreach/unsubscribe?token=${encodeURIComponent(token)}`
      ];
      let lastError = 'Unsubscribe failed.';
      for (const url of urls) {
        try {
          const r = await fetch(url, { headers: { Accept: 'application/json' } });
          const data = (await r.json().catch(() => ({}))) as {
            ok?: boolean;
            already?: boolean;
            error?: string;
            message?: string;
          };
          if (!r.ok || data.ok === false) {
            lastError = data.error || data.message || lastError;
            continue;
          }
          if (data.already) {
            setStatus('already');
            setDetail("You're already unsubscribed.");
            return;
          }
          setStatus('ok');
          setDetail('You have been unsubscribed.\n\nYou will no longer receive marketing emails from YouTubeBoosterAI.');
          return;
        } catch (e) {
          lastError = e instanceof Error ? e.message : lastError;
        }
      }
      setStatus('err');
      setDetail(lastError);
    };

    void apply();
  }, [token]);

  return (
    <div className="page narrow-page" style={{ padding: '48px 20px', maxWidth: 560, margin: '0 auto' }}>
      <SeoHead title="Unsubscribe — YouTubeBooster AI" canonicalPath="/unsubscribe" noindex />
      <h1>
        {status === 'already'
          ? "You're already unsubscribed."
          : status === 'ok'
            ? 'You have been unsubscribed.'
            : 'Unsubscribe'}
      </h1>
      <p style={{ color: status === 'err' ? '#b45309' : '#374151', whiteSpace: 'pre-line' }}>{detail}</p>
    </div>
  );
}
