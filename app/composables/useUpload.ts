export function useUpload() {
  const { getUploadUrl, uploadToS3, registerPhoto } = useApi();

  const selectedFile = ref<File | null>(null);
  const previewUrl = ref<string | null>(null);
  const isUploading = ref(false);
  const uploadProgress = ref(0);
  const uploadError = ref('');

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic'];

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'JPEG、PNG、HEIC形式の画像を選択してください';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'ファイルサイズは5MB以下にしてください';
    }
    return null;
  };

  const selectFile = (file: File): boolean => {
    const error = validateFile(file);
    if (error) {
      uploadError.value = error;
      return false;
    }

    uploadError.value = '';
    selectedFile.value = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewUrl.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);

    return true;
  };

  const upload = async (): Promise<{ success: boolean; photo?: ReturnType<typeof registerPhoto> extends Promise<infer T> ? T : never }> => {
    if (!selectedFile.value) {
      return { success: false };
    }

    isUploading.value = true;
    uploadProgress.value = 0;
    uploadError.value = '';

    try {
      // 1. Get presigned URL
      uploadProgress.value = 20;
      const { uploadUrl, s3Key } = await getUploadUrl(
        selectedFile.value.type,
        selectedFile.value.name
      );

      // 2. Upload to S3
      uploadProgress.value = 50;
      await uploadToS3(uploadUrl, selectedFile.value, selectedFile.value.type);

      // 3. Register photo metadata
      uploadProgress.value = 80;
      const photo = await registerPhoto(s3Key, selectedFile.value.type);

      uploadProgress.value = 100;

      return { success: true, photo };
    } catch (e) {
      uploadError.value = 'アップロードに失敗しました。もう一度お試しください。';
      console.error(e);
      return { success: false };
    } finally {
      isUploading.value = false;
    }
  };

  const clear = () => {
    selectedFile.value = null;
    previewUrl.value = null;
    uploadError.value = '';
    uploadProgress.value = 0;
  };

  return {
    selectedFile: readonly(selectedFile),
    previewUrl: readonly(previewUrl),
    isUploading: readonly(isUploading),
    uploadProgress: readonly(uploadProgress),
    uploadError: readonly(uploadError),
    selectFile,
    upload,
    clear,
  };
}