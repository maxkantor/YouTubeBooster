import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '../lib/api';
import { analytics } from '../lib/analytics';
import type { AiGenerateAction } from '../types';

type AuditContext = {
  channelLabel: string;
  titleOriginal: string;
  keywords: string[];
  opportunities: Array<{ id: string; output: string[] }>;
};

function buildClientPreviewItems(action: AiGenerateAction, audit: AuditContext): string[] {
  if (action === 'rewrite_titles') {
    return audit.opportunities.find((o) => o.id === 'titles')?.output ?? [];
  }
  if (action === 'improve_description') {
    return audit.opportunities.find((o) => o.id === 'description')?.output ?? [];
  }
  if (action === 'keywords') {
    const base = audit.keywords;
    return [...base, `${base[0] ?? 'youtube'} tutorial`, `${base[1] ?? 'content'} tips`];
  }
  if (action === 'pattern') {
    return audit.opportunities.find((o) => o.id === 'pattern')?.output ?? [];
  }
  return [
    `7 ${audit.channelLabel} video ideas that solve one painful problem`,
    '3-part series: beginner to advanced in 30 days',
    'React to common mistakes in your niche and fix them live',
    'Before/after transformation format with measurable outcome',
    'Answer top audience comments as a recurring series'
  ];
}

function buildRequestInput(audit: AuditContext) {
  const titles = audit.opportunities.find((o) => o.id === 'titles')?.output ?? [audit.titleOriginal];
  const descLines = audit.opportunities.find((o) => o.id === 'description')?.output ?? [];
  const description = descLines.length > 0 ? descLines.join('\n') : audit.titleOriginal;
  return {
    titles,
    description,
    niche: audit.channelLabel,
    audience: 'YouTube creators optimizing CTR, average view duration, and session depth'
  };
}

type AiGrowthStudioProps = {
  auditPreview: AuditContext;
  hasPremium: boolean;
  idToken: string | null;
  onUnlock: () => void;
};

