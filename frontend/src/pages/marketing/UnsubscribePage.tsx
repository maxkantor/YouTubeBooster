import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeoHead } from '../../SeoHead';

export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'ok' | 'err'>('working');
  const [detail, setDetail] = useState('Updating your preference…');

  useEffect(() => {
    const api = import.meta.env.VITE_API_BASE_URL || '';
    if (!token) {
      setStatus('err');
      setDetail('Missing unsubscribe token.');
      return;
    }
    fetch(`${api}/api/public/outreach/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.ok === false) throw new Error(data.error || 'Unsubscribe failed');
        setStatus('ok');
        setDetail('You are unsubscribed from YouTubeBooster outreach. We will not email this address again.');
      })
      .catch((e: Error) => {
        setStatus('err');
        setDetail(e.message || 'Unsubscribe failed.');
      });
  }, [token]);

  return (
    <div className="page narrow-page" style={{ padding: '48px 20px', maxWidth: 560, margin: '0 auto' }}>
      <SeoHead title="Unsubscribe — YouTubeBooster AI" canonicalPath="/unsubscribe" noindex />
      <h1>Unsubscribe</h1>
      <p style={{ color: status === 'err' ? '#b45309' : '#374151' }}>{detail}</p>
    </div>
  );
}
