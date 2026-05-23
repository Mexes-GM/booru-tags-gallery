export const formatNumber = (number: number | null | undefined): string => {
  if (number == null) return '0';
  return number.toLocaleString();
}

export const formatPostCount = (count: number): string => {
  const formatted = formatNumber(count);
  return `${formatted} post${count !== 1 ? 's' : ''}`;
}

export const formatResultCount = (count: number): string => {
  const formatted = formatNumber(count);
  return `${formatted} resultado${count !== 1 ? 's' : ''}`;
}