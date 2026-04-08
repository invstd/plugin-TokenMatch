/**
 * Types for Token Path Exclusions feature.
 * Allows filtering out primitive/internal tokens from matching results.
 */

/** A single exclusion pattern (glob-style). */
export interface ExclusionPattern {
  id: string;
  pattern: string;
  enabled: boolean;
  source: 'preset' | 'custom';
  presetName?: string;
  matchCount?: number;
}

/** Pre-defined set of patterns (e.g. Primitives, Internal). */
export interface ExclusionPreset {
  id: string;
  name: string;
  description: string;
  patterns: string[];
}

/** Full exclusion configuration. */
export interface ExclusionConfig {
  enabled: boolean;
  patterns: ExclusionPattern[];
  scope: {
    tokenList: boolean;
    matchResults: boolean;
    statistics: boolean;
  };
}

/** Result of applying exclusions to a token list. */
export interface ExclusionResult {
  included: TokenLike[];
  excluded: TokenLike[];
  excludedCount: number;
  excludedByPattern: Map<string, number>;
}

/** Minimal token shape for exclusion matching (path only). */
export interface TokenLike {
  path: string[] | string;
  [key: string]: any;
}
