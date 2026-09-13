export function formatVisitTime(timestamp: number): string {
  const value = new Date(timestamp);
  const now = new Date();
  const sameYear = value.getFullYear() === now.getFullYear();
  const date = `${value.getMonth() + 1}月${value.getDate()}日`;
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return sameYear ? `${date} ${time}` : `${value.getFullYear()}年${date}`;
}
