/**
 * America/New_York date/time helpers for growth reports.
 * Weekday labels are always derived from the date — never hardcoded separately.
 */

export const REPORT_TZ = 'America/New_York';

/** @param {Date|string|number} input */
export function toDate(input = new Date()) {
  return input instanceof Date ? input : new Date(input);
}

/**
 * Calendar date parts in America/New_York.
 * @param {Date|string|number} [input]
 * @returns {{ year: number, month: number, day: number, ymd: string }}
 */
export function etDateParts(input = new Date()) {
  const d = toDate(input);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, ymd };
}

/**
 * Weekday name for a calendar date (YYYY-MM-DD) interpreted as noon ET
 * so DST edges do not flip the weekday.
 * @param {string} ymd
 */
export function weekdayNameForYmd(ymd, timeZone = REPORT_TZ) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Invalid YMD: ${ymd}`);
  }
  // Noon UTC-ish anchoring via explicit ET noon string is fragile; use UTC noon on that calendar day
  // then format weekday in the target zone. For US Eastern this is stable for civil dates.
  const [y, m, d] = ymd.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 17, 0, 0)); // 12:00/13:00 ET depending on DST
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(utcNoon);
}

/**
 * @param {string} ymd
 * @returns {string} e.g. "Wednesday, August 19, 2026"
 */
export function formatLongDateEt(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  const weekday = weekdayNameForYmd(ymd);
  const rest = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TZ,
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(utcNoon);
  return `${weekday}, ${rest}`;
}

/**
 * @param {Date|string|number} [input]
 */
export function formatEtDateTime(input = new Date()) {
  const d = toDate(input);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
  return { date, time, ymd: etDateParts(d).ymd, zone: REPORT_TZ };
}

/**
 * UTC date string N days before an ET calendar day (for GA4 inclusive windows).
 * @param {string} endYmd ET calendar end date
 * @param {number} days
 */
export function daysBeforeYmd(endYmd, days) {
  const [y, m, d] = endYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Start of an inclusive N-day window ending on endYmd.
 * 7 complete days through Aug 16 → Aug 10–16.
 */
export function inclusiveWindowStart(endYmd, dayCount) {
  return daysBeforeYmd(endYmd, dayCount - 1);
}

/** Last complete ET calendar day before reportDateYmd (GA4 data-through). */
export function ga4DataThroughYmd(reportDateYmd) {
  return daysBeforeYmd(reportDateYmd, 1);
}

/**
 * @param {string} ymd
 * @returns {string} e.g. "August 16, 2026"
 */
export function formatMonthDayYear(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TZ,
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(utcNoon);
}

/**
 * Inclusive civil range in ET. Same month: "August 10-16, 2026".
 * Cross month: "July 18-August 16, 2026".
 */
export function formatDateRangeEt(startYmd, endYmd) {
  if (!startYmd || !endYmd) return 'missing';
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const monthName = (y, m, d) =>
    new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TZ, month: 'long' }).format(
      new Date(Date.UTC(y, m - 1, d, 17, 0, 0))
    );
  const startMonth = monthName(sy, sm, sd);
  const endMonth = monthName(ey, em, ed);
  if (sy === ey && sm === em) return `${startMonth} ${sd}-${ed}, ${ey}`;
  if (sy === ey) return `${startMonth} ${sd}-${endMonth} ${ed}, ${ey}`;
  return `${startMonth} ${sd}, ${sy}-${endMonth} ${ed}, ${ey}`;
}
