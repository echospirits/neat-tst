'use client';

import { upload } from '@vercel/blob/client';
import { useState } from 'react';
import {
  getVisitPhotoUploadPrefix,
  MAX_VISIT_PHOTO_BYTES,
} from '../../lib/visitPhotoUploadShared';

const extensionByContentType: Record<string, string> = {
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const replaceEntries = (formData: FormData, name: string, values: Array<string | Blob>) => {
  formData.delete(name);
  values.forEach((value) => formData.append(name, value));
};

const getPhotoUploadErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';

  if (/too large|maximum|size/i.test(message)) {
    return 'Each uploaded photo must be 5 MB or smaller.';
  }

  if (/content.?type|image/i.test(message)) {
    return 'Photos must be image files.';
  }

  return 'The photo could not be uploaded. Check your connection and try again.';
};

export async function uploadVisitPhotoFiles(formData: FormData) {
  const files = formData.getAll('photoFile');
  const urls = formData.getAll('photoUrl').map((value) => String(value ?? ''));
  const photoCount = Math.max(files.length, urls.length);
  const storageKeys = Array.from({ length: photoCount }, () => '');
  const contentTypes = Array.from({ length: photoCount }, () => '');
  const sizeBytes = Array.from({ length: photoCount }, () => '');
  const sessionId = crypto.randomUUID();
  const uploadPrefix = getVisitPhotoUploadPrefix(sessionId);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!(file instanceof File) || file.size === 0) continue;

    if (!file.type.startsWith('image/')) {
      throw new Error('Invalid image content type');
    }

    if (file.size > MAX_VISIT_PHOTO_BYTES) {
      throw new Error('Photo is too large');
    }

    const extension = extensionByContentType[file.type] ?? 'jpg';
    const pathname = `${uploadPrefix}${index}-${crypto.randomUUID()}.${extension}`;
    const blob = await upload(pathname, file, {
      access: 'public',
      clientPayload: JSON.stringify({ sessionId }),
      contentType: file.type,
      handleUploadUrl: '/api/visit-photos/upload',
    });

    urls[index] = blob.url;
    storageKeys[index] = blob.pathname;
    contentTypes[index] = blob.contentType;
    sizeBytes[index] = String(file.size);
  }

  formData.set('photoUploadSessionId', sessionId);
  formData.delete('photoFile');
  replaceEntries(formData, 'photoUrl', urls);
  replaceEntries(formData, 'photoStorageKey', storageKeys);
  replaceEntries(formData, 'photoContentType', contentTypes);
  replaceEntries(formData, 'photoSizeBytes', sizeBytes);
}

export function useVisitPhotoFormAction(action: (formData: FormData) => void | Promise<void>) {
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  const formAction = async (formData: FormData) => {
    setPhotoUploadError(null);

    try {
      await uploadVisitPhotoFiles(formData);
    } catch (error) {
      console.error('Visit photo client upload failed', error);
      setPhotoUploadError(getPhotoUploadErrorMessage(error));
      return;
    }

    await action(formData);
  };

  return { formAction, photoUploadError };
}
