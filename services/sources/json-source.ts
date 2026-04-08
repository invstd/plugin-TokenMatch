/**
 * JSON Token Source
 *
 * Accepts pasted or uploaded JSON content directly.
 * No network requests needed — the simplest source type.
 */

import {
  TokenSource,
  JsonSourceConfig,
  TokenSourceConfig,
  TestConnectionResult,
  ProgressCallback,
  CacheKey,
} from './types';

export class JsonSource implements TokenSource {
  readonly type = 'json' as const;

  async testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult> {
    const c = config as JsonSourceConfig;

    if (!c.files || c.files.length === 0) {
      return { success: false, error: 'No JSON files provided' };
    }

    onProgress('Validating JSON...');
    let validCount = 0;
    for (const file of c.files) {
      try {
        JSON.parse(file.content);
        validCount++;
      } catch {
        return { success: false, error: `Invalid JSON in "${file.name}"` };
      }
    }

    return {
      success: true,
      fileCount: validCount,
      sampleFiles: c.files.map(f => f.name),
    };
  }

  async getCacheKey(_config: TokenSourceConfig): Promise<CacheKey> {
    return null; // No caching for pasted JSON
  }

  async detectTokenFiles(
    config: TokenSourceConfig,
    _onProgress: ProgressCallback
  ): Promise<string[]> {
    const c = config as JsonSourceConfig;
    return c.files.map(f => f.name);
  }

  async fetchFileContent(
    config: TokenSourceConfig,
    filePath: string
  ): Promise<string> {
    const c = config as JsonSourceConfig;
    const file = c.files.find(f => f.name === filePath);
    if (!file) throw new Error(`File "${filePath}" not found in provided JSON files`);
    return file.content;
  }
}
