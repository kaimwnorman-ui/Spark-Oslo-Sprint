// Generated art (KIE) with code-drawn placeholders; assets.json says which file each one uses.
import manifest from '../../assets/assets.json';

export type AssetName = keyof typeof manifest;

export function assetUrl(name: AssetName): string {
  return `assets/${manifest[name]}`;
}
