/**
 * URL Token Source
 *
 * Fetches token JSON from any URL. Supports optional auth headers.
 * The simplest network-based source — just fetch and return.
 */

import {
  TokenSource,
  UrlSourceConfig,
  TokenSourceConfig,
  TestConnectionResult,
  ProgressCallback,
  CacheKey,
} from './types';

export class UrlSource implements TokenSource {
  readonly type = 'url' as const;

  private getHeaders(config: UrlSourceConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (config.authHeaderValue) {
      headers[config.authHeaderName || 'Authorization'] = config.authHeaderValue;
    }
    return headers;
  }

  async testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult> {
    const c = config as UrlSourceConfig;

    if (!c.url) {
      return { success: false, error: 'No URL provided' };
    }

    try {
      onProgress('Fetching URL...');
      const response = await fetch(c.url, { headers: this.getHeaders(c) });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      // Verify it's valid JSON
      const text = await response.text();
      try {
        JSON.parse(text);
      } catch {
        return { success: false, error: 'Response is not valid JSON' };
      }

      return {
        success: true,
        fileCount: 1,
        sampleFiles: [c.url],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch URL',
      };
    }
  }

  async getCacheKey(config: TokenSourceConfig): Promise<CacheKey> {
    const c = config as UrlSourceConfig;
    try {
      // Use ETag or Last-Modified for cache invalidation
      const response = await fetch(c.url, {
        method: 'HEAD',
        headers: this.getHeaders(c),
      });
      return response.headers.get('etag') || response.headers.get('last-modified') || null;
    } catch {
      return null;
    }
  }

  async detectTokenFiles(
    config: TokenSourceConfig,
    _onProgress: ProgressCallback
  ): Promise<string[]> {
    const c = config as UrlSourceConfig;
    // A URL source is always a single file
    return [c.url];
  }

  async fetchFileContent(
    config: TokenSourceConfig,
    _filePath: string
  ): Promise<string> {
    const c = config as UrlSourceConfig;
    const response = await fetch(c.url, { headers: this.getHeaders(c) });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }
}
