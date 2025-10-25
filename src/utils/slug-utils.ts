/**
 * Utility functions for generating and working with dataset slugs
 */

/**
 * Generate a URL-friendly slug from a dataset name
 * @param name - The dataset name to convert to a slug
 * @returns A lowercase, hyphenated slug
 * 
 * @example
 * generateSlug("Global Temperature Anomaly") // "global-temperature-anomaly"
 * generateSlug("CO₂ Levels (ppm)") // "co2-levels-ppm"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Replace special characters and spaces with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Replace multiple consecutive hyphens with single hyphen
    .replace(/-+/g, '-');
}

/**
 * Generate a unique slug by appending a number if necessary
 * @param name - The dataset name
 * @param existingSlugs - Array of already used slugs to check against
 * @returns A unique slug
 * 
 * @example
 * generateUniqueSlug("Temperature", ["temperature"]) // "temperature-2"
 * generateUniqueSlug("Sea Level", []) // "sea-level"
 */
export function generateUniqueSlug(name: string, existingSlugs: string[]): string {
  let slug = generateSlug(name);
  let counter = 2;
  
  // If slug already exists, append a number
  while (existingSlugs.includes(slug)) {
    slug = `${generateSlug(name)}-${counter}`;
    counter++;
  }
  
  return slug;
}

/**
 * Validate if a string is a valid slug format
 * @param slug - The string to validate
 * @returns True if valid slug format
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Convert a display name to a more readable slug (preserves some structure)
 * @param name - The dataset name
 * @returns A readable slug
 * 
 * @example
 * readableSlug("ERA5 Temperature Data (Monthly)") // "era5-temperature-monthly"
 */
export function readableSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove content in parentheses
    .replace(/\([^)]*\)/g, '')
    // Remove special characters but keep spaces temporarily
    .replace(/[^a-z0-9\s-]/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    .trim()
    // Convert spaces to hyphens
    .replace(/\s/g, '-')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
}