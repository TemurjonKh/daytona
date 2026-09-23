import { fitImage, MAX_UPLOAD_BYTES } from './views';
export type UploadMetadata = {
  originalWidth: number; originalHeight: number; preparedWidth: number; preparedHeight: number;
  originalBytes: number; preparedBytes: number; originalMime: string; mime: string; preprocessingMs: number;
};
export async function preparePosterUpload(file: File): Promise<{ file: File; metadata: UploadMetadata }> {
  const start = performance.now();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP poster.');
  if (!file.size || file.size > 30_000_000) throw new Error('Choose an image smaller than 30 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('This image could not be decoded. Try a JPG, PNG, or WebP file.'); }
  try {
    if (bitmap.width * bitmap.height > 60_000_000) throw new Error('This image is too large to prepare safely. Choose a smaller original.');
    const size = fitImage(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image preparation is unavailable in this browser.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    let prepared: Blob | null = null;
    // Each trial encodes the same original-pixel canvas, never a previous JPEG.
    for (const quality of [0.94, 0.86, 0.76, 0.66]) {
      prepared = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (prepared && prepared.size <= MAX_UPLOAD_BYTES) break;
    }
    if (!prepared || prepared.size > MAX_UPLOAD_BYTES) throw new Error('The poster is too detailed to fit the upload limit without losing readability. Choose a smaller original.');
    return { file: new File([prepared], 'poster.jpg', { type: 'image/jpeg' }), metadata: {
      originalWidth: bitmap.width, originalHeight: bitmap.height, preparedWidth: size.width, preparedHeight: size.height,
      originalBytes: file.size, preparedBytes: prepared.size, originalMime: file.type, mime: 'image/jpeg', preprocessingMs: Math.round(performance.now() - start),
    } };
  } finally { bitmap.close(); }
}
