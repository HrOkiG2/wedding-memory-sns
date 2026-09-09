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
  // sinceを渡すと、それ以降に追加された写真だけを返す（ポーリングの差分取得用）
  const fetchSlideshowPhotos = async (since?: string): Promise<PhotosResponse> => {
    const params = new URLSearchParams();
    if (since) {
      params.set('since', since);
    }
    const url = `${apiBase}/photos/slideshow${params.toString() ? `?${params}` : ''}`;

    return await $fetch<PhotosResponse>(url, {
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
  // Cache-Controlはサーバー側(upload-url発行時)の署名対象に含まれているため、
  // ここで送る値を変える場合はaws/lambda/photos/index.tsのPHOTO_CACHE_CONTROLも合わせて変更すること
  const uploadToS3 = async (uploadUrl: string, file: Blob, mimeType: string): Promise<void> => {
    await $fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
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
