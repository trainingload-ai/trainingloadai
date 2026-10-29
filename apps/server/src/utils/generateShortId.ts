/**
 * 生成 11 位数字的短 ID
 * 使用时间戳后 7 位 + 4 位随机数
 */
export function generateShortId(): string {
  // 获取时间戳后 7 位
  const timestamp = Date.now().toString().slice(-7);
  // 生成 4 位随机数
  const random = Math.floor(1000 + Math.random() * 9000).toString();
  // 组合成 11 位数字
  return timestamp + random;
}
