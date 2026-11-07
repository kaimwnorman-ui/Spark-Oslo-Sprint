// Generated art (KIE) with code-drawn placeholders (SPEC §4). assets.json says which file each
// asset uses; if a webp fails to load at runtime, its SVG placeholder shows instead.
import manifest from '../../assets/assets.json';

export type AssetName = keyof typeof manifest;

export function assetUrl(name: AssetName): string {
  return `assets/${manifest[name]}`;
}

function placeholderUrl(name: AssetName): string {
  return `assets/${name}.svg`;
}

/** For style.backgroundImage: the art on top, the placeholder underneath. */
export function assetBackground(name: AssetName): string {
  const art = assetUrl(name);
  const fallback = placeholderUrl(name);
  return art === fallback ? `url(${art})` : `url(${art}), url(${fallback})`;
}

export function assetImg(name: AssetName, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.src = assetUrl(name);
  img.addEventListener('error', () => {
    if (!img.src.endsWith('.svg')) img.src = placeholderUrl(name);
  });
  return img;
}
