import imageCompression from 'browser-image-compression';

export async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number
): Promise<Blob> {
  const options = {
    maxSizeMB: 2,
    maxWidthOrHeight: Math.max(maxWidth, maxHeight),
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Error resizing image:', error);
    throw new Error('Failed to resize image');
  }
}

export async function resizeAvatar(file: File): Promise<Blob> {
  return resizeImage(file, 512, 512);
}

export function validateImageFile(file: File): void {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Only JPG and PNG files are allowed');
  }
  if (file.size > 2_000_000) {
    throw new Error('File size must be less than 2MB');
  }
}

export function getImageUrl(bucket: string, path: string): string {
  return `https://djmzthmmgjlkfgwkawzi.supabase.co/storage/v1/object/public/${bucket}/${path}`;
}
