/**
 * Locale-aware Formatting Utilities
 * 
 * Provides functions to format dates, numbers, and currency
 * according to the user's selected language/locale.
 */

/**
 * Format a date according to locale
 */
export function formatDate(date: Date | string | number, locale: string = 'en'): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
}

/**
 * Format a date in short format
 */
export function formatDateShort(date: Date | string | number, locale: string = 'en'): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(dateObj);
}

/**
 * Format a number according to locale
 */
export function formatNumber(num: number, locale: string = 'en', options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(num);
}

/**
 * Format currency according to locale
 */
export function formatCurrency(
  amount: number, 
  locale: string = 'en', 
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount);
}

/**
 * Format a relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | number, locale: string = 'en'): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  
  if (diffSec < 60) {
    return rtf.format(-diffSec, 'second');
  } else if (diffMin < 60) {
    return rtf.format(-diffMin, 'minute');
  } else if (diffHour < 24) {
    return rtf.format(-diffHour, 'hour');
  } else if (diffDay < 30) {
    return rtf.format(-diffDay, 'day');
  } else {
    return formatDateShort(dateObj, locale);
  }
}

/**
 * Format file size with locale-aware number formatting
 */
export function formatFileSize(bytes: number, locale: string = 'en'): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${formatNumber(size, locale, { maximumFractionDigits: 2 })} ${units[unitIndex]}`;
}

/**
 * Format percentage with locale-aware number formatting
 */
export function formatPercentage(value: number, locale: string = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}
