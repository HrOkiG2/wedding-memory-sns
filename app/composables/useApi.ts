import type { Photo, PhotosResponse, UploadUrlResponse } from '~/types';

export function useApi() {
  const config = useRuntimeConfig();
  const { getAuthHeader } = useAuth();

  const apiBase = config.public.apiEndpoint;

  // Fetch photos
  const fetchPhotos = async (nextToken?: string): Promise<PhotosResponse> => {
    const params = new URLSearchParams();
    if (nextToken) {
      params.set('nextToken', nextToken);
    }
    const url = `${apiBase}/photos${params.toString() ? `?${params}` : ''}`;

    return await $fetch<PhotosResponse>(url, {
      headers: getAuthHeader(),
    });
  };

  // Fetch photos for slideshow (5min delay)
  const fetchSlideshowPhotos = async (): Promise<PhotosResponse> => {
    return await $fetch<PhotosResponse>(`${apiBase}/photos/slideshow`, {
      headers: getAuthHeader(),
    });
  };

  // Get upload URL
  const getUploadUrl = async (
    mimeType: string,
    fileName: string
  ): Promise<UploadUrlResponse> => {
    return await $fetch<UploadUrlResponse>(`${apiBase}/photos/upload-url`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: { mimeType, fileName },
    });
  };

  // Upload photo to S3
  const uploadToS3 = async (uploadUrl: string, file: Blob, mimeType: string): Promise<void> => {
    await $fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': mimeType,
      },
    });
  };

  // Register photo metadata after upload
  const registerPhoto = async (s3Key: string, mimeType: string): Promise<Photo> => {
    return await $fetch<Photo>(`${apiBase}/photos`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: { s3Key, mimeType },
    });
  };

  // Delete photo (soft delete)
  const deletePhoto = async (photoId: string, createdAt: string): Promise<void> => {
    await $fetch(`${apiBase}/photos/${photoId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
      body: { createdAt },
    });
  };

  // Like photo
  const likePhoto = async (photoId: string, createdAt: string): Promise<void> => {
    await $fetch(`${apiBase}/photos/${photoId}/like`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: { createdAt },
    });
  };

  return {
    fetchPhotos,
    fetchSlideshowPhotos,
    getUploadUrl,
    uploadToS3,
    registerPhoto,
    deletePhoto,
    likePhoto,
  };
}
