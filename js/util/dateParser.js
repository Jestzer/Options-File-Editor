const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/**
 * Parse "dd-MMM-yyyy" (e.g. "01-jan-2025") into a Date object.
 * Returns null if the format is invalid.
 */
export function parseDdMmmYyyy(str) {
    if (!str || typeof str !== "string") return null;
    const parts = str.split("-");
    if (parts.length !== 3) return null;

    const [dayStr, monStr, yearStr] = parts;
    const month = MONTHS[monStr.toLowerCase()];
    if (month === undefined) return null;

    const day = parseInt(dayStr, 10);
    const year = parseInt(yearStr, 10);
    if (isNaN(day) || isNaN(year)) return null;

    return new Date(year, month, day);
}
