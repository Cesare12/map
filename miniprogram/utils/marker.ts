// 地图标记要求 iconPath。实际视觉由 marker.label 中的分类 emoji 提供，
// 这里在小程序沙盒中生成一个透明底图，避免为每个分类打包重复图片。
const TRANSPARENT_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function ensureMarkerIcon(): string {
  const path = `${wx.env.USER_DATA_PATH}/want-to-go-marker.png`;
  try {
    wx.getFileSystemManager().accessSync(path);
  } catch (_) {
    wx.getFileSystemManager().writeFileSync(path, TRANSPARENT_PNG, "base64");
  }
  return path;
}
