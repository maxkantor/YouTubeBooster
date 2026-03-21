/**
 * Client-side validation for "analyze this channel" inputs before navigating to /demo or /dashboard/channel.
 */

const HANDLE_TAIL = '[A-Za-z0-9._-]{2,63}';

/** Reject keyboard-mash style strings (long runs of consonants). */
function hasLongConsonantRun(lettersOnly: string, maxRun: number): boolean {
  if (lettersOnly.length < 8) return false;
  let run = 0;
  for (const ch of lettersOnly) {
    const isVowel = /[aeiou]/i.test(ch);
    if (!isVowel) {
      run++;
      if (run >= maxRun) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

export type ChannelInputValidation =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

/**
 * Accepts:
 * - Full YouTube channel URLs (youtube.com / www / m, etc.)
 * - @handles
 * - Bare handles / channel-style ids (with a consonant-run check to catch obvious typos)
 */
export function validateYouTubeChannelInput(raw: string): ChannelInputValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: 'Enter a channel URL or @handle.' };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let u: URL;
    try {
      u = new URL(trimmed);
    } catch {
      return { ok: false, message: "That URL isn't valid. Paste a full YouTube channel link." };
    }

    const host = u.hostname.toLowerCase();
    const isYoutube =
      host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
    if (!isYoutube) {
      return { ok: false, message: 'Use a YouTube link (e.g. https://www.youtube.com/@YourChannel).' };
    }

    if (host === 'youtu.be') {
      return { ok: false, message: 'Use a channel page link, not a short youtu.be video link.' };
    }

    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' && !u.search) {
      return {
        ok: false,
        message: 'Open your channel page on YouTube and copy the full URL (it should include @handle or /channel/).'
      };
    }

    // Video/watch links are usually not what we want for "channel" analysis entry.
    if (/^\/(watch|shorts|embed|live)(\/|$)/i.test(path)) {
      return {
        ok: false,
        message: 'Paste your channel URL (Profile page), not a single video or Shorts link.'
      };
    }

    return { ok: true, normalized: trimmed };
  }

  if (trimmed.startsWith('@')) {
    if (!new RegExp(`^@${HANDLE_TAIL}$`).test(trimmed)) {
      return {
        ok: false,
        message: 'After @, use your channel handle (letters, numbers, dots, underscores, or hyphens).'
      };
    }
    return { ok: true, normalized: trimmed };
  }

  // Bare handle / channel id style (no URL, no @)
  const bareOk =
    /^[A-Za-z0-9][A-Za-z0-9._-]{1,62}[A-Za-z0-9]$/.test(trimmed) || /^[A-Za-z0-9]{3,64}$/.test(trimmed);
  if (!bareOk) {
    return {
      ok: false,
      message:
        'Enter a full YouTube channel URL, an @handle (e.g. @YourChannel), or a plain handle using letters, numbers, . _ -'
    };
  }

  const lettersOnly = trimmed.replace(/[^a-z]/gi, '');
  if (lettersOnly.length >= 8 && hasLongConsonantRun(lettersOnly, 5)) {
    return {
      ok: false,
      message: 'That doesn’t look like a channel name. Paste your channel URL from YouTube or use @YourHandle.'
    };
  }

  return { ok: true, normalized: trimmed };
}
