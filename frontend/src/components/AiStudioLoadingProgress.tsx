import { useEffect, useMemo, useState } from 'react';
import type { AiGenerateAction } from '../types';

const ACTION_HEADLINES: Record<AiGenerateAction, string> = {
  rewrite_titles: 'Creating title ideas for your channel',
  improve_description: 'Improving your video description',
  keywords: 'Finding keywords your audience searches for',
  pattern: 'Finding what’s working in your niche',
  ideas: 'Generating video ideas for you'
};

type StatusStep = { until: number; text: string };

const PREMIUM_STATUS: StatusStep[] = [
  { until: 28, text: 'Reviewing your channel…' },
  { until: 78, text: 'Writing personalized suggestions…' },
  { until: 100, text: 'Almost ready…' }
];

const PREVIEW_STATUS: StatusStep[] = [{ until: 100, text: 'Building your preview…' }];

function statusForProgress(steps: StatusStep[], value: number): string {
  for (const step of steps) {
    if (value <= step.until) return step.text;
  }
  return steps[steps.length - 1]?.text ?? 'Working…';
}

/** Ease toward a ceiling so the bar keeps moving during longer runs without hitting 100% early. */
function easedProgress(elapsedMs: number, hasPremium: boolean): number {
  if (!hasPremium) {
    return Math.min(92, 18 + elapsedMs / 35);
  }
  const seconds = elapsedMs / 1000;
  if (seconds < 1.2) return 8 + seconds * 5;
  if (seconds < 8) return 14 + (seconds - 1.2) * 7.5;
  if (seconds < 22) return 58 + (seconds - 8) * 1.8;
  return Math.min(97, 83 + (seconds - 22) * 0.35);
}

export function AiStudioLoadingProgress({
  action,
  hasPremium,
  startedAtMs
}: {
  action: AiGenerateAction;
  hasPremium: boolean;
  startedAtMs: number;
}) {
  const statusSteps = hasPremium ? PREMIUM_STATUS : PREVIEW_STATUS;
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 160);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const progress = easedProgress(elapsedMs, hasPremium);
  const statusText = statusForProgress(statusSteps, progress);
  const headline = ACTION_HEADLINES[action];

  const hint = useMemo(() => {
    if (!hasPremium) return 'Your preview will appear in a moment.';
    if (elapsedMs < 12000) return 'Good ideas take a few seconds — hang tight.';
    return 'Still working — this usually finishes within about 20 seconds.';
  }, [elapsedMs, hasPremium]);

  return (
    <div className="landing-ai-progress" role="status" aria-live="polite" aria-busy="true">
      <p className="landing-ai-progress-title">{headline}</p>
      <p className="landing-ai-progress-status">{statusText}</p>

      <div className="landing-ai-progress-track" aria-hidden>
        <div className="landing-ai-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <p className="landing-ai-progress-hint muted">{hint}</p>
      <p className="sr-only">
        {headline}. {statusText} {Math.round(progress)} percent complete.
      </p>
    </div>
  );
}
