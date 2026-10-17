// What a theme file says about itself beyond its colours. A created date is a plain calendar day, with
// no time zone, so it's read from its numbers and never through Date, which would add one.

/** YYYY-MM-DD as a regex source, for the JSON Schema. Whether the day exists is isCalendarDay's job. */
export const CALENDAR_DAY_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
const CALENDAR_DAY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** A real Gregorian day from year 1 on. */
export const isCalendarDay = (text: string) => {
  const match = CALENDAR_DAY.exec(text)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return day <= days
}
