/**
 * BitBucket Token Source
 *
 * Supports BitBucket Cloud and self-hosted (Server/Data Center) instances.
 * Uses BitBucket REST API 2.0 (Cloud) and 1.0 (Server).
 *
 * Auth: Username + App Password (Cloud) or Personal Access Token (Server).
 */

import {
  TokenSource,
  BitBucketSourceConfig,
  TokenSourceConfig,
  TestConnectionResult,
  ProgressCallback,
  CacheKey,
} from './types';
import { isExcludedFile } from './shared/file-filter';

export class BitBucketSource implements TokenSource {
  readonly type = 'bitbucket' as const;

  /**
   * Parse a BitBucket repository URL.
   * Supports:
   *   https://bitbucket.org/workspace/repo
   *   https://self-hosted.com/projects/PROJ/repos/repo
   */
  private parseUrl(config: BitBucketSourceConfig): {
    isCloud: boolean;
    instanceUrl: string;
    workspace: string;
    slug: string;
  } {
    const url = config.repoUrl.replace(/\/+$/, '');
    const instanceUrl = config.instanceUrl || this.deriveInstanceUrl(url);
    const isCloud = instanceUrl.includes('bitbucket.org');

    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');

      if (isCloud && parts.length >= 2) {
        return { isCloud, instanceUrl, workspace: parts[0], slug: parts[1] };
      }

      // Self-hosted: /projects/PROJ/repos/REPO or /scm/PROJ/REPO
      if (parts.includes('repos') && parts.length >= 4) {
        const projIdx = parts.indexOf('projects');
        return {
          isCloud: false,
          instanceUrl,
          workspace: parts[projIdx + 1], // project key
          slug: parts[projIdx + 3],       // repo slug
        };
      }

      if (parts.length >= 2) {
        return { isCloud, instanceUrl, workspace: parts[0], slug: parts[1].replace(/\.git$/, '') };
      }
    } catch { /* fall through */ }

    throw new Error('Invalid BitBucket repository URL');
  }

  private deriveInstanceUrl(repoUrl: string): string {
    try {
      const url = new URL(repoUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return 'https://bitbucket.org';
    }
  }

  private headers(config: BitBucketSourceConfig): Record<string, string> {
    // BitBucket Cloud uses Basic auth with username:appPassword
    const credentials = btoa(`${config.username}:${config.appPassword}`);
    return {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
    };
  }

  async testConnection(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<TestConnectionResult> {
    const c = config as BitBucketSourceConfig;

    if (!c.repoUrl || !c.username || !c.appPassword) {
      return { success: false, error: 'Repository URL, username, and app password are required' };
    }

    try {
      const { isCloud, instanceUrl, workspace, slug } = this.parseUrl(c);

      onProgress('Connecting to BitBucket...');

      // Fetch branches
      const branchesUrl = isCloud
        ? `${instanceUrl}/api/2.0/repositories/${workspace}/${slug}/refs/branches?pagelen=20`
        : `${instanceUrl}/rest/api/1.0/projects/${workspace}/repos/${slug}/branches?limit=20`;

      const res = await fetch(branchesUrl, { headers: this.headers(c) });

      if (!res.ok) {
        if (res.status === 401) return { success: false, error: 'Invalid credentials. Check username and app password.' };
        if (res.status === 404) return { success: false, error: 'Repository not found. Check the URL and permissions.' };
        return { success: false, error: `BitBucket API error: ${res.status}` };
      }

      const data = await res.json();
      const branchNames = isCloud
        ? (data.values || []).map((b: any) => b.name)
        : (data.values || []).map((b: any) => b.displayId || b.id);

      if (branchNames.length > 0) {
        onProgress('Scanning for token files...');
        const files = await this.listTokenFiles(c, branchNames[0]);
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
    const c = config as BitBucketSourceConfig;
    try {
      const { isCloud, instanceUrl, workspace, slug } = this.parseUrl(c);
      const branchEncoded = encodeURIComponent(c.branch);

      const url = isCloud
        ? `${instanceUrl}/api/2.0/repositories/${workspace}/${slug}/refs/branches/${branchEncoded}`
        : `${instanceUrl}/rest/api/1.0/projects/${workspace}/repos/${slug}/branches?filterText=${branchEncoded}&limit=1`;

      const res = await fetch(url, { headers: this.headers(c) });
      if (!res.ok) return null;

      const data = await res.json();
      // Cloud: target.hash, Server: values[0].latestCommit
      return isCloud
        ? data.target?.hash || null
        : data.values?.[0]?.latestCommit || null;
    } catch {
      return null;
    }
  }

  async detectTokenFiles(
    config: TokenSourceConfig,
    onProgress: ProgressCallback
  ): Promise<string[]> {
    const c = config as BitBucketSourceConfig;
    onProgress('Scanning for token files...');
    return this.listTokenFiles(c, c.branch);
  }

  async fetchFileContent(
    config: TokenSourceConfig,
    filePath: string
  ): Promise<string> {
    const c = config as BitBucketSourceConfig;
    const { isCloud, instanceUrl, workspace, slug } = this.parseUrl(c);
    const branchEncoded = encodeURIComponent(c.branch);

    const url = isCloud
      ? `${instanceUrl}/api/2.0/repositories/${workspace}/${slug}/src/${branchEncoded}/${filePath}`
      : `${instanceUrl}/rest/api/1.0/projects/${workspace}/repos/${slug}/raw/${filePath}?at=${branchEncoded}`;

    const res = await fetch(url, { headers: this.headers(c) });
    if (!res.ok) throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
    return res.text();
  }

  /**
   * List JSON token files in the repository.
   */
  private async listTokenFiles(config: BitBucketSourceConfig, branch: string): Promise<string[]> {
    const { isCloud, instanceUrl, workspace, slug } = this.parseUrl(config);
    const branchEncoded = encodeURIComponent(branch);
    const files: string[] = [];

    if (isCloud) {
      // BitBucket Cloud: use src endpoint with recursive directory listing
      let url: string | null = `${instanceUrl}/api/2.0/repositories/${workspace}/${slug}/src/${branchEncoded}/${config.directoryPath || ''}?pagelen=100`;

      while (url) {
        const res = await fetch(url, { headers: this.headers(config) });
        if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);

        const data = await res.json();
        for (const entry of data.values || []) {
          if (entry.type === 'commit_file' && entry.path?.endsWith('.json') && !isExcludedFile(entry.path)) {
            files.push(entry.path);
          }
        }
        url = data.next || null;
      }
    } else {
      // BitBucket Server: use files endpoint
      let start = 0;
      const limit = 100;
      let isLastPage = false;

      while (!isLastPage) {
        const path = config.directoryPath ? `/${config.directoryPath}` : '';
        const url = `${instanceUrl}/rest/api/1.0/projects/${workspace}/repos/${slug}/files${path}?at=${branchEncoded}&limit=${limit}&start=${start}`;
        const res = await fetch(url, { headers: this.headers(config) });
        if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);

        const data = await res.json();
        for (const filePath of data.values || []) {
          if (filePath.endsWith('.json') && !isExcludedFile(filePath)) {
            files.push(filePath);
          }
        }
        isLastPage = data.isLastPage !== false;
        start = data.nextPageStart || 0;
      }
    }

    return files;
  }
}
