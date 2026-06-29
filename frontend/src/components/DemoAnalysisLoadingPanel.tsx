import { useEffect, useState } from 'react';

const ANALYSIS_STEPS = [
  'Fetching public channel data',
  'Analyzing videos and engagement',
  'Building growth recommendations'
] as const;

type DemoAnalysisLoadingPanelProps = {
  channelLabel?: string;
  compact?: boolean;
};

export function DemoAnalysisLoadingPanel({ channelLabel, compact = false }: DemoAnalysisLoadingPanelProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStepIndex((prev) => (prev + 1) % ANALYSIS_STEPS.length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`dashboard-analysis-loading${compact ? ' dashboard-analysis-loading-compact' : ''}`} role="status" aria-live="polite">
      <p className="dashboard-analysis-loading-title">
        {channelLabel ? `Analyzing ${channelLabel}` : 'Analyzing your channel'}
      </p>
      <ol className="dashboard-analysis-loading-steps">
        {ANALYSIS_STEPS.map((step, index) => (
          <li
            key={step}
            className={
              index < stepIndex ? 'is-done' : index === stepIndex ? 'is-active' : undefined
            }
          >
            {step}
          </li>
        ))}
      </ol>
      <p className="muted dashboard-analysis-loading-hint">This usually takes under a minute.</p>
    </div>
  );
}
