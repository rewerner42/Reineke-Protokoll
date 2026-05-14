export async function extractDominantColorFromDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const maxDim = 200;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas-Context nicht verfügbar.');
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const bins = 5;
  const step = 256 / bins;
  const buckets = new Map<
    string,
    { r: number; g: number; b: number; n: number; score: number }
  >();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // skip near-white, near-black, near-grey
    if (max - min < 25 && (max > 235 || max < 30)) continue;
    const saturation = max === 0 ? 0 : (max - min) / max;
    const brightness = max / 255;
    if (saturation < 0.08) continue;
    const key = `${Math.floor(r / step)},${Math.floor(g / step)},${Math.floor(b / step)}`;
    const score = 1 + saturation * 3 + (brightness > 0.2 && brightness < 0.95 ? 1 : 0);
    const cur = buckets.get(key);
    if (cur) {
      cur.r += r;
      cur.g += g;
      cur.b += b;
      cur.n += 1;
      cur.score += score;
    } else {
      buckets.set(key, { r, g, b, n: 1, score });
    }
  }

  let best: { r: number; g: number; b: number; n: number; score: number } | null = null;
  for (const v of buckets.values()) {
    if (!best || v.score > best.score) best = v;
  }
  if (!best) {
    // fallback: all-pixels average (excluding fully transparent)
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 128) continue;
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      n += 1;
    }
    if (n === 0) throw new Error('Logo enthält keine sichtbaren Pixel.');
    return rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
  }
  return rgbToHex(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo konnte nicht geladen werden.'));
    img.src = src;
  });
}
