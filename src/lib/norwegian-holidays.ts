/**
 * Norwegian Holidays Utility
 * 
 * Calculates Norwegian public holidays and provides business day calculations
 * that skip weekends and holidays.
 */

import { addDays, getYear, isWeekend as dateFnsIsWeekend, isSameDay } from "date-fns";

export interface Holiday {
    date: Date;
    name: string;
}

/**
 * Calculate Easter Sunday for a given year using the Anonymous Gregorian algorithm
 */
function getEasterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day);
}

/**
 * Get all Norwegian public holidays for a given year
 */
export function getNorwegianHolidays(year: number): Holiday[] {
    const holidays: Holiday[] = [];

    // Fixed holidays
    holidays.push({ date: new Date(year, 0, 1), name: "Nyttårsdag" });
    holidays.push({ date: new Date(year, 4, 1), name: "1. mai" });
    holidays.push({ date: new Date(year, 4, 17), name: "17. mai" });
    holidays.push({ date: new Date(year, 11, 24), name: "Julaften" });
    holidays.push({ date: new Date(year, 11, 25), name: "1. juledag" });
    holidays.push({ date: new Date(year, 11, 26), name: "2. juledag" });
    holidays.push({ date: new Date(year, 11, 31), name: "Nyttårsaften" });

    // Easter-related holidays (movable)
    const easter = getEasterSunday(year);

    holidays.push({ date: addDays(easter, -7), name: "Palmesøndag" });
    holidays.push({ date: addDays(easter, -3), name: "Skjærtorsdag" });
    holidays.push({ date: addDays(easter, -2), name: "Langfredag" });
    holidays.push({ date: addDays(easter, -1), name: "Påskeaften" });
    holidays.push({ date: easter, name: "1. påskedag" });
    holidays.push({ date: addDays(easter, 1), name: "2. påskedag" });

    // Ascension Day (39 days after Easter)
    holidays.push({ date: addDays(easter, 39), name: "Kristi himmelfartsdag" });

    // Pentecost (49 and 50 days after Easter)
    holidays.push({ date: addDays(easter, 49), name: "1. pinsedag" });
    holidays.push({ date: addDays(easter, 50), name: "2. pinsedag" });

    // Sort by date
    holidays.sort((a, b) => a.date.getTime() - b.date.getTime());

    return holidays;
}

/**
 * Get holidays for a date range (automatically handles multiple years)
 */
export function getHolidaysInRange(startDate: Date, endDate: Date): Holiday[] {
    const startYear = getYear(startDate);
    const endYear = getYear(endDate);
    const holidays: Holiday[] = [];

    for (let year = startYear; year <= endYear; year++) {
        const yearHolidays = getNorwegianHolidays(year);
        for (const holiday of yearHolidays) {
            if (holiday.date >= startDate && holiday.date <= endDate) {
                holidays.push(holiday);
            }
        }
    }

    return holidays;
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
    return dateFnsIsWeekend(date);
}

/**
 * Check if a date is a Norwegian public holiday
 */
export function isNorwegianHoliday(date: Date): boolean {
    const year = getYear(date);
    const holidays = getNorwegianHolidays(year);
    return holidays.some(h => isSameDay(h.date, date));
}

/**
 * Check if a date is a non-working day (weekend or holiday)
 */
export function isNonWorkingDay(date: Date): boolean {
    return isWeekend(date) || isNorwegianHoliday(date);
}

/**
 * Get the next working day (skips weekends and holidays)
 */
export function getNextWorkingDay(date: Date): Date {
    let current = new Date(date);
    while (isNonWorkingDay(current)) {
        current = addDays(current, 1);
    }
    return current;
}

/**
 * Get the previous working day (skips weekends and holidays)
 */
export function getPreviousWorkingDay(date: Date): Date {
    let current = new Date(date);
    while (isNonWorkingDay(current)) {
        current = addDays(current, -1);
    }
    return current;
}

/**
 * Subtract business days from a date (skips weekends and holidays)
 * @param date The starting date
 * @param days Number of business days to subtract
 * @returns The resulting date
 */
export function subtractBusinessDays(date: Date, days: number): Date {
    let current = new Date(date);
    let remaining = days;

    while (remaining > 0) {
        current = addDays(current, -1);
        if (!isNonWorkingDay(current)) {
            remaining--;
        }
    }

    return current;
}

/**
 * Add business days to a date (skips weekends and holidays)
 * @param date The starting date
 * @param days Number of business days to add
 * @returns The resulting date
 */
export function addBusinessDays(date: Date, days: number): Date {
    let current = new Date(date);
    let remaining = days;

    while (remaining > 0) {
        current = addDays(current, 1);
        if (!isNonWorkingDay(current)) {
            remaining--;
        }
    }

    return current;
}
