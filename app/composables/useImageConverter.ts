/**
 * 画像変換用composable
 * - HEIC/PNG/JPEG → JPEG変換
 * - 長辺2048pxにリサイズ
 * - 画質85%
 */

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

interface ConvertResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  convertedSize: number;
}

export function useImageConverter() {
  const isConverting = ref(false);
  const convertProgress = ref(0);

  /**
   * 画像ファイルをJPEGに変換し、リサイズする
   */
  const convertToJpeg = async (file: File): Promise<ConvertResult> => {
    isConverting.value = true;
    convertProgress.value = 0;

    try {
      // 1. 画像を読み込み
      convertProgress.value = 20;
      const imageBitmap = await createImageBitmap(file);

      // 2. リサイズ計算
      convertProgress.value = 40;
      const { width, height } = calculateDimensions(
        imageBitmap.width,
        imageBitmap.height,
        MAX_DIMENSION
      );

      // 3. Canvas描画
      convertProgress.value = 60;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      // 4. JPEG変換
      convertProgress.value = 80;
      const blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: JPEG_QUALITY,
      });

      convertProgress.value = 100;

      return {
        blob,
        width,
        height,
        originalSize: file.size,
        convertedSize: blob.size,
      };
    } finally {
      isConverting.value = false;
    }
  };

  /**
   * リサイズ後の寸法を計算
   */
  const calculateDimensions = (
    originalWidth: number,
    originalHeight: number,
    maxDimension: number
  ): { width: number; height: number } => {
    // 既に制限内ならそのまま
    if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
      return { width: originalWidth, height: originalHeight };
    }

    // 長辺を基準にスケール計算
    const scale = maxDimension / Math.max(originalWidth, originalHeight);
    return {
      width: Math.round(originalWidth * scale),
      height: Math.round(originalHeight * scale),
    };
  };

  /**
   * プレビュー用のData URLを生成
   */
  const createPreviewUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  return {
    isConverting: readonly(isConverting),
    convertProgress: readonly(convertProgress),
    convertToJpeg,
    createPreviewUrl,
  };
}
