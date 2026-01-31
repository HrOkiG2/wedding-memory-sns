// utils/download.ts またはコンポーネント内のメソッド
export const downloadPhoto = async (imageUrl: string, fileName: string = 'wedding-photo.jpg') => {
  try {
    // 画像データを取得（S3からバイナリデータを取ってくる）
    const response = await fetch(imageUrl, {
      mode: 'cors', // CORS必須
      // 必要なら credentials: 'include' など
    });
    const blob = await response.blob();

    // 共有用のファイルオブジェクトを作成
    const file = new File([blob], fileName, { type: blob.type });

    // Web Share API が画像共有に対応しているかチェック
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Wedding Photo',
        text: '素敵な写真です！',
      });

      return { success: true };
    } else {
      // PCなど非対応の場合は、従来のダウンロードリンク方式にフォールバック
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return { success: true };
    }
  } catch (error) {
    console.error('Download failed:', error);
    return { success: false, error: '保存できませんでした。画像を長押しして保存してください。' };
  }
};
