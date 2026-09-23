// Pure geometry. Limits follow the model sizing table checked on 2026-09-23.
export type Dimensions = { width: number; height: number };
export type Rectangle = Dimensions & { left: number; top: number };
export type ViewGeometry = { viewId: string; kind: 'context' | 'tile'; rect: Rectangle };
export const MAX_UPLOAD_BYTES = 3_800_000;
export const MAX_VIEW_BYTES = 1_500_000;
export const MAX_UPLOAD_SIDE = 4096;
export function fitImage(width: number, height: number, side = MAX_UPLOAD_SIDE): Dimensions {
  if (![width, height].every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid image dimensions');
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
export function effectiveImageSize(width: number, height: number, model: string) {
  const size = fitImage(width, height, 2048);
  const tileBased = /^(gpt-4o(?:-mini)?|gpt-4\.1|gpt-5\.1)(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
  const patch6144 = /^gpt-(?:4\.1-mini|5\.2)(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
  const patch2500 = /^gpt-(?:5\.[456](?:-(?:mini|nano|sol|terra|luna))?|6-astra)(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
  if (!tileBased && !patch6144 && !patch2500) throw new Error('Image sizing rules for the configured model are not verified');
  if (tileBased) {
    const scale = Math.min(1, 768 / Math.min(size.width, size.height));
    return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)), rule: '2048-long-768-short' };
  }
  const budget = patch6144 ? 6144 : 2500;
  if (Math.ceil(size.width / 32) * Math.ceil(size.height / 32) > budget) {
    const shrink = Math.sqrt(32 ** 2 * budget / (size.width * size.height));
    const adjusted = shrink * Math.min(Math.floor(size.width * shrink / 32) / (size.width * shrink / 32), Math.floor(size.height * shrink / 32) / (size.height * shrink / 32));
    size.width = Math.max(1, Math.floor(size.width * adjusted));
    size.height = Math.max(1, Math.floor(size.height * adjusted));
  }
  return { ...size, rule: `2048-long-${budget}-patches` };
}
export function posterViews(width: number, height: number): ViewGeometry[] {
  fitImage(width, height);
  const context: ViewGeometry = { viewId: 'context', kind: 'context', rect: { left: 0, top: 0, width, height } };
  // Small uploads do not gain information from crops or enlargement.
  if (Math.max(width, height) <= 1024) return [context];
  const aspect = width / height;
  const columns = aspect > 2.5;
  const count = columns ? (aspect > 4 ? 4 : 3) : (height / width > 1.5 ? 4 : 3);
  const length = columns ? width : height;
  const span = Math.ceil(length / (count - (count - 1) * 0.1));
  return [context, ...Array.from({ length: count }, (_, i): ViewGeometry => {
    const start = Math.round(i * (length - span) / (count - 1));
    return { viewId: `tile-${i + 1}`, kind: 'tile', rect: columns ? { left: start, top: 0, width: span, height } : { left: 0, top: start, width, height: span } };
  })];
}
