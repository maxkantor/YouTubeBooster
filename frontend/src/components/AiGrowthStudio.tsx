import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi } from '../lib/api';
import { analytics } from '../lib/analytics';
import type { AiGenerateAction } from '../types';
import { AiStudioLoadingProgress } from './AiStudioLoadingProgress';

type AuditContext = {
  channelLabel: string;
  titleOriginal: string;
  keywords: string[];
  opportunities: Array<{ id: string; output: string[] }>;
};

type StudioResult = {
  notes: string;
  items: string[];
  teaserLocked: boolean;
  clientOnly: boolean;
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

function applyResult(
  result: StudioResult,
  setters: {
    setAiNotes: (v: string) => void;
    setAiItems: (v: string[]) => void;
    setTeaserLocked: (v: boolean) => void;
    setClientOnly: (v: boolean) => void;
  }
) {
  setters.setAiNotes(result.notes);
  setters.setAiItems(result.items);
  setters.setTeaserLocked(result.teaserLocked);
  setters.setClientOnly(result.clientOnly);
}

type AiGrowthStudioProps = {
  auditPreview: AuditContext;
  hasPremium: boolean;
  /** Wait for Cognito/session bootstrap before the first AI request. */
  authLoading?: boolean;
  idToken: string | null;
  onUnlock: () => void;
};

export function AiGrowthStudio({ auditPreview, hasPremium, authLoading = false, idToken, onUnlock }: AiGrowthStudioProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingStartedAtMs, setLoadingStartedAtMs] = useState<number | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [aiItems, setAiItems] = useState<string[]>([]);
  const [aiAction, setAiAction] = useState<AiGenerateAction>('rewrite_titles');
  const [teaserLocked, setTeaserLocked] = useState(true);
  const [clientOnly, setClientOnly] = useState(false);
  const [resultCache, setResultCache] = useState<Partial<Record<AiGenerateAction, StudioResult>>>({});
  const resultCacheRef = useRef(resultCache);
  resultCacheRef.current = resultCache;
  const submittingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);

  const setters = { setAiNotes, setAiItems, setTeaserLocked, setClientOnly };

  const runGeneration = useCallback(
    async (action: AiGenerateAction, options?: { trackUsage?: boolean; force?: boolean }) => {
      const force = options?.force === true;
      const cached = resultCacheRef.current[action];
      if (!force && cached) {
        setAiAction(action);
        setAiError('');
        applyResult(cached, setters);
        return;
      }

      if (submittingRef.current) {
        abortRef.current?.abort();
      }

      const requestGen = ++requestGenRef.current;
      submittingRef.current = true;
      abortRef.current = new AbortController();
      setAiAction(action);
      setAiError('');
      setAiLoading(true);
      setLoadingStartedAtMs(Date.now());

      const input = buildRequestInput(auditPreview);
      const trackUsage = options?.trackUsage === true;

      try {
        if (!idToken) {
          const result: StudioResult = {
            notes: 'Preview generated from your audit context. Upgrade for live AI on AWS Bedrock.',
            items: buildClientPreviewItems(action, auditPreview),
            teaserLocked: true,
            clientOnly: true
          };
          if (requestGen !== requestGenRef.current) return;
          applyResult(result, setters);
          setResultCache((prev) => ({ ...prev, [action]: result }));
          if (trackUsage) analytics.aiToolUsed(action);
          return;
        }

        const response = await aiApi.generateStudio(idToken, { action, input }, abortRef.current.signal);

        if (requestGen !== requestGenRef.current) return;

        const result: StudioResult = {
          notes: response.notes,
          items: response.items ?? [],
          teaserLocked: hasPremium ? false : !!(response.preview && response.locked),
          clientOnly: false
        };
        applyResult(result, setters);
        setResultCache((prev) => ({ ...prev, [action]: result }));
        if (trackUsage) analytics.aiToolUsed(action);
      } catch (err) {
        if (requestGen !== requestGenRef.current) return;
        if (err instanceof Error && err.name === 'AbortError') return;

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
          const result: StudioResult = {
            notes: 'Could not reach AI services. Showing local preview.',
            items: buildClientPreviewItems(action, auditPreview),
            teaserLocked: true,
            clientOnly: false
          };
          setAiError('');
          applyResult(result, setters);
          setResultCache((prev) => ({ ...prev, [action]: result }));
          if (trackUsage) analytics.aiToolUsed(action);
        }
      } finally {
        if (requestGen === requestGenRef.current) {
          setAiLoading(false);
          setLoadingStartedAtMs(null);
          submittingRef.current = false;
          abortRef.current = null;
        }
      }
    },
    [auditPreview, hasPremium, idToken]
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    setResultCache({});
  }, [auditPreview.channelLabel, idToken, hasPremium]);

  useEffect(() => {
    if (authLoading) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runGeneration('rewrite_titles');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [authLoading, idToken, hasPremium, runGeneration]);

  const showBlurOnIndex = (index: number) => {
    if (hasPremium) return false;
    if (clientOnly || teaserLocked) return index >= 1;
    return false;
  };

  const badgeLabel = !idToken ? 'Preview' : hasPremium ? 'Pro' : 'Signed in';
  const showResults = aiItems.length > 0;
  const isLivePremium = !!(idToken && hasPremium);

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
                className={`landing-ai-studio-tab btn btn-secondary${aiAction === key ? ' is-active' : ''}${aiLoading && aiAction === key ? ' is-loading' : ''}`}
                disabled={aiLoading && aiAction === key}
                aria-busy={aiLoading && aiAction === key}
                onClick={() => runGeneration(key, { trackUsage: true })}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`landing-ai-studio-results${aiLoading ? ' is-loading' : ''}`}>
            {aiLoading && loadingStartedAtMs != null && (
              <AiStudioLoadingProgress action={aiAction} hasPremium={isLivePremium} startedAtMs={loadingStartedAtMs} />
            )}

            {!aiLoading && aiError ? (
              <div className="landing-ai-error-panel">
                <p className="landing-demo-error" role="alert">
                  {aiError}
                </p>
                {hasPremium && (
                  <button type="button" className="btn btn-primary" onClick={() => runGeneration(aiAction, { trackUsage: true, force: true })}>
                    Retry
                  </button>
                )}
              </div>
            ) : showResults ? (
              <div className={`landing-ai-results-body${aiLoading ? ' is-dimmed' : ''}`}>
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
                        {blurred && index === 1 && !hasPremium && (teaserLocked || clientOnly) && !aiLoading && (
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
                    onClick={() => runGeneration(aiAction, { trackUsage: true, force: true })}
                  >
                    Regenerate
                  </button>
                  {!hasPremium && (
                    <button type="button" className="btn btn-primary" onClick={onUnlock} disabled={aiLoading}>
                      Unlock full AI access
                    </button>
                  )}
                </div>
                {(teaserLocked || clientOnly) && aiItems.length > 1 && (
                  <p className="landing-ai-unlock-hint muted">
                    {aiItems.length - 1} more {aiAction === 'rewrite_titles' ? 'title rewrites' : 'results'} in full unlock
                  </p>
                )}
              </div>
            ) : !aiLoading ? (
              <p className="muted">Choose an action to generate your first result set.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
