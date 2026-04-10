const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function validateImageFile(file: File) {
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    return 'Для загрузки доступны файлы в форматах JPG, PNG, GIF';
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return 'Для загрузки доступны файлы не более 5 МБ';
  }

  return '';
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения'));
    reader.readAsDataURL(file);
  });
}
