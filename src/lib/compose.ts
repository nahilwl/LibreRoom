/** Small canvas and mask helpers shared by rendering, editing and file I/O. */

export type BackgroundState =
  | { type: "transparent" }
  | { type: "color"; color: string }
  | { type: "image"; blob: Blob; bitmap: ImageBitmap };

export function newCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Reads the alpha channel of a mask canvas (one byte per pixel). */
export function maskAlpha(mask: HTMLCanvasElement): Uint8ClampedArray {
  const px = mask.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, mask.width, mask.height).data;
  const alpha = new Uint8ClampedArray(mask.width * mask.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
  return alpha;
}

export function maskFromAlpha(alpha: Uint8ClampedArray, w: number, h: number) {
  const c = newCanvas(w, h);
  const img = new ImageData(w, h);
  for (let i = 0; i < alpha.length; i++) img.data[i * 4 + 3] = alpha[i];
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}
