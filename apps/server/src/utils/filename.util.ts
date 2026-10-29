/**
 * 创建安全的HTTP头部文件名
 * @param filename 原始文件名
 * @returns 包含安全文件名和编码文件名的对象
 */
export function createSafeFilename(filename: string) {
  if (!filename) {
    return {
      safeFilename: 'download',
      encodedFilename: 'download',
    };
  }

  const cleanFilename = filename.replace(/[\u0000-\u001f\u007f]/g, '');

  // 移除或替换不安全的字符，保留基本的文件名字符
  const safeFilename = cleanFilename
    .replace(/[^\w\-_.]/g, '_') // 替换非字母数字、连字符、下划线、点的字符
    .replace(/_{2,}/g, '_') // 将连续的下划线替换为单个下划线
    .replace(/^_+|_+$/g, '') // 移除开头和结尾的下划线
    .substring(0, 100); // 限制长度

  // URL编码文件名
  const headerFilename = cleanFilename || 'download';
  const encodedFilename = encodeURIComponent(headerFilename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return {
    safeFilename: safeFilename || 'download',
    encodedFilename,
  };
}

/**
 * 创建完整的Content-Disposition头部值
 * @param filename 原始文件名
 * @returns Content-Disposition头部字符串
 */
export function createContentDisposition(filename: string): string {
  const { safeFilename, encodedFilename } = createSafeFilename(filename);
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;
}

/**
 * 从文件名中提取名称部分（去除扩展名）
 * @param filename 完整的文件名（包含扩展名）
 * @param separator 分隔符，默认为 '.'，如果为空字符串则不添加分隔符
 * @returns 去除扩展名的文件名
 *
 * @example
 * getFileNameWithoutExtension('document.pdf') // 返回 'document'
 * getFileNameWithoutExtension('archive.tar.gz') // 返回 'archive.tar'
 * getFileNameWithoutExtension('document.pdf', '') // 返回 'document'
 * getFileNameWithoutExtension('noextension') // 返回 'noextension'
 */
export function getFileNameWithoutExtension(
  filename: string,
  separator: string = '.',
): string {
  if (!filename) {
    return '';
  }

  // 如果文件名中没有点，直接返回原文件名
  if (!filename.includes('.')) {
    return filename;
  }

  // 分割文件名，移除最后一个部分（扩展名），然后重新组合
  const parts = filename.split('.');
  const nameWithoutExtension = parts.slice(0, -1).join(separator);

  return nameWithoutExtension;
}
