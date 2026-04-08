/**
 * Unified Token Source Abstraction
 *
 * All token sources (Git providers, URL, npm, JSON paste) implement
 * the TokenSource interface. Sources return raw JSON strings;
 * token parsing is handled by the caller via TokenParser.
 */

// ---------------------------------------------------------------------------
// Source type identifier
// ---------------------------------------------------------------------------

export type TokenSourceType = 'github' | 'gitlab' | 'bitbucket' | 'url' | 'npm' | 'json';

// ---------------------------------------------------------------------------
// Per-source configuration (discriminated union on `type`)
// ---------------------------------------------------------------------------

export interface GitHubSourceConfig {
  type: 'github';
  repoUrl: string;
  token: string;
  branch: string;
  directoryPath: string;
}

export interface GitLabSourceConfig {
  type: 'gitlab';
  projectUrl: string;       // e.g. https://gitlab.com/group/project or self-hosted
  instanceUrl: string;       // derived or explicit for self-hosted
  token: string;
  branch: string;
  directoryPath: string;
}

export interface BitBucketSourceConfig {
  type: 'bitbucket';
  repoUrl: string;           // e.g. https://bitbucket.org/workspace/repo
  instanceUrl: string;       // derived or explicit for self-hosted
  username: string;           // BitBucket requires username + app password
  appPassword: string;
  branch: string;
  directoryPath: string;
}

export interface UrlSourceConfig {
  type: 'url';
  url: string;
  authHeaderName?: string;   // defaults to 'Authorization'
  authHeaderValue?: string;
}

export interface NpmSourceConfig {
  type: 'npm';
  packageName: string;
  version: string;           // e.g. "latest", "1.2.3", "next"
  directoryPath: string;
  filePattern?: string;      // glob-like filter, e.g. "*.nested.json"
  registryToken?: string;    // for private registries
}

export interface JsonSourceConfig {
  type: 'json';
  files: Array<{ name: string; content: string }>;
}

export type TokenSourceConfig =
  | GitHubSourceConfig
  | GitLabSourceConfig
  | BitBucketSourceConfig
  | UrlSourceConfig
  | NpmSourceConfig
  | JsonSourceConfig;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  branches?: string[];       // Only for git providers
  fileCount?: number;
  tokenCount?: number;
  sampleFiles?: string[];
}

export type ProgressCallback = (message: string) => void;

/** Cache invalidation key. null means "do not cache" (e.g. JSON source). */
export type CacheKey = string | null;

// ---------------------------------------------------------------------------
// TokenSource interface
// ---------------------------------------------------------------------------

export interface TokenSource {
  readonly type: TokenSourceType;

  /**
   * Validate config and test reachability.
   * Git providers: fetch branches + detect token files.
   * npm: resolve package version. URL: HEAD request. JSON: validate parse.
   */
  testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult>;

  /**
   * Return a cache invalidation key for the current source state.
   * Git → commit SHA, npm → resolved version, URL → ETag, JSON → null.
   */
  getCacheKey(config: TokenSourceConfig): Promise<CacheKey>;

  /**
   * Detect which files contain tokens. Returns file paths/identifiers.
   */
  detectTokenFiles(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<string[]>;

  /**
   * Fetch the raw JSON content of a single file as a string.
   * The caller handles JSON.parse and token extraction.
   */
  fetchFileContent(
    config: TokenSourceConfig,
    filePath: string
  ): Promise<string>;
}
