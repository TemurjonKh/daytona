import sharp from 'sharp';
import { effectiveImageSize, posterViews, MAX_UPLOAD_BYTES, MAX_UPLOAD_SIDE, MAX_VIEW_BYTES, type ViewGeometry } from './views';
export type PosterView = ViewGeometry & { bytes: Buffer; width: number; height: number; effectiveWidth: number; effectiveHeight: number; sizingRule: string };
export async function preparePosterViews(bytes: Buffer, model: string) {
  const start = performance.now();
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error('Invalid prepared image size');
  // Decode/rotate once into raw pixels. Browser JPEGs have already applied EXIF.
  const rotated = await sharp(bytes, { limitInputPixels: 60_000_000, failOn: 'error' }).rotate().flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = rotated.info;
  if (Math.max(width, height) > MAX_UPLOAD_SIDE) throw new Error('Poster upload must be prepared before analysis');
  const views: PosterView[] = [];
  for (const geometry of posterViews(width, height)) {
    const effective = effectiveImageSize(geometry.rect.width, geometry.rect.height, model);
    let encoded: Buffer | undefined;
    for (const quality of [92, 84, 74, 64]) {
      encoded = await sharp(rotated.data, { raw: { width, height, channels } }).extract(geometry.rect).resize(effective.width, effective.height, { fit: 'fill', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      if (encoded.length <= MAX_VIEW_BYTES) break;
    }
    if (!encoded || encoded.length > MAX_VIEW_BYTES) throw new Error('Image view exceeds safe request size');
    views.push({ ...geometry, bytes: encoded, width: effective.width, height: effective.height, effectiveWidth: effective.width, effectiveHeight: effective.height, sizingRule: effective.rule });
  }
  return { width, height, views, preprocessingMs: Math.round(performance.now() - start), resolutionInsufficient: Math.min(width, height) < 320 };
}
