/**
 * GitLab Token Source
 *
 * Supports GitLab Cloud and self-hosted instances.
 * Uses GitLab REST API v4 for repository access.
 *
 * Auth: Personal Access Token or Project Access Token
 * with `read_api` or `read_repository` scope.
 */

import {
  TokenSource,
  GitLabSourceConfig,
  TokenSourceConfig,
  TestConnectionResult,
  ProgressCallback,
  CacheKey,
} from './types';
import { decodeBase64Content } from './shared/base64';
import { isExcludedFile } from './shared/file-filter';

export class GitLabSource implements TokenSource {
  readonly type = 'gitlab' as const;

  /**
   * Parse a GitLab project URL into instance URL and project path.
   * Supports:
   *   https://gitlab.com/group/project
   *   https://gitlab.com/group/subgroup/project
   *   https://self-hosted.com/group/project
   */
  private parseUrl(config: GitLabSourceConfig): { instanceUrl: string; projectPath: string } {
    const url = config.projectUrl.replace(/\/+$/, '');
    const instanceUrl = config.instanceUrl || this.deriveInstanceUrl(url);

    // Extract project path from URL (everything after the instance URL)
    const instanceBase = instanceUrl.replace(/\/+$/, '');
    let projectPath = url;

    // Remove instance URL prefix if present
    if (url.startsWith(instanceBase)) {
      projectPath = url.substring(instanceBase.length).replace(/^\/+/, '');
    } else {
      // Try to extract from the URL path
      try {
        const parsed = new URL(url);
        projectPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
      } catch {
        throw new Error('Invalid GitLab project URL');
      }
    }

    // Remove .git suffix if present
    projectPath = projectPath.replace(/\.git$/, '');

    if (!projectPath) throw new Error('Could not determine project path from URL');

    return { instanceUrl: instanceBase, projectPath };
  }

  private deriveInstanceUrl(projectUrl: string): string {
    try {
      const url = new URL(projectUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return 'https://gitlab.com';
    }
  }

  private headers(token: string): Record<string, string> {
    return {
      'PRIVATE-TOKEN': token,
      'Accept': 'application/json',
    };
  }

  async testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult> {
    const c = config as GitLabSourceConfig;

    if (!c.projectUrl || !c.token) {
      return { success: false, error: 'Project URL and access token are required' };
    }

    try {
      const { instanceUrl, projectPath } = this.parseUrl(c);
      const encodedPath = encodeURIComponent(projectPath);

      onProgress('Connecting to GitLab...');
      const branchesUrl = `${instanceUrl}/api/v4/projects/${encodedPath}/repository/branches?per_page=20`;
      const branchesRes = await fetch(branchesUrl, { headers: this.headers(c.token) });

      if (!branchesRes.ok) {
        if (branchesRes.status === 401) return { success: false, error: 'Invalid access token. Ensure it has read_api scope.' };
        if (branchesRes.status === 404) return { success: false, error: 'Project not found. Check the URL and token permissions.' };
        return { success: false, error: `GitLab API error: ${branchesRes.status}` };
      }

      const branches: Array<{ name: string }> = await branchesRes.json();
      const branchNames = branches.map(b => b.name);

      if (branchNames.length > 0) {
        onProgress('Scanning for token files...');
        const files = await this.listTokenFiles(instanceUrl, encodedPath, branchNames[0], c.token, c.directoryPath);
        return {
          success: true,
          branches: branchNames,
          fileCount: files.length,
          sampleFiles: files.slice(0, 10),
        };
      }

      return { success: true, branches: branchNames, fileCount: 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async getCacheKey(config: TokenSourceConfig): Promise<CacheKey> {
    const c = config as GitLabSourceConfig;
    try {
      const { instanceUrl, projectPath } = this.parseUrl(c);
      const encodedPath = encodeURIComponent(projectPath);
      const url = `${instanceUrl}/api/v4/projects/${encodedPath}/repository/commits/${encodeURIComponent(c.branch)}`;
      const res = await fetch(url, { headers: this.headers(c.token) });
      if (!res.ok) return null;
      const data = await res.json();
      return data.id || null; // Commit SHA
    } catch {
      return null;
    }
  }

  async detectTokenFiles(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<string[]> {
    const c = config as GitLabSourceConfig;
    const { instanceUrl, projectPath } = this.parseUrl(c);
    const encodedPath = encodeURIComponent(projectPath);
    onProgress('Scanning for token files...');
    return this.listTokenFiles(instanceUrl, encodedPath, c.branch, c.token, c.directoryPath);
  }

  async fetchFileContent(
    config: TokenSourceConfig,
    filePath: string
  ): Promise<string> {
    const c = config as GitLabSourceConfig;
    const { instanceUrl, projectPath } = this.parseUrl(c);
    const encodedPath = encodeURIComponent(projectPath);
    const encodedFile = encodeURIComponent(filePath);

    const url = `${instanceUrl}/api/v4/projects/${encodedPath}/repository/files/${encodedFile}/raw?ref=${encodeURIComponent(c.branch)}`;
    const res = await fetch(url, { headers: this.headers(c.token) });

    if (!res.ok) throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
    return res.text();
  }

  /**
   * List JSON token files using the repository tree API.
   */
  private async listTokenFiles(
    instanceUrl: string,
    encodedPath: string,
    branch: string,
    token: string,
    directoryPath: string
  ): Promise<string[]> {
    const files: string[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const path = directoryPath ? `&path=${encodeURIComponent(directoryPath)}` : '';
      const url = `${instanceUrl}/api/v4/projects/${encodedPath}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=${perPage}&page=${page}${path}`;
      const res = await fetch(url, { headers: this.headers(token) });

      if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);

      const entries: Array<{ path: string; type: string }> = await res.json();
      if (entries.length === 0) break;

      for (const entry of entries) {
        if (entry.type === 'blob' && entry.path.endsWith('.json') && !isExcludedFile(entry.path)) {
          files.push(entry.path);
        }
      }

      if (entries.length < perPage) break;
      page++;
    }

    return files;
  }
}
