import { Link } from 'react-router-dom';
import { MarketingStaticPage } from './pages/marketing/MarketingStaticPage';

export function PlatformPage() {
  return (
    <MarketingStaticPage
      title="Platform"
      description="Understand how the YouTubeBooster AI platform helps creators audit channel performance, packaging, discoverability, and next-step growth decisions."
    >
      <h2 className="marketing-static-h2">What the platform does</h2>
      <p>
        YouTubeBooster AI is built to help creators understand why a channel is not
        growing, where clicks are being lost, and which publishing decisions deserve
        attention first. The platform is not designed as a bloated creator stack. It is
        meant to turn YouTube data, packaging signals, and content patterns into a more
        usable growth diagnosis.
      </p>

      <h2 className="marketing-static-h2">AI YouTube channel audits</h2>
      <p>
        The audit layer focuses on the problems creators actually need to solve: why
        impressions are not turning into views, why certain uploads stall, and where the
        channel may be sending weak signals through topic selection, titles, thumbnails,
        or pacing. Instead of throwing a dashboard full of disconnected numbers at you,
        the goal is to make the likely bottleneck easier to see.
      </p>

      <h2 className="marketing-static-h2">CTR + retention analysis</h2>
      <p>
        Growth usually breaks at a few predictable points. A video may be getting
        impressions but not earning the click. It may get clicks but lose viewers too
        early. Or it may attract the wrong audience because the promise and delivery do
        not line up. The platform reviews those click and retention patterns together so
        creators can decide whether the next fix belongs in packaging, script structure,
        or content positioning.
      </p>

      <h2 className="marketing-static-h2">Thumbnail optimization</h2>
      <p>
        Thumbnail feedback is built around clarity, contrast, emotional readability, and
        how well the image supports the title promise. This matters because many channels
        do not have a content problem first. They have a feed presentation problem that
        makes solid videos look easier to skip than the competition around them.
      </p>

      <h2 className="marketing-static-h2">SEO and discoverability</h2>
      <p>
        YouTube SEO inside the platform is focused on discoverability that still sounds
        natural to a real viewer. That includes clearer topic framing, better keyword
        alignment, stronger title language, and a more deliberate connection between what
        people search for and what the video actually delivers. The point is not keyword
        stuffing. The point is better audience matching.
      </p>

      <h2 className="marketing-static-h2">Creator-focused workflow</h2>
      <p>
        The workflow is designed for solo creators and small teams who need practical
        feedback quickly. You should be able to review likely growth blockers, understand
        what matters most right now, and move into the next upload with a clearer plan
        instead of spending hours translating analytics into action by yourself.
      </p>

      <h2 className="marketing-static-h2">AI Growth Studio tools</h2>
      <p>
        The AI Growth Studio expands that diagnosis into creator tasks such as title
        direction, packaging ideas, keyword opportunities, and improvement prompts for
        future uploads. It is there to support execution after the audit, not to bury the
        user in more noise. The strongest creator tools reduce hesitation around what to
        do next.
      </p>

      <h2 className="marketing-static-h2">One-time unlock model</h2>
      <p>
        YouTubeBooster AI follows a one-time unlock model for the full growth report. The
        idea is simple: creators should be able to run the preview, decide whether the
        analysis is useful, and pay once if they want the deeper recommendations and
        saved report experience. No subscription pressure is required to make the product
        useful.
      </p>

      <h2 className="marketing-static-h2">Free audit preview</h2>
      <p>
        The free preview exists so creators can test the platform before committing. That
        keeps the experience grounded in signal quality rather than hype. If the preview
        surfaces real problems around YouTube CTR, retention, thumbnail optimization, or
        discoverability, then the full report becomes much easier to evaluate honestly.
      </p>

      <div className="marketing-static-cta">
        <h2 className="marketing-static-h2">Ready to see what your channel is missing?</h2>
        <p>
          Start with the free preview and see how the platform reads your YouTube SEO,
          packaging, retention, and content positioning before you unlock the full report.
        </p>
        <Link to="/#audit" className="btn btn-primary">
          Run Free Channel Audit
        </Link>
      </div>
    </MarketingStaticPage>
  );
}
