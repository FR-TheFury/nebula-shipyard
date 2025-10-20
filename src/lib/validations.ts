import { z } from 'zod';

export const profileSchema = z.object({
  handle: z.string()
    .min(3, 'Handle must be at least 3 characters')
    .max(24, 'Handle must be at most 24 characters')
    .regex(/^[a-z0-9_]+$/, 'Handle can only contain lowercase letters, numbers, and underscores'),
  display_name: z.string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be at most 50 characters'),
  bio_md: z.string()
    .max(500, 'Bio must be at most 500 characters')
    .optional(),
  avatar: z.instanceof(File)
    .refine(f => f.size <= 2_000_000, 'Avatar must be less than 2MB')
    .refine(
      f => ['image/jpeg', 'image/png'].includes(f.type),
      'Avatar must be JPG or PNG'
    )
    .optional(),
});

export const logSchema = z.object({
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters'),
  body_md: z.string()
    .min(10, 'Content must be at least 10 characters')
    .max(5000, 'Content must be at most 5000 characters'),
  image: z.instanceof(File)
    .refine(f => f.size <= 2_000_000, 'Image must be less than 2MB')
    .refine(
      f => ['image/jpeg', 'image/png'].includes(f.type),
      'Image must be JPG or PNG'
    )
    .optional(),
  tags: z.array(z.string()).max(10, 'Maximum 10 tags').optional(),
});

export const galleryPostSchema = z.object({
  title: z.string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters'),
  description_md: z.string()
    .max(1000, 'Description must be at most 1000 characters')
    .optional(),
  location: z.string()
    .max(100, 'Location must be at most 100 characters')
    .optional(),
  images: z.array(z.instanceof(File))
    .min(1, 'At least 1 image is required')
    .max(10, 'Maximum 10 images per post')
    .refine(
      files => files.every(f => f.size <= 2_000_000),
      'Each image must be less than 2MB'
    )
    .refine(
      files => files.every(f => ['image/jpeg', 'image/png'].includes(f.type)),
      'All images must be JPG or PNG'
    ),
  tags: z.array(z.string()).max(10, 'Maximum 10 tags').optional(),
});

export function validateImageFile(file: File): void {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Only JPG and PNG files are allowed');
  }
  if (file.size > 2_000_000) {
    throw new Error('File size must be less than 2MB');
  }
}
