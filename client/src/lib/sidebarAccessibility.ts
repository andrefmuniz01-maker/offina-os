export function getSidebarResizeWidth(currentWidth: number, key: string, min = 200, max = 480) {
  if (key === "ArrowLeft") return Math.max(min, currentWidth - 24);
  if (key === "ArrowRight") return Math.min(max, currentWidth + 24);
  if (key === "Home") return min;
  if (key === "End") return max;
  return currentWidth;
}
