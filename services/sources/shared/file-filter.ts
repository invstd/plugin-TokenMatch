/**
 * Pre-compiled patterns for files that should be excluded from token detection.
 * These are config files, metadata, and non-token JSON files.
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /package\.json$/i,
  /package-lock\.json$/i,
  /tsconfig\.json$/i,
  /\.config\.json$/i,
  /eslint.*\.json$/i,
  /prettier.*\.json$/i,
  /jest\.config\.json$/i,
  /webpack\.config\.json$/i,
  /^\$metadata\.json$/i,
  /^\$themes\.json$/i,
  /\(ignore\)\.json$/i,
  /node_modules\//i,
  /\.github\//i,
  /\.vscode\//i
];

/**
 * Check if a file should be excluded from token detection.
 * Tests both the filename and the full path against exclude patterns.
 */
export function isExcludedFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop()?.toLowerCase() || '';
  return EXCLUDE_PATTERNS.some(pattern =>
    pattern.test(fileName) || pattern.test(filePath)
  );
}
