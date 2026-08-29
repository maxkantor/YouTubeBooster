import { useEffect, useMemo, useState } from 'react';
import type { AiGenerateAction } from '../types';

const ACTION_LABELS: Record<AiGenerateAction, string> = {
  rewrite_titles: 'title rewrites',
  improve_description: 'description improvements',
  keywords: 'keyword phrases',
  pattern: 'winning patterns',
  ideas: 'video ideas'
};

type Stage = { id: string; label: string; cap: number };

const LIVE_STAGES: Stage[] = [
  { id: 'context', label: 'Reading your channel context', cap: 14 },
  { id: 'bedrock', label: 'Generating with AWS Bedrock', cap: 86 },
  { id: 'format', label: 'Formatting strategist output', cap: 97 }
];

const PREVIEW_STAGES: Stage[] = [
  { id: 'preview', label: 'Building preview from your audit', cap: 92 }
];

function stageForProgress(stages: Stage[], value: number): number {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (value >= (i === 0 ? 0 : stages[i - 1].cap)) return i;
  }
  return 0;
}

/** Ease toward a ceiling so the bar keeps moving during long Bedrock calls without hitting 100% early. */
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
  const stages = hasPremium ? LIVE_STAGES : PREVIEW_STAGES;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 160);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const progress = easedProgress(elapsedMs, hasPremium);
  const stageIndex = stageForProgress(stages, progress);
  const activeStage = stages[stageIndex];
  const elapsedSec = (elapsedMs / 1000).toFixed(1);
  const actionLabel = ACTION_LABELS[action];

  const hint = useMemo(() => {
    if (!hasPremium) return 'Preview is instant on-device — live Pro runs use Bedrock.';
    if (elapsedMs < 4000) return 'First live run can take a few seconds while the model warms up.';
    if (elapsedMs < 12000) return 'Still working — strategist JSON output takes longer than a chat reply.';
    return 'Almost there — large strategist outputs can take up to ~20s.';
  }, [elapsedMs, hasPremium]);

  return (
    <div className="landing-ai-progress" role="status" aria-live="polite" aria-busy="true">
      <div className="landing-ai-progress-head">
        <p className="landing-ai-progress-title">Generating {actionLabel}…</p>
        <span className="landing-ai-progress-elapsed">{elapsedSec}s</span>
      </div>

      <div className="landing-ai-progress-track" aria-hidden>
        <div className="landing-ai-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <ol className="landing-ai-progress-stages">
        {stages.map((stage, index) => {
          const done = index < stageIndex;
          const active = index === stageIndex;
          return (
            <li
              key={stage.id}
              className={`landing-ai-progress-stage${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
            >
              <span className="landing-ai-progress-stage-dot" aria-hidden />
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>

      <p className="landing-ai-progress-hint muted">{hint}</p>
      <p className="sr-only">
        {activeStage.label}. {Math.round(progress)} percent complete. Elapsed {elapsedSec} seconds.
      </p>
    </div>
  );
}
