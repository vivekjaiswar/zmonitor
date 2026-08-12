/**
 * Escape a value for inclusion in a CSV cell (RFC4180-ish): wrap in quotes
 * and double up any embedded quotes if the value contains a comma, quote,
 * or newline.
 * @param {*} value Value to escape
 * @returns {string} CSV-safe cell content
 */
export function csvEscape(value) {
    const str = String(value ?? "");
    if (/["\n,]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
