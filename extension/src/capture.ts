// Reads a page the way Spark needs it (SPEC §13): readable text (nav, footer and scripts
// stripped, max 6,000 words), the link list (max 200) and up to 300 visible word boxes.
// Used by the content script on real pages and by the game for demo pages.
import { MAX_LINKS, MAX_PAGE_WORDS, MAX_WORD_POSITIONS } from '../../shared/config.ts';
import type { PageCapture, PageLink, WordBox } from '../../shared/types.ts';

const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dd, dt, figcaption, summary';
const SKIP = 'nav, footer, header, aside, script, style, noscript, form, button, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"], [hidden]';

function readableRoot(doc: Document): Element {
  return doc.querySelector('article') ?? doc.querySelector('main') ?? doc.querySelector('[role="main"]') ?? doc.body;
}

function isSkipped(el: Element): boolean {
  return !!el.closest(SKIP);
}

function readableBlocks(root: Element): Element[] {
  const blocks = [...root.querySelectorAll(BLOCKS)].filter((el) => !isSkipped(el));
  // Keep only the outermost readable blocks (a <p> inside an <li> is counted once).
  return blocks.filter((el) => !blocks.some((other) => other !== el && other.contains(el)));
}

function capWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  return words.length <= max ? text : words.slice(0, max).join(' ');
}

function linksIn(nodes: Iterable<HTMLAnchorElement>, base: string): PageLink[] {
  const seen = new Set<string>();
  const out: PageLink[] = [];
  for (const a of nodes) {
    if (isSkipped(a)) continue;
    let href: string;
    try {
      href = new URL(a.getAttribute('href') ?? '', base).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(href) || seen.has(href)) continue;
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    seen.add(href);
    out.push({ text: text.slice(0, 160), href });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/** Visible word boxes inside the given elements (or range), in viewport pixels. */
function wordBoxes(doc: Document, win: Window, containers: Element[], range: Range | null): WordBox[] {
  const boxes: WordBox[] = [];
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  const word = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  const scan = (root: Node) => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && boxes.length < MAX_WORD_POSITIONS; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || isSkipped(parent)) continue;
      if (range && !range.intersectsNode(node)) continue;
      const style = win.getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const size = parseFloat(style.fontSize) || 16;
      const font = style.fontFamily.slice(0, 200);
      const weight = parseInt(style.fontWeight, 10) || 400;
      const text = node.textContent ?? '';
      for (const m of text.matchAll(word)) {
        if (boxes.length >= MAX_WORD_POSITIONS) break;
        const r = doc.createRange();
        r.setStart(node, m.index!);
        r.setEnd(node, m.index! + m[0].length);
        const rect = r.getClientRects()[0];
        if (!rect || rect.width <= 0 || rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;
        boxes.push({ text: m[0], x: rect.left, y: rect.top, w: rect.width, h: rect.height, size, font, weight });
      }
    }
  };
  for (const c of containers) {
    if (boxes.length >= MAX_WORD_POSITIONS) break;
    scan(c);
  }
  return boxes;
}

/** Captures the selection when there is one (an AI answer), else the page's main text. */
export function capturePage(doc: Document, win: Window): PageCapture {
  const selection = win.getSelection();
  const selected = selection && !selection.isCollapsed ? selection.toString().trim() : '';
  const base = doc.baseURI;
  if (selected.split(/\s+/).length >= 12 && selection) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement!;
    const anchors = [...container.querySelectorAll('a')].filter((a) => range.intersectsNode(a));
    return {
      source: 'selection',
      url: doc.location?.href ?? base,
      title: doc.title,
      text: capWords(selected, MAX_PAGE_WORDS),
      links: linksIn(anchors, base),
      boxes: wordBoxes(doc, win, [container], range),
      viewport: { w: win.innerWidth, h: win.innerHeight },
    };
  }
  const root = readableRoot(doc);
  const blocks = readableBlocks(root);
  const text = blocks.map((b) => (b as HTMLElement).innerText ?? b.textContent ?? '').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
  return {
    source: 'page',
    url: doc.location?.href ?? base,
    title: doc.title,
    text: capWords(text, MAX_PAGE_WORDS),
    links: linksIn(root.querySelectorAll('a'), base),
    boxes: wordBoxes(doc, win, blocks, null),
    viewport: { w: win.innerWidth, h: win.innerHeight },
  };
}
