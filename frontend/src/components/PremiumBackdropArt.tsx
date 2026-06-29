/** Abstract glass shapes — felt in periphery, never literal UI chrome. */

export function PremiumBackdropArt() {
  return (
    <div className="cinematic-bg__shapes-inner">
      {/* Play — upper left */}
      <div className="cinematic-bg__glass cinematic-bg__glass--play" style={{ ['--glass-dur' as string]: '58s', ['--glass-delay' as string]: '0s' }}>
        <svg viewBox="0 0 80 80" aria-hidden>
          <rect x="8" y="8" width="64" height="64" rx="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <path d="M34 26 L34 54 L54 40 Z" fill="rgba(109,93,246,0.35)" />
        </svg>
      </div>

      {/* Analytics bars — upper right */}
      <div className="cinematic-bg__glass cinematic-bg__glass--chart" style={{ ['--glass-dur' as string]: '52s', ['--glass-delay' as string]: '-8s' }}>
        <svg viewBox="0 0 80 80" aria-hidden>
          <rect x="8" y="8" width="64" height="64" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <rect x="22" y="44" width="10" height="22" rx="3" fill="rgba(59,130,246,0.4)" />
          <rect x="36" y="32" width="10" height="34" rx="3" fill="rgba(109,93,246,0.45)" />
          <rect x="50" y="24" width="10" height="42" rx="3" fill="rgba(127,92,255,0.5)" />
        </svg>
      </div>

      {/* Sparkle / AI — mid right */}
      <div className="cinematic-bg__glass cinematic-bg__glass--spark" style={{ ['--glass-dur' as string]: '48s', ['--glass-delay' as string]: '-14s' }}>
        <svg viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          <path
            d="M32 14 L34.5 28.5 L49 31 L34.5 33.5 L32 48 L29.5 33.5 L15 31 L29.5 28.5 Z"
            fill="rgba(127,92,255,0.35)"
          />
        </svg>
      </div>

      {/* Thumbnail grid hint — lower left */}
      <div className="cinematic-bg__glass cinematic-bg__glass--grid" style={{ ['--glass-dur' as string]: '62s', ['--glass-delay' as string]: '-20s' }}>
        <svg viewBox="0 0 96 72" aria-hidden>
          <rect x="4" y="4" width="40" height="28" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <rect x="52" y="4" width="40" height="28" rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" />
          <rect x="4" y="40" width="40" height="28" rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" />
          <rect x="52" y="40" width="40" height="28" rx="6" fill="rgba(109,93,246,0.08)" stroke="rgba(109,93,246,0.15)" />
        </svg>
      </div>
    </div>
  );
}
