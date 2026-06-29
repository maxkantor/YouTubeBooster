/** Frosted glass depth orbs — abstract creator motifs, never literal branding. */

export function CinematicGlassOrbs() {
  return (
    <div className="cinematic-glass-orbs" aria-hidden>
      {/* Analytics bars — upper right */}
      <div
        className="cinematic-glass-orbs__orb cinematic-glass-orbs__orb--chart"
        style={{ ['--orb-dur' as string]: '54s', ['--orb-delay' as string]: '0s' }}
      >
        <svg viewBox="0 0 96 96" aria-hidden>
          <rect x="4" y="4" width="88" height="88" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          <rect x="24" y="52" width="12" height="28" rx="4" fill="rgba(109,93,246,0.45)" />
          <rect x="42" y="38" width="12" height="42" rx="4" fill="rgba(127,92,255,0.55)" />
          <rect x="60" y="28" width="12" height="52" rx="4" fill="rgba(59,130,246,0.4)" />
        </svg>
      </div>

      {/* AI sparkle — mid right */}
      <div
        className="cinematic-glass-orbs__orb cinematic-glass-orbs__orb--spark"
        style={{ ['--orb-dur' as string]: '48s', ['--orb-delay' as string]: '-12s' }}
      >
        <svg viewBox="0 0 80 80" aria-hidden>
          <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <path
            d="M40 16 L42.5 32 L58 35 L42.5 38 L40 54 L37.5 38 L22 35 L37.5 32 Z"
            fill="rgba(127,92,255,0.4)"
          />
        </svg>
      </div>

      {/* Abstract video tile — upper left */}
      <div
        className="cinematic-glass-orbs__orb cinematic-glass-orbs__orb--tile"
        style={{ ['--orb-dur' as string]: '58s', ['--orb-delay' as string]: '-6s' }}
      >
        <svg viewBox="0 0 96 96" aria-hidden>
          <rect x="4" y="4" width="88" height="88" rx="24" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
          <rect x="18" y="22" width="60" height="40" rx="8" fill="rgba(109,93,246,0.12)" stroke="rgba(127,92,255,0.2)" strokeWidth="0.75" />
          <polygon points="42,32 42,52 58,42" fill="rgba(127,92,255,0.35)" />
        </svg>
      </div>

      {/* Thumbnail grid — lower left */}
      <div
        className="cinematic-glass-orbs__orb cinematic-glass-orbs__orb--grid"
        style={{ ['--orb-dur' as string]: '62s', ['--orb-delay' as string]: '-18s' }}
      >
        <svg viewBox="0 0 112 84" aria-hidden>
          <rect x="2" y="2" width="48" height="34" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
          <rect x="58" y="2" width="48" height="34" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
          <rect x="2" y="44" width="48" height="34" rx="8" fill="rgba(109,93,246,0.08)" stroke="rgba(109,93,246,0.14)" />
          <rect x="58" y="44" width="48" height="34" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
        </svg>
      </div>
    </div>
  );
}
