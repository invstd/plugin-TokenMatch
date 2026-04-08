/**
 * GitHub Token Source
 *
 * Thin adapter wrapping the existing GitHubTokenService to implement
 * the TokenSource interface. Does not rewrite any GitHub logic.
 */

import { GitHubTokenService } from '../github-token-service';
import {
  TokenSource,
  GitHubSourceConfig,
  TokenSourceConfig,
  TestConnectionResult,
  ProgressCallback,
  CacheKey,
} from './types';
import { isExcludedFile } from './shared/file-filter';

export class GitHubSource implements TokenSource {
  readonly type = 'github' as const;
  private service = new GitHubTokenService();

  private parse(config: TokenSourceConfig): { owner: string; repo: string } {
    const c = config as GitHubSourceConfig;
    const parsed = this.service.parseGitHubUrl(c.repoUrl);
    if (!parsed) throw new Error('Invalid GitHub repository URL');
    return parsed;
  }

  async testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult> {
    try {
      const c = config as GitHubSourceConfig;
      const { owner, repo } = this.parse(c);

      onProgress('Connecting to GitHub...');
      const branches = await this.service.fetchBranches(owner, repo, c.token);
      if (!branches || branches.length === 0) {
        return { success: false, error: 'No branches found. Check your repository URL and token.' };
      }

      onProgress('Scanning for token files...');
      const files = await this.service.detectTokenFiles(
        owner, repo, branches[0], c.token, c.directoryPath
      );

      return {
        success: true,
        branches,
        fileCount: files.length,
        sampleFiles: files.slice(0, 10),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async getCacheKey(config: TokenSourceConfig): Promise<CacheKey> {
    try {
      const c = config as GitHubSourceConfig;
      const { owner, repo } = this.parse(c);
      return await this.service.getLatestCommitSha(owner, repo, c.branch, c.token);
    } catch {
      return null;
    }
  }

  async detectTokenFiles(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<string[]> {
    const c = config as GitHubSourceConfig;
    const { owner, repo } = this.parse(c);
    onProgress('Detecting token files...');
    return this.service.detectTokenFiles(owner, repo, c.branch, c.token, c.directoryPath);
  }

  async fetchFileContent(
    config: TokenSourceConfig,
    filePath: string
  ): Promise<string> {
    const c = config as GitHubSourceConfig;
    const { owner, repo } = this.parse(c);
    const file = await this.service.fetchFileContents(owner, repo, c.branch, c.token, filePath);
    return this.service.decodeBase64Content(file.content!);
  }
}
