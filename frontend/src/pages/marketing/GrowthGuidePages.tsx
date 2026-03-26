import { Link } from 'react-router-dom';
import { BRAND } from '../../config/brand';
import { GROWTH_GUIDE_PAGES, type GrowthGuidePageDef } from '../../seo/growthGuides';

function GrowthGuideShell({ guide, children }: { guide: GrowthGuidePageDef; children: React.ReactNode }) {
  const related = GROWTH_GUIDE_PAGES.filter((g) => g.path !== guide.path);

  return (
    <div className="page narrow-page marketing-static growth-guide-page">
      <main>
      <article className="surface marketing-static-surface growth-guide-surface">
        <nav className="growth-guide-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="growth-guide-bc-sep" aria-hidden>
            /
          </span>
          <span className="growth-guide-bc-current">{guide.h1}</span>
        </nav>
        <p className="marketing-static-eyebrow">
          <Link to="/" className="marketing-static-back">
            ← {BRAND.name}
          </Link>
        </p>
        <h1>{guide.h1}</h1>
        <p className="marketing-static-lead">{guide.lead}</p>
        <div className="marketing-static-body growth-guide-body">{children}</div>

        <div className="growth-guide-related" aria-labelledby="related-guides-heading">
          <h2 className="growth-guide-related-title" id="related-guides-heading">
            Related guides
          </h2>
          <ul className="growth-guide-related-list">
            {related.map((g) => (
              <li key={g.path}>
                <Link to={g.path} className="growth-guide-related-link">
                  {g.cardTitle}
                </Link>
                <p className="growth-guide-related-snippet">{g.teaser}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="growth-guide-cta-panel">
          <p className="growth-guide-cta-lead">
            Ready to see what is holding your channel back? Run a free AI audit—no signup required.
          </p>
          <div className="growth-guide-cta-actions">
            <Link to="/#audit" className="btn btn-primary">
              Analyze your channel
            </Link>
            <Link to="/" className="btn btn-secondary growth-guide-cta-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </article>
      </main>
    </div>
  );
}

const guideByPath = Object.fromEntries(GROWTH_GUIDE_PAGES.map((g) => [g.path, g])) as Record<
  string,
  GrowthGuidePageDef
>;

export function WhyYourYoutubeHasNoViewsPage() {
  const guide = guideByPath['/why-your-youtube-has-no-views'];
  return (
    <GrowthGuideShell guide={guide}>
      <p>
        If you are publishing regularly and still seeing flat lines in YouTube Studio, the problem is rarely “the algorithm
        hates me.” It is usually a stack of predictable issues: your packaging does not win the click, your opening does not
        earn the watch, or your channel does not yet signal a clear reason to subscribe. The good news is that those
        problems are diagnosable—and once you name them, you can fix them in order instead of rewriting random titles every
        week.
      </p>
      <p>
        Before you change everything at once, separate symptoms from causes. Impressions without clicks point to{' '}
        <Link to="/youtube-thumbnail-mistakes">thumbnail and title fit</Link>. Clicks with immediate drop-off point to the
        hook, pacing, or a mismatch between what you promised and what the viewer sees first. Slow growth with decent
        retention may mean you need{' '}
        <Link to="/how-to-get-more-youtube-views">clearer topics and packaging for broader discovery</Link>. This page walks
        through the most common reasons videos stall—and how serious creators treat each one like a product decision, not a
        mystery.
      </p>

      <h2 className="growth-guide-h2">Weak titles hide good videos</h2>
      <p>
        Titles are not poetry; they are a contract with the viewer. The best titles make a specific promise in plain
        language: who the video is for, what they will learn or feel, and why now. Vague cleverness, keyword stuffing, or
        insider jargon often tanks CTR because the brain cannot map the promise in a split second. If your title could
        describe a hundred other videos, it will not stand out in search or browse.
      </p>
      <p>
        Test your titles with a simple bar: can a stranger predict the first major beat of the video in one line? If not,
        tighten the nouns and verbs. Swap abstractions (“ultimate guide,” “everything you need”) for concrete outcomes
        (“fix audio in 10 minutes,” “the mistake that costs you subscribers”). Strong titles also align with how people
        search—natural phrases beat robotic keyword chains—while still leaving room for curiosity when the thumbnail carries
        the emotion.
      </p>

      <h2 className="growth-guide-h2">Thumbnails quietly cap your CTR</h2>
      <p>
        YouTube can only recommend what people click. Even strong retention cannot save a thumbnail that loses every
        impression battle. The usual failure modes are clutter, low contrast, unreadable text, and faces or objects that do
        not read at phone size. Another subtle issue is emotional flatness: the image is “correct” but not compelling, so it
        blends into the feed.
      </p>
      <p>
        Your thumbnail should echo the title’s promise visually—often with one focal subject, one idea, and enough negative
        space that the eye knows where to look. If you suspect thumbnails are your bottleneck, read our guide on{' '}
        <Link to="/youtube-thumbnail-mistakes">YouTube thumbnail mistakes</Link> and iterate one variable at a time so Studio
        data stays interpretable.
      </p>

      <h2 className="growth-guide-h2">Low CTR and weak retention compound</h2>
      <p>
        Click-through rate tells you whether your packaging earns attention. Average view duration and retention curves tell
        you whether the video delivers after the click. When CTR is low, YouTube has little incentive to expand
        distribution. When CTR is fine but viewers vanish in the first 30 seconds, the platform learns the experience does
        not match the promise—so reach stalls even if the middle of the video is excellent.
      </p>
      <p>
        Fix sequencing deliberately: stabilize the hook and first minute before you chase radical format changes. A crisp
        cold open that states the payoff, shows proof, or frames the stakes usually outperforms a slow branded intro. If
        you edit with retention in mind, you are not dumbing the video down—you are respecting the viewer’s time, which is
        what the product rewards.
      </p>

      <h2 className="growth-guide-h2">Niche mismatch and unclear positioning</h2>
      <p>
        Sometimes the content is fine but the channel does not know what it is yet. Mixed topics, wildly different lengths,
        and inconsistent tones make it harder for YouTube to match you with the right audience—and harder for viewers to
        justify subscribing. If one video targets beginners and the next assumes expert knowledge, each upload resets
        expectations and weakens returning viewership.
      </p>
      <p>
        Tight positioning does not mean you can never experiment. It means you carry a recognizable spine across videos: a
        recurring problem you solve, a point of view, or a format viewers can recognize in the feed. When that spine is
        clear, titles and thumbnails become easier to write because you know exactly who you are speaking to.
      </p>

      <h2 className="growth-guide-h2">Lack of packaging strategy across the catalog</h2>
      <p>
        Growth is not only about the next upload. Channels often have older videos that still get impressions but underperform
        on CTR because the packaging is dated. Refreshing strategic titles and thumbnails—without changing the video—can
        unlock views you already earned the right to compete for. Conversely, chasing trends on every upload without a
        strategy creates a library that feels disjointed and trains no lasting audience habit.
      </p>
      <p>
        Think in systems: a repeatable research step for topics, a checklist for titles, a thumbnail template that still
        allows variety, and a simple review of last month’s outliers in Studio. Small process upgrades compound faster than
        one-off hacks. For a structured approach to the full funnel, see{' '}
        <Link to="/how-to-get-more-youtube-views">how to get more YouTube views</Link>.
      </p>

      <h2 className="growth-guide-h2">Proof, pacing, and the credibility gap</h2>
      <p>
        Some channels struggle because the idea is right but the delivery asks for trust too early. If you promise a
        transformation without showing credentials, process, or a quick win in the opening minute, viewers bounce—not because
        they dislike you, but because YouTube trained them to expect fast validation. Proof can be a result on screen, a
        before-and-after, a tight demo, or a crisp outline of what they will get by the end. Without that spine, even sharp
        titles and thumbnails cannot sustain a session.
      </p>
      <p>
        Pacing is part of proof. Long throat-clearing, repetitive disclaimers, and meandering stories before the payoff feel
        like broken packaging in motion. Edit for density: every line should either increase clarity, raise stakes, or move
        the viewer closer to the outcome you promised. When proof and pacing align with your{' '}
        <Link to="/youtube-thumbnail-mistakes">thumbnail’s emotional hook</Link>, retention graphs tend to smooth out—and
        that is when YouTube can justify pushing you beyond your core subscribers.
      </p>

      <h2 className="growth-guide-h2">Turn diagnosis into a prioritized plan</h2>
      <p>
        You do not need more guesswork—you need a clear read on where the funnel breaks for your specific channel. That is
        the point of {BRAND.name}: an AI-assisted audit that looks across your metadata, patterns, and opportunities like a
        growth analyst would, then hands you actionable fixes you can ship this week. When you know whether CTR, retention, or
        topic fit is the primary leak, you stop burning energy on the wrong lever.
      </p>
    </GrowthGuideShell>
  );
}

export function HowToGetMoreYoutubeViewsPage() {
  const guide = guideByPath['/how-to-get-more-youtube-views'];
  return (
    <GrowthGuideShell guide={guide}>
      <p>
        Getting more views is less about secrets and more about disciplined execution on a small set of levers: packaging
        that earns clicks, intros that retain viewers, topics that match demand, and a channel identity that makes
        subscriptions rational. Creators who grow steadily treat each upload as a test, read the data honestly, and refine
        templates rather than starting from zero every time.
      </p>
      <p>
        This guide outlines a practical framework you can apply without abandoning your voice. If you are also troubleshooting
        a stalled channel, pair it with{' '}
        <Link to="/why-your-youtube-has-no-views">why your YouTube has no views</Link> and our breakdown of{' '}
        <Link to="/youtube-thumbnail-mistakes">thumbnail mistakes</Link> so you are improving CTR and retention together—not
        trading one problem for another.
      </p>

      <h2 className="growth-guide-h2">Improve packaging before you chase production upgrades</h2>
      <p>
        Better cameras help, but packaging is what turns impressions into watches. Start with titles and thumbnails that make
        a single, legible promise. Ask whether your idea would make sense if muted and shown next to five competitors. If
        not, simplify the visual story and sharpen the language. Packaging is also where small word changes produce measurable
        CTR moves, which makes it the highest ROI surface for many channels.
      </p>
      <p>
        Work from a brief: audience, job-to-be-done, desired outcome, and proof you will show in the first minute. When that
        brief is explicit, you avoid generic titles that sound like everyone else in the niche. Strong packaging is
        consistent with the video’s first 30 seconds—if viewers feel baited, retention punishes you even if the click looked
        cheap to acquire.
      </p>

      <h2 className="growth-guide-h2">Write titles for humans and discovery</h2>
      <p>
        Effective titles balance clarity and curiosity. Clarity tells the viewer why the video matters; curiosity gives them
        a reason to choose yours instead of the adjacent result. Use concrete nouns, strong verbs, and specific numbers when
        they are honest. Avoid stacking buzzwords that dilute meaning—precision beats volume.
      </p>
      <p>
        For search-driven topics, include the phrase people type, but keep it conversational. For browse-heavy niches, lean on
        emotional contrast and stakes while still signaling the subject. Maintain a swipe file of titles that performed well
        for you and for peers; patterns will emerge in how your audience likes promises framed.
      </p>

      <h2 className="growth-guide-h2">Design thumbnails with a single focal idea</h2>
      <p>
        Thumbnails should read in a blink: one face or hero object, high contrast, minimal text, and an expression or visual
        that matches the emotional hook. If you use words, make them short and large enough for mobile. The thumbnail is not
        a summary of the video—it is an advertisement for the first minute.
      </p>
      <p>
        Iterate deliberately: change thumbnail or title, not both at once, and give the test enough impressions to be
        meaningful. If you want a focused checklist, see <Link to="/youtube-thumbnail-mistakes">YouTube thumbnail mistakes</Link>.
      </p>

      <h2 className="growth-guide-h2">Retention hooks beat clever cold opens</h2>
      <p>
        The opening should validate the click immediately: restate the payoff, show the end state, or preview the most
        compelling moment. Viewers decide fast whether to stay; meandering intros train them to leave. Use pattern interrupts
        sparingly but purposefully—jump cuts, tight music edits, or a bold line of voiceover that frames the problem.
      </p>
      <p>
        Watch your retention graph for cliffs. If people leave right when you pivot topics, your sections may need clearer
        signposting. If they leave during long tangents, tighten the edit. Retention work is unglamorous, but it is the
        multiplier on every impression you earn.
      </p>

      <h2 className="growth-guide-h2">Consistency builds compound growth</h2>
      <p>
        Consistency is not about daily uploads for everyone; it is about reliability your audience can trust. A sustainable
        cadence plus incremental improvement beats occasional spikes followed by silence. Consistency also helps you learn
        faster: more samples mean cleaner comparisons when you adjust titles, thumbnails, or format length.
      </p>
      <p>
        Protect production with systems: idea backlog, templated outlines, batch filming, and thumbnail drafts before you
        record. The goal is to remove friction from shipping so you can spend judgment on packaging and positioning—the
        parts that most directly affect views.
      </p>

      <h2 className="growth-guide-h2">Choose searchable topics when intent matters</h2>
      <p>
        Some channels win on browse; others win on search. If your niche has clear queries—“how to,” “best,” “vs,”
        troubleshooting phrases—intentional topic selection can bring stable inbound traffic. Match the video structure to the
        intent: tutorials should answer the question early; comparisons should state criteria up front.
      </p>
      <p>
        When you align topic, title, and thumbnail with a single intent, YouTube can match you to viewers who already want
        that outcome. That alignment is one reason packaging and research belong in the same conversation—not something you
        bolt on after filming.
      </p>
      <p>
        You can still be original within a searchable frame: your angle, examples, and production style differentiate you;
        the query anchors distribution. If a topic has multiple intents, pick one primary job-to-be-done per video instead
        of trying to serve beginners and experts in the same upload—split them, link them, and let each piece earn its own
        funnel.
      </p>

      <h2 className="growth-guide-h2">Use data to steer iteration</h2>
      <p>
        Let Studio tell you which problem to solve next: impressions with weak CTR, CTR with weak retention, or strong
        performance on one format that you have not doubled down on. Avoid global conclusions from single videos; look for
        patterns across your last ten uploads. Outliers teach you, but systems scale you.
      </p>
      <p>
        {BRAND.name} accelerates that read by surfacing weaknesses across your channel with AI-assisted analysis—titles,
        opportunities, and practical recommendations—so your next moves are prioritized instead of random. When you pair a
        clear framework with a fast diagnosis, getting more views becomes a process you can repeat.
      </p>

      <h2 className="growth-guide-h2">Series, playlists, and compounding watch time</h2>
      <p>
        Views do not have to come only from net-new topics. A coherent series—same promise, recognizable packaging, clear
        episode logic—helps viewers binge, which increases returning viewership and sends stronger interest signals than
        one-off random uploads. Playlists that match intent (“Start here,” “Advanced,” “Case studies”) make it easier for
        search users to stay on your channel instead of bouncing back to results.
      </p>
      <p>
        You still need each episode to win its own click, which is why titles and thumbnails remain the front door. Think of
        series as a distribution amplifier: they reward packaging that is consistent enough to recognize and specific enough
        to justify the next episode. If you are rebuilding momentum, one tight series with excellent hooks often outperforms a
        scattered slate of unrelated ideas.
      </p>
    </GrowthGuideShell>
  );
}

export function YoutubeThumbnailMistakesPage() {
  const guide = guideByPath['/youtube-thumbnail-mistakes'];
  return (
    <GrowthGuideShell guide={guide}>
      <p>
        Thumbnails are the fastest feedback loop in YouTube growth: they are tested on every impression. Small mistakes—busy
        layouts, muddy contrast, unreadable text—cap CTR and silently limit how far a video can spread. Strong thumbnails do
        not need elite design skills; they need clarity, emotion, and a tight link to the title’s promise.
      </p>
      <p>
        If your retention is decent but impressions do not convert, start here—and read{' '}
        <Link to="/why-your-youtube-has-no-views">why your YouTube has no views</Link> for the full funnel view. Thumbnails
        work best when paired with titles using the same framework we outline in{' '}
        <Link to="/how-to-get-more-youtube-views">how to get more YouTube views</Link>.
      </p>

      <h2 className="growth-guide-h2">Clutter competes with itself</h2>
      <p>
        When a thumbnail tries to show every idea in the video, the eye has nowhere to land. Multiple arrows, stickers, logos,
        and captions fight for attention and blur the message. The fix is subtraction: one hero subject, one emotional read,
        and optional short text only if it clarifies what the image cannot say alone.
      </p>
      <p>
        Step back and squint. If the composition does not read as a single story, keep removing elements until it does. Great
        thumbnails often feel almost empty compared to amateur work—that negative space is doing the job of focus.
      </p>

      <h2 className="growth-guide-h2">Unreadable text wastes the safest curiosity cue</h2>
      <p>
        Text can sharpen a hook, but tiny fonts, low contrast, and long phrases fail on mobile. If viewers cannot read words
        in a fraction of a second, those words become noise. Prefer two to four powerful words, high contrast, and a stroke or
        background plate if needed for legibility.
      </p>
      <p>
        Avoid repeating the entire title in the thumbnail. Echo one keyword or emotional phrase that complements the title
        instead of duplicating it. The pair should feel inevitable, not redundant.
      </p>

      <h2 className="growth-guide-h2">Weak contrast disappears in the feed</h2>
      <p>
        YouTube’s interface is dark; muddy mid-tones sink into the background. Push separation between subject and
        environment with lighting, color grading, or a simple vignette. Faces should have catchlights and readable eyes;
        products should have a clear edge against the backdrop.
      </p>
      <p>
        Test on a phone at arm’s length. If the subject does not pop within a second, increase contrast before you tweak
        anything else. Contrast is not “style”—it is visibility.
      </p>
      <p>
        Also watch midtone compression: heavy filmic grades look cinematic in isolation but can flatten thumbnails next to
        high-key competitors. A slight S-curve, local contrast on the subject, or a rim light in-camera often beats global
        filters that dim the entire frame.
      </p>

      <h2 className="growth-guide-h2">No emotional trigger, no reason to click</h2>
      <p>
        Information alone rarely wins browse. Viewers click when they feel curiosity, urgency, delight, or tension. Flat
        expressions and static poses read as low stakes. You do not need exaggerated faces—authentic emotion matched to the
        promise is enough. The thumbnail should pose a question the video answers.
      </p>
      <p>
        If you film yourself, capture stills during peaks of reaction rather than default neutral frames. If you use B-roll,
        pick the frame that implies motion or consequence. Emotion is the bridge between “I see it” and “I need to know.”
      </p>
      <p>
        Pair emotion with specificity: a shocked face next to vague text reads as clickbait, while the same expression next
        to a concrete object of failure or success reads as stakes. Your job is to telegraph the human reason someone should
        care in one glance—then let the title spell out the topic with precision.
      </p>

      <h2 className="growth-guide-h2">Bad composition hides the story</h2>
      <p>
        Cropping matters. Faces cut awkwardly at the chin, important objects clipped by the safe zone, or busy edges that
        collide with UI chrome all reduce clarity. Compose for the 16:9 frame but prioritize the center-weighted subject
        where mobile viewers focus first.
      </p>
      <p>
        Use leading room and eyelines to point toward the idea you want emphasized. If text sits on the image, balance it so
        it does not cover the focal point. Good composition feels obvious in retrospect—because nothing distracts from the
        one story you are telling.
      </p>

      <h2 className="growth-guide-h2">When the thumbnail breaks the title’s promise</h2>
      <p>
        CTR spikes that collapse in retention often trace to a packaging mismatch: the click was earned on a different premise
        than the video delivers. If the thumbnail implies a shocking outcome but the video rambles before addressing it,
        viewers leave. Alignment between title, thumbnail, and the first 30 seconds is non-negotiable.
      </p>
      <p>
        Treat title and thumbnail as one unit in critique sessions. Ask: would I feel misled if I clicked based only on these
        two assets? If yes, fix the creative before you blame the algorithm.
      </p>

      <h2 className="growth-guide-h2">Testing and iteration without muddy data</h2>
      <p>
        Improve thumbnails with discipline: one change per iteration when possible, enough time for impressions to accrue,
        and notes on what you learned. Avoid swapping multiple variables and declaring victory—Studio will not tell you which
        move mattered. Screenshots of before and after CTR at similar impression counts help you build intuition over
        months, not days.
      </p>
      <p>
        When you want a second opinion at channel scale, {BRAND.name} highlights weak spots in how your videos present in the
        feed—so you are not guessing which thumbnails to redraw first. Pair those insights with the fundamentals above and
        your CTR tests become targeted repairs instead of random redesigns.
      </p>

      <h2 className="growth-guide-h2">Safe zones, overlays, and the real preview frame</h2>
      <p>
        Thumbnails are judged inside a busy UI: duration badges, watch-later icons, and autoplay previews all compete for
        attention. Keep critical faces and text out of the extreme corners where overlays appear on some surfaces, and assume
        a portion of your composition will be visually “noisy” once the platform chrome arrives. If your focal point sits
        where YouTube draws timestamps, you lose contrast exactly where viewers glance first.
      </p>
      <p>
        Preview your thumbnail at the size it appears in search on a phone, not only at full resolution in Photoshop or
        Figma. Compression and sharpening change edge contrast; subtle glows can turn into mush. A thumbnail that looks
        crisp on a desktop monitor but muddy on cellular data will underperform no matter how strong the idea is. Build for
        the smallest canvas first, then scale up—especially if your audience skews mobile, which is most channels on
        YouTube.
      </p>
    </GrowthGuideShell>
  );
}
