// Source URLs come only from links actually on the page (SPEC §11): anything else is dropped.
import type { Lesson, PageLink } from '../../shared/types.ts';

/** Exact match after dropping the fragment and a trailing slash. */
export function normaliseUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    let text = url.href;
    if (text.endsWith('/')) text = text.slice(0, -1);
    return text;
  } catch {
    return null;
  }
}

/** Sets sourceUrl/sourceTitle to null for every idea whose URL is not in the page's link list. */
export function keepPageLinksOnly(lesson: Lesson, links: readonly PageLink[]): Lesson {
  const allowed = new Map<string, PageLink>();
  for (const link of links) {
    const key = normaliseUrl(link.href);
    if (key) allowed.set(key, link);
  }
  return {
    ...lesson,
    ideas: lesson.ideas.map((idea) => {
      const key = idea.sourceUrl ? normaliseUrl(idea.sourceUrl) : null;
      const link = key ? allowed.get(key) : undefined;
      return link
        ? { ...idea, sourceUrl: link.href, sourceTitle: idea.sourceTitle || link.text }
        : { ...idea, sourceUrl: null, sourceTitle: null };
    }),
  };
}