export function AiGrowthStudio({ auditPreview, hasPremium, idToken, onUnlock }: AiGrowthStudioProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [aiItems, setAiItems] = useState<string[]>([]);
  const [aiAction, setAiAction] = useState<AiGenerateAction>('rewrite_titles');
  /** Server-driven preview (no Bedrock) or client-only when logged out */
  const [teaserLocked, setTeaserLocked] = useState(true);
  const [clientOnly, setClientOnly] = useState(false);
  const submittingRef = useRef(false);

  const runGeneration = useCallback(
    async (action: AiGenerateAction, options?: { trackUsage?: boolean }) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setAiAction(action);
      setAiError('');
      setAiLoading(true);

      const input = buildRequestInput(auditPreview);
      const trackUsage = options?.trackUsage === true;

      try {
        if (!idToken) {
          setClientOnly(true);
          setTeaserLocked(true);
          setAiNotes('Preview generated from your audit context. Upgrade for live AI on AWS Bedrock.');
          setAiItems(buildClientPreviewItems(action, auditPreview));
          if (trackUsage) analytics.aiToolUsed(action);
          return;
        }

        setClientOnly(false);
        const response = await aiApi.generateStudio(idToken, { action, input });

        setAiNotes(response.notes);
        setAiItems(response.items ?? []);
        setTeaserLocked(!!(response.preview && response.locked));
        if (trackUsage) analytics.aiToolUsed(action);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed.';
        const isAuth = /401|unauthorized/i.test(message);
        if (isAuth) {
          setAiError('Session expired. Sign in again to use AI Growth Studio.');
          setAiItems([]);
          setAiNotes('');
          return;
        }

        if (hasPremium) {
          setAiError(message);
          setAiNotes('');
          setAiItems([]);
        } else {
          setAiError('');
          setTeaserLocked(true);
          setAiNotes('Could not reach AI services. Showing local preview.');
          setAiItems(buildClientPreviewItems(action, auditPreview));
          if (trackUsage) analytics.aiToolUsed(action);
        }
      } finally {
        setAiLoading(false);
        submittingRef.current = false;
      }
    },
    [auditPreview, hasPremium, idToken]
  );

  const autoRunDone = useRef(false);
  useEffect(() => {
    if (autoRunDone.current) return;
    autoRunDone.current = true;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runGeneration('rewrite_titles');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [runGeneration]);

  const showBlurOnIndex = (index: number) => {
    if (!teaserLocked && hasPremium && !clientOnly) return false;
    if (clientOnly || teaserLocked) return index >= 1;
    return false;
  };

  const badgeLabel = !idToken ? 'Preview' : hasPremium ? 'Pro' : 'Signed in';

  return (
    <section className="landing-section" id="ai-tools">
      <div className="container landing-container">
        <div className="landing-ai-studio-header">
          <span className={`landing-ai-studio-badge ${hasPremium ? 'is-paid' : 'is-preview'}`}>{badgeLabel}</span>
          <h2 className="landing-section-title">AI Growth Studio</h2>
          <p className="landing-section-sub">
            Conversion-ready titles, descriptions, keywords, patterns, and ideas — premium runs on AWS Bedrock with server-side access control.
          </p>
        </div>

        <div className="landing-ai-studio-panel">
          <div className="landing-ai-studio-actions">
            {(
              [
                ['rewrite_titles', 'Rewrite Titles'],
                ['improve_description', 'Improve Description'],
                ['keywords', 'Generate Keywords'],
                ['pattern', 'Find Winning Pattern'],
                ['ideas', 'Generate Video Ideas']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`landing-ai-studio-tab btn btn-secondary${aiAction === key ? ' is-active' : ''}`}
                disabled={aiLoading}
                onClick={() => runGeneration(key, { trackUsage: true })}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="landing-ai-studio-results">
            {aiLoading ? (
              <>
                <p className="muted">Generating…</p>
                <div className="landing-ai-skeleton-wrap" aria-hidden>
                  <div className="landing-ai-skeleton" />
                  <div className="landing-ai-skeleton" />
                  <div className="landing-ai-skeleton" />
                  <div className="landing-ai-skeleton" />
                </div>
              </>
            ) : aiError ? (
              <div className="landing-ai-error-panel">
                <p className="landing-demo-error" role="alert">
                  {aiError}
                </p>
                {hasPremium && (
                  <button type="button" className="btn btn-primary" onClick={() => runGeneration(aiAction, { trackUsage: true })}>
                    Retry
                  </button>
                )}
              </div>
            ) : aiItems.length > 0 ? (
              <>
                {aiNotes && <p className="landing-ai-notes">{aiNotes}</p>}
                <div className="landing-ai-result-grid">
                  {aiItems.map((item, index) => {
                    const blurred = showBlurOnIndex(index);
                    return (
                      <article key={`${aiAction}-${index}`} className="landing-ai-result-card">
                        <span className="landing-ai-result-index">#{index + 1}</span>
                        <div className={blurred ? 'landing-ai-blur-target' : undefined}>
                          <p>{item}</p>
                        </div>
                        {blurred && index === 1 && (teaserLocked || clientOnly) && (
                          <div className="landing-ai-result-lock-overlay">
                            <p>Unlock full AI results</p>
                            <button type="button" className="btn btn-primary btn-sm" onClick={onUnlock}>
                              Upgrade
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="landing-ai-result-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={aiLoading}
                    onClick={() => runGeneration(aiAction, { trackUsage: true })}
                  >
                    Regenerate
                  </button>
                  {!hasPremium && (
                    <button type="button" className="btn btn-primary" onClick={onUnlock}>
                      Unlock full AI access
                    </button>
                  )}
                </div>
                {(teaserLocked || clientOnly) && aiItems.length > 1 && (
                  <p className="landing-ai-unlock-hint muted">
                    {aiItems.length - 1} more {aiAction === 'rewrite_titles' ? 'title rewrites' : 'results'} in full unlock
                  </p>
                )}
              </>
            ) : (
              <p className="muted">Choose an action to generate your first result set.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
