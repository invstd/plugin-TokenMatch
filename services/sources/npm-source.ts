/**
 * npm Token Source
 *
 * Fetches design token packages from npm via CDN APIs:
 * - npm registry for version resolution (tags → exact versions)
 * - jsdelivr API for file listing (requires exact versions)
 * - unpkg for file content (supports tags via redirect)
 *
 * Supports public packages and version/tag selection.
 */

import {
  TokenSource,
  NpmSourceConfig,
  TokenSourceConfig,
  TestConnectionResult,
  ProgressCallback,
  CacheKey,
} from './types';
import { isExcludedFile } from './shared/file-filter';

interface JsdelivrFile {
  name: string;
  hash: string;
  size: number;
}

interface JsdelivrDirectory {
  type: 'directory';
  name: string;
  files: Array<JsdelivrFile | JsdelivrDirectory>;
}

type JsdelivrEntry = JsdelivrFile | JsdelivrDirectory;

export class NpmSource implements TokenSource {
  readonly type = 'npm' as const;

  /**
   * Extract package name from input — handles both bare names
   * (e.g. "@company/tokens") and full npmjs.com URLs
   * (e.g. "https://www.npmjs.com/package/@company/tokens").
   */
  private parsePackageName(input: string): string {
    const trimmed = input.trim();
    const match = trimmed.match(/npmjs\.com\/package\/(.+?)$/);
    if (match) return match[1].replace(/\/+$/, '');
    return trimmed;
  }

  /**
   * Encode a package name for use in API URLs.
   * Scoped packages (e.g. @scope/name) must keep @ and / unencoded.
   */
  private encodePackageName(name: string): string {
    // All three APIs (npm registry, jsdelivr, unpkg) expect
    // scoped names unencoded in the URL path
    return name;
  }

  /**
   * Resolve a version tag (e.g. "latest", "next") to an exact version
   * via the npm registry. Returns the tag as-is if it's already a semver.
   */
  private async resolveVersion(packageName: string, versionOrTag: string): Promise<string> {
    // If it looks like an exact version (digits and dots), return as-is
    if (/^\d+\.\d+\.\d+/.test(versionOrTag)) {
      return versionOrTag;
    }

    const url = `https://registry.npmjs.org/${this.encodePackageName(packageName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`npm registry error: ${response.status}`);
    }

    const data = await response.json();
    const resolved = data['dist-tags']?.[versionOrTag];
    if (!resolved) {
      throw new Error(`Tag "${versionOrTag}" not found for ${packageName}`);
    }
    return resolved;
  }

  async testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult> {
    const c = config as NpmSourceConfig;

    const pkg = this.parsePackageName(c.packageName);
    if (!pkg) {
      return { success: false, error: 'No package name provided' };
    }

    try {
      onProgress('Resolving package version...');
      const version = await this.resolveVersion(pkg, c.version || 'latest');

      onProgress('Listing package files...');
      const filesUrl = `https://data.jsdelivr.com/v1/packages/npm/${this.encodePackageName(pkg)}@${version}`;
      const response = await fetch(filesUrl);

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: `Package "${c.packageName}@${version}" not found` };
        }
        return { success: false, error: `jsdelivr API error: ${response.status}` };
      }

      const data = await response.json();
      const allFiles = this.flattenFiles(data.files || [], '');
      const tokenFiles = this.filterFiles(allFiles, c.directoryPath, c.filePattern);

      return {
        success: true,
        fileCount: tokenFiles.length,
        sampleFiles: tokenFiles.slice(0, 10),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve package',
      };
    }
  }

  async getCacheKey(config: TokenSourceConfig): Promise<CacheKey> {
    const c = config as NpmSourceConfig;
    try {
      const pkg = this.parsePackageName(c.packageName);
      return await this.resolveVersion(pkg, c.version || 'latest');
    } catch {
      return null;
    }
  }

  async detectTokenFiles(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<string[]> {
    const c = config as NpmSourceConfig;
    const pkg = this.parsePackageName(c.packageName);

    onProgress('Resolving package version...');
    const version = await this.resolveVersion(pkg, c.version || 'latest');

    onProgress('Listing package files...');
    const url = `https://data.jsdelivr.com/v1/packages/npm/${this.encodePackageName(pkg)}@${version}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list package files: ${response.status}`);
    }

    const data = await response.json();
    const allFiles = this.flattenFiles(data.files || [], '');

    return this.filterFiles(allFiles, c.directoryPath, c.filePattern);
  }

  async fetchFileContent(
    config: TokenSourceConfig,
    filePath: string
  ): Promise<string> {
    const c = config as NpmSourceConfig;
    const pkg = this.parsePackageName(c.packageName);
    const version = await this.resolveVersion(pkg, c.version || 'latest');

    // unpkg serves raw file content from npm packages
    const url = `https://unpkg.com/${this.encodePackageName(pkg)}@${version}/${filePath}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Match a filename against a simple glob pattern.
   * Supports * (any characters) and ? (single character).
   * The pattern is matched against the filename only (not the full path).
   */
  private matchesFilePattern(filePath: string, pattern: string): boolean {
    if (!pattern) return true;
    const fileName = filePath.split('/').pop() || '';
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i'
    );
    return regex.test(fileName);
  }

  /**
   * Apply directory and file pattern filters to a list of files.
   */
  private filterFiles(allFiles: string[], directoryPath: string, filePattern?: string): string[] {
    const dirFilter = (directoryPath || '').replace(/\/+$/, '');
    return allFiles.filter(f =>
      f.endsWith('.json') && !isExcludedFile(f) &&
      (!dirFilter || f.startsWith(dirFilter)) &&
      this.matchesFilePattern(f, filePattern || '')
    );
  }

  /**
   * Flatten jsdelivr's nested file listing into flat paths.
   */
  private flattenFiles(entries: JsdelivrEntry[], prefix: string): string[] {
    const paths: string[] = [];
    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if ('files' in entry && entry.type === 'directory') {
        paths.push(...this.flattenFiles(entry.files, fullPath));
      } else {
        paths.push(fullPath);
      }
    }
    return paths;
  }
}
