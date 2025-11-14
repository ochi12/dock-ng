const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Performs cubic ease-in interpolation between two numeric values.
 *
 * @param {number} a - The start value.
 * @param {number} b - The end value.
 * @param {number} t - Normalized time (progress) in the range [0, 1].
 * @returns {number} - Interpolated value between `a` and `b` using cubic easing.
 */
export function easeInCubic(a, b, t) {
    return lerp(a, b, t ** 3);
}

/**
 * Performs cubic ease-out interpolation between two numeric values.
 *
 * @param {number} a - The start value.
 * @param {number} b - The end value.
 * @param {number} t - Normalized time (progress) in the range [0, 1].
 * @returns {number} - Interpolated value between `a` and `b` using cubic easing.
 */
export function easeOutCubic(a, b, t) {
    return lerp(a, b, 1 - (1 - t) ** 3);
}
