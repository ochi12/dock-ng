/**
 * Determine if a color is considered dark using relative luminance.
 * Based on WCAG definition: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 *
 * @param {Cogl.Color} c - color containing RGBA components
 * @returns {boolean} - true if dark, false if light
 */

export function isDarkColor(color) {
    const linearize = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    const R = linearize(color.red / 255);
    const G = linearize(color.green / 255);
    const B = linearize(color.blue / 255);

    console.log(R, color.red);

    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;

    return L < 0.18;
}
