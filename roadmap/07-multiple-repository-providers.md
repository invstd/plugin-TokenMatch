# Feature: Multiple Repository Providers

## Overview

Extend repository connectivity beyond GitHub to support BitBucket, GitLab, and custom Git URLs. This enables teams using different version control platforms to connect their token repositories to TokensMatch.

## User Story

As a design system maintainer, I want to connect my token repository from BitBucket, GitLab, or a self-hosted Git server, so I can use TokensMatch regardless of which version control platform my team uses.

## Feature Specifications

### Core Functionality

1. **Provider Selection**
   - Support for GitHub (existing)
   - Support for GitLab (Cloud and Self-Managed)
   - Support for BitBucket (Cloud and Server/Data Center)
   - Support for custom Git URLs (generic Git hosting)

2. **Authentication Methods**
   - OAuth flow for cloud providers (GitHub, GitLab Cloud, BitBucket Cloud)
   - Personal Access Token (PAT) for all providers
   - App passwords for BitBucket
   - Deploy tokens for GitLab
   - SSH key support for custom URLs (advanced)

3. **Repository Browsing**
   - List user's repositories (where API available)
   - Search repositories by name
   - Browse branches and directories
   - Select token file/folder path

4. **Provider-Specific Features**
   - GitHub: Organizations, GitHub Apps
   - GitLab: Groups, Subgroups, Project access tokens
   - BitBucket: Workspaces, Projects
   - Custom: Direct URL input with authentication

### User Interface

#### Provider Selection Screen

```
┌─────────────────────────────────────────────────────────┐
│ Connect Token Repository                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Select your Git provider:                              │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │   GitHub    │ │   GitLab    │ │  BitBucket  │       │
│  │     🐙      │ │     🦊      │ │     🪣      │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │              Custom Git URL                  │       │
│  │                 🔗                           │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
│  Currently connected: GitHub - owner/repo              │
│  [ Change Provider ]                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Provider Configuration Views

**GitHub (existing, enhanced)**
```
┌─────────────────────────────────────────────────────────┐
│ GitHub Configuration                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Authentication:                                        │
│  ○ OAuth (Recommended)        [ Sign in with GitHub ]  │
│  ○ Personal Access Token      [__________________]     │
│                                                         │
│  Repository:                                            │
│  Owner: [________▼]  Repo: [________________▼]         │
│                                                         │
│  Branch: [main_____▼]                                   │
│                                                         │
│  Token path: [/tokens_________________]  [ Browse ]     │
│                                                         │
│  [ Test Connection ]              [ Connect ]           │
└─────────────────────────────────────────────────────────┘
```

**GitLab Configuration**
```
┌─────────────────────────────────────────────────────────┐
│ GitLab Configuration                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Instance:                                              │
│  ○ GitLab.com (Cloud)                                  │
│  ○ Self-Managed: [https://gitlab.company.com____]      │
│                                                         │
│  Authentication:                                        │
│  ○ OAuth (GitLab.com only)    [ Sign in with GitLab ] │
│  ○ Personal Access Token      [__________________]     │
│  ○ Project/Group Access Token [__________________]     │
│                                                         │
│  Project:                                               │
│  Group: [________▼]  Project: [_______________▼]       │
│                                                         │
│  Branch: [main_____▼]                                   │
│                                                         │
│  Token path: [/tokens_________________]  [ Browse ]     │
│                                                         │
│  [ Test Connection ]              [ Connect ]           │
└─────────────────────────────────────────────────────────┘
```

**BitBucket Configuration**
```
┌─────────────────────────────────────────────────────────┐
│ BitBucket Configuration                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Instance:                                              │
│  ○ BitBucket Cloud (bitbucket.org)                     │
│  ○ BitBucket Server/Data Center:                       │
│    [https://bitbucket.company.com_________]            │
│                                                         │
│  Authentication:                                        │
│  ○ OAuth (Cloud only)         [ Sign in with BitBucket]│
│  ○ App Password               [__________________]     │
│  ○ HTTP Access Token (Server) [__________________]     │
│                                                         │
│  Repository:                                            │
│  Workspace: [_______▼]  Repo: [_______________▼]       │
│                                                         │
│  Branch: [main_____▼]                                   │
│                                                         │
│  Token path: [/tokens_________________]  [ Browse ]     │
│                                                         │
│  [ Test Connection ]              [ Connect ]           │
└─────────────────────────────────────────────────────────┘
```

**Custom Git URL Configuration**
```
┌─────────────────────────────────────────────────────────┐
│ Custom Git URL Configuration                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Repository URL:                                        │
│  [https://git.company.com/team/tokens.git______]       │
│                                                         │
│  Authentication:                                        │
│  ○ None (Public repository)                            │
│  ○ Username/Password                                   │
│    Username: [____________]                            │
│    Password: [____________]                            │
│  ○ Access Token                                        │
│    Token: [________________________]                   │
│                                                         │
│  Branch: [main_____________]                            │
│                                                         │
│  Token path: [/tokens_________________]                 │
│                                                         │
│  Note: For custom URLs, you'll need to enter the       │
│  exact path to your token files.                       │
│                                                         │
│  [ Test Connection ]              [ Connect ]           │
└─────────────────────────────────────────────────────────┘
```

### Supported Providers

| Provider | Auth Methods | API Features | Notes |
|----------|--------------|--------------|-------|
| GitHub | OAuth, PAT | Full (repos, branches, files) | Existing support |
| GitLab Cloud | OAuth, PAT | Full (projects, branches, files) | Groups/Subgroups |
| GitLab Self-Managed | PAT, Project Token | Full (with API access) | Requires API enabled |
| BitBucket Cloud | OAuth, App Password | Full (repos, branches, files) | Workspaces |
| BitBucket Server | HTTP Token | Limited | Older API |
| Custom URL | Token, Basic Auth | Limited (raw file fetch) | Manual path entry |

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/repository.ts`)

```typescript
type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'custom';

interface ProviderConfig {
  provider: GitProvider;
  instanceUrl?: string;           // For self-hosted instances
  auth: AuthConfig;
  repository: RepositoryInfo;
  tokenPath: string;
  branch: string;
}

interface AuthConfig {
  method: 'oauth' | 'pat' | 'app-password' | 'http-token' | 'basic' | 'none';
  token?: string;
  username?: string;
  password?: string;
  expiresAt?: Date;
}

interface RepositoryInfo {
  // GitHub
  owner?: string;
  repo?: string;

  // GitLab
  groupPath?: string;
  projectPath?: string;
  projectId?: number;

  // BitBucket
  workspace?: string;
  repoSlug?: string;

  // Custom
  url?: string;

  // Common
  fullPath: string;               // Normalized full path
  defaultBranch?: string;
}

interface ProviderCapabilities {
  supportsOAuth: boolean;
  supportsRepoBrowsing: boolean;
  supportsBranchListing: boolean;
  supportsFileBrowsing: boolean;
  supportsWebhooks: boolean;
  requiresInstanceUrl: boolean;
}

// API response normalization
interface NormalizedRepository {
  id: string;
  name: string;
  fullPath: string;
  defaultBranch: string;
  private: boolean;
  description?: string;
}

interface NormalizedBranch {
  name: string;
  isDefault: boolean;
  lastCommit?: string;
}

interface NormalizedFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}
```

### Service Layer

#### Provider Abstraction: `repository-provider.ts`

```typescript
// services/repository-provider.ts

export interface RepositoryProvider {
  readonly name: GitProvider;
  readonly capabilities: ProviderCapabilities;

  /**
   * Authenticate with the provider
   */
  authenticate(auth: AuthConfig): Promise<boolean>;

  /**
   * Test connection and permissions
   */
  testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * List accessible repositories
   */
  listRepositories(
    options?: { search?: string; page?: number }
  ): Promise<NormalizedRepository[]>;

  /**
   * List branches for a repository
   */
  listBranches(repo: RepositoryInfo): Promise<NormalizedBranch[]>;

  /**
   * Browse directory contents
   */
  browseDirectory(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<NormalizedFileEntry[]>;

  /**
   * Fetch file content
   */
  fetchFile(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<string>;

  /**
   * Fetch multiple files (for folder paths)
   */
  fetchFiles(
    repo: RepositoryInfo,
    branch: string,
    paths: string[]
  ): Promise<Map<string, string>>;
}

export abstract class BaseRepositoryProvider implements RepositoryProvider {
  abstract readonly name: GitProvider;
  abstract readonly capabilities: ProviderCapabilities;

  protected auth: AuthConfig | null = null;
  protected instanceUrl: string;

  constructor(instanceUrl?: string) {
    this.instanceUrl = instanceUrl || this.getDefaultInstanceUrl();
  }

  protected abstract getDefaultInstanceUrl(): string;
  protected abstract getAuthHeaders(): Record<string, string>;

  async authenticate(auth: AuthConfig): Promise<boolean> {
    this.auth = auth;
    const test = await this.testConnection();
    return test.success;
  }

  // Common HTTP helper
  protected async apiRequest<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${this.instanceUrl}${endpoint}`, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
        ...options?.headers
      }
    });

    if (!response.ok) {
      throw new ProviderError(
        `API request failed: ${response.status}`,
        this.name,
        response.status
      );
    }

    return response.json();
  }
}
```

#### GitHub Provider (refactored): `github-provider.ts`

```typescript
// services/providers/github-provider.ts

export class GitHubProvider extends BaseRepositoryProvider {
  readonly name: GitProvider = 'github';
  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,
    supportsRepoBrowsing: true,
    supportsBranchListing: true,
    supportsFileBrowsing: true,
    supportsWebhooks: true,
    requiresInstanceUrl: false
  };

  protected getDefaultInstanceUrl(): string {
    return 'https://api.github.com';
  }

  protected getAuthHeaders(): Record<string, string> {
    if (!this.auth?.token) return {};
    return { Authorization: `Bearer ${this.auth.token}` };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiRequest('/user');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listRepositories(options?: { search?: string; page?: number }): Promise<NormalizedRepository[]> {
    const repos = await this.apiRequest<GitHubRepo[]>(
      `/user/repos?per_page=100&page=${options?.page || 1}`
    );

    return repos.map(repo => ({
      id: repo.id.toString(),
      name: repo.name,
      fullPath: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private,
      description: repo.description
    }));
  }

  async listBranches(repo: RepositoryInfo): Promise<NormalizedBranch[]> {
    const branches = await this.apiRequest<GitHubBranch[]>(
      `/repos/${repo.owner}/${repo.repo}/branches`
    );

    return branches.map(branch => ({
      name: branch.name,
      isDefault: branch.name === repo.defaultBranch,
      lastCommit: branch.commit?.sha
    }));
  }

  async browseDirectory(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<NormalizedFileEntry[]> {
    const contents = await this.apiRequest<GitHubContent[]>(
      `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${branch}`
    );

    return contents.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'directory' : 'file',
      size: item.size
    }));
  }

  async fetchFile(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<string> {
    const content = await this.apiRequest<GitHubContent>(
      `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${branch}`
    );

    if (content.encoding === 'base64') {
      return atob(content.content);
    }
    return content.content;
  }
}
```

#### GitLab Provider: `gitlab-provider.ts`

```typescript
// services/providers/gitlab-provider.ts

export class GitLabProvider extends BaseRepositoryProvider {
  readonly name: GitProvider = 'gitlab';
  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,  // Only for gitlab.com
    supportsRepoBrowsing: true,
    supportsBranchListing: true,
    supportsFileBrowsing: true,
    supportsWebhooks: true,
    requiresInstanceUrl: false  // Optional for self-managed
  };

  protected getDefaultInstanceUrl(): string {
    return 'https://gitlab.com/api/v4';
  }

  protected getAuthHeaders(): Record<string, string> {
    if (!this.auth?.token) return {};
    return { 'PRIVATE-TOKEN': this.auth.token };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiRequest('/user');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listRepositories(options?: { search?: string; page?: number }): Promise<NormalizedRepository[]> {
    const endpoint = options?.search
      ? `/projects?search=${encodeURIComponent(options.search)}&membership=true`
      : `/projects?membership=true&per_page=100&page=${options?.page || 1}`;

    const projects = await this.apiRequest<GitLabProject[]>(endpoint);

    return projects.map(project => ({
      id: project.id.toString(),
      name: project.name,
      fullPath: project.path_with_namespace,
      defaultBranch: project.default_branch,
      private: project.visibility !== 'public',
      description: project.description
    }));
  }

  async listBranches(repo: RepositoryInfo): Promise<NormalizedBranch[]> {
    const projectId = encodeURIComponent(repo.projectPath || repo.fullPath);
    const branches = await this.apiRequest<GitLabBranch[]>(
      `/projects/${projectId}/repository/branches`
    );

    return branches.map(branch => ({
      name: branch.name,
      isDefault: branch.default,
      lastCommit: branch.commit?.id
    }));
  }

  async browseDirectory(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<NormalizedFileEntry[]> {
    const projectId = encodeURIComponent(repo.projectPath || repo.fullPath);
    const encodedPath = encodeURIComponent(path || '');

    const tree = await this.apiRequest<GitLabTreeItem[]>(
      `/projects/${projectId}/repository/tree?ref=${branch}&path=${encodedPath}`
    );

    return tree.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type === 'tree' ? 'directory' : 'file'
    }));
  }

  async fetchFile(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<string> {
    const projectId = encodeURIComponent(repo.projectPath || repo.fullPath);
    const encodedPath = encodeURIComponent(path);

    const file = await this.apiRequest<GitLabFile>(
      `/projects/${projectId}/repository/files/${encodedPath}?ref=${branch}`
    );

    return atob(file.content);
  }
}
```

#### BitBucket Provider: `bitbucket-provider.ts`

```typescript
// services/providers/bitbucket-provider.ts

export class BitBucketProvider extends BaseRepositoryProvider {
  readonly name: GitProvider = 'bitbucket';
  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: true,  // Cloud only
    supportsRepoBrowsing: true,
    supportsBranchListing: true,
    supportsFileBrowsing: true,
    supportsWebhooks: true,
    requiresInstanceUrl: false
  };

  private isServer: boolean = false;

  constructor(instanceUrl?: string) {
    super(instanceUrl);
    this.isServer = !!instanceUrl && !instanceUrl.includes('bitbucket.org');
  }

  protected getDefaultInstanceUrl(): string {
    return 'https://api.bitbucket.org/2.0';
  }

  protected getAuthHeaders(): Record<string, string> {
    if (!this.auth) return {};

    if (this.auth.method === 'basic' || this.auth.method === 'app-password') {
      const credentials = btoa(`${this.auth.username}:${this.auth.password || this.auth.token}`);
      return { Authorization: `Basic ${credentials}` };
    }

    if (this.auth.token) {
      return { Authorization: `Bearer ${this.auth.token}` };
    }

    return {};
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiRequest('/user');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listRepositories(options?: { search?: string; page?: number }): Promise<NormalizedRepository[]> {
    // First get workspaces, then repos
    const workspaces = await this.apiRequest<BitBucketPaginated<BitBucketWorkspace>>(
      '/workspaces'
    );

    const allRepos: NormalizedRepository[] = [];

    for (const workspace of workspaces.values) {
      const repos = await this.apiRequest<BitBucketPaginated<BitBucketRepo>>(
        `/repositories/${workspace.slug}`
      );

      allRepos.push(...repos.values.map(repo => ({
        id: repo.uuid,
        name: repo.name,
        fullPath: repo.full_name,
        defaultBranch: repo.mainbranch?.name || 'main',
        private: repo.is_private,
        description: repo.description
      })));
    }

    return allRepos;
  }

  async listBranches(repo: RepositoryInfo): Promise<NormalizedBranch[]> {
    const branches = await this.apiRequest<BitBucketPaginated<BitBucketBranch>>(
      `/repositories/${repo.workspace}/${repo.repoSlug}/refs/branches`
    );

    return branches.values.map(branch => ({
      name: branch.name,
      isDefault: branch.name === repo.defaultBranch,
      lastCommit: branch.target?.hash
    }));
  }

  async browseDirectory(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<NormalizedFileEntry[]> {
    const contents = await this.apiRequest<BitBucketPaginated<BitBucketSrcItem>>(
      `/repositories/${repo.workspace}/${repo.repoSlug}/src/${branch}/${path}`
    );

    return contents.values.map(item => ({
      name: item.path.split('/').pop() || item.path,
      path: item.path,
      type: item.type === 'commit_directory' ? 'directory' : 'file',
      size: item.size
    }));
  }

  async fetchFile(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<string> {
    const response = await fetch(
      `${this.instanceUrl}/repositories/${repo.workspace}/${repo.repoSlug}/src/${branch}/${path}`,
      { headers: this.getAuthHeaders() }
    );

    if (!response.ok) {
      throw new ProviderError(`Failed to fetch file: ${response.status}`, this.name, response.status);
    }

    return response.text();
  }
}
```

#### Custom URL Provider: `custom-provider.ts`

```typescript
// services/providers/custom-provider.ts

export class CustomUrlProvider extends BaseRepositoryProvider {
  readonly name: GitProvider = 'custom';
  readonly capabilities: ProviderCapabilities = {
    supportsOAuth: false,
    supportsRepoBrowsing: false,
    supportsBranchListing: false,
    supportsFileBrowsing: false,
    supportsWebhooks: false,
    requiresInstanceUrl: true
  };

  protected getDefaultInstanceUrl(): string {
    return '';  // Must be provided
  }

  protected getAuthHeaders(): Record<string, string> {
    if (!this.auth) return {};

    if (this.auth.method === 'basic') {
      const credentials = btoa(`${this.auth.username}:${this.auth.password}`);
      return { Authorization: `Basic ${credentials}` };
    }

    if (this.auth.token) {
      return { Authorization: `Bearer ${this.auth.token}` };
    }

    return {};
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to fetch the configured path
      const response = await fetch(this.instanceUrl, {
        headers: this.getAuthHeaders()
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listRepositories(): Promise<NormalizedRepository[]> {
    // Not supported for custom URLs
    throw new ProviderError('Repository listing not supported for custom URLs', this.name);
  }

  async listBranches(): Promise<NormalizedBranch[]> {
    // Not supported for custom URLs
    throw new ProviderError('Branch listing not supported for custom URLs', this.name);
  }

  async browseDirectory(): Promise<NormalizedFileEntry[]> {
    // Not supported for custom URLs
    throw new ProviderError('Directory browsing not supported for custom URLs', this.name);
  }

  async fetchFile(
    repo: RepositoryInfo,
    branch: string,
    path: string
  ): Promise<string> {
    // Construct raw file URL based on common patterns
    const url = this.constructRawUrl(repo.url!, branch, path);

    const response = await fetch(url, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new ProviderError(`Failed to fetch file: ${response.status}`, this.name, response.status);
    }

    return response.text();
  }

  private constructRawUrl(baseUrl: string, branch: string, path: string): string {
    // Handle different Git hosting patterns

    // Gitea/Gogs pattern
    if (baseUrl.includes('/api/')) {
      return `${baseUrl}/raw/${branch}/${path}`;
    }

    // Generic pattern - assume raw endpoint
    const cleanUrl = baseUrl.replace(/\.git$/, '');
    return `${cleanUrl}/raw/${branch}/${path}`;
  }
}
```

#### Provider Factory: `provider-factory.ts`

```typescript
// services/provider-factory.ts

export class ProviderFactory {
  static create(config: ProviderConfig): RepositoryProvider {
    switch (config.provider) {
      case 'github':
        return new GitHubProvider(config.instanceUrl);

      case 'gitlab':
        return new GitLabProvider(config.instanceUrl || 'https://gitlab.com/api/v4');

      case 'bitbucket':
        return new BitBucketProvider(config.instanceUrl);

      case 'custom':
        if (!config.instanceUrl) {
          throw new Error('Custom provider requires instanceUrl');
        }
        return new CustomUrlProvider(config.instanceUrl);

      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  static getCapabilities(provider: GitProvider): ProviderCapabilities {
    const instance = this.create({ provider } as ProviderConfig);
    return instance.capabilities;
  }
}
```

### UI Modifications

#### New State

```typescript
// Add to existing state in ui.tsx
const [selectedProvider, setSelectedProvider] = useState<GitProvider>('github');
const [providerConfig, setProviderConfig] = useState<Partial<ProviderConfig>>({});
const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'testing' | 'connected' | 'error'>('disconnected');
const [connectionError, setConnectionError] = useState<string | null>(null);
const [repositories, setRepositories] = useState<NormalizedRepository[]>([]);
const [branches, setBranches] = useState<NormalizedBranch[]>([]);
const [directoryContents, setDirectoryContents] = useState<NormalizedFileEntry[]>([]);
```

#### Provider Selection Component

```typescript
const ProviderSelector = () => {
  const providers: { id: GitProvider; name: string; icon: string }[] = [
    { id: 'github', name: 'GitHub', icon: '🐙' },
    { id: 'gitlab', name: 'GitLab', icon: '🦊' },
    { id: 'bitbucket', name: 'BitBucket', icon: '🪣' },
    { id: 'custom', name: 'Custom URL', icon: '🔗' }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {providers.map(provider => (
        <button
          key={provider.id}
          className={`p-4 rounded-lg border-2 text-center transition-all
            ${selectedProvider === provider.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
            }`}
          onClick={() => setSelectedProvider(provider.id)}
        >
          <span className="text-2xl">{provider.icon}</span>
          <span className="block mt-1 font-medium">{provider.name}</span>
        </button>
      ))}
    </div>
  );
};
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/repository-provider.ts` | Base provider interface and abstract class |
| `services/providers/github-provider.ts` | GitHub API integration (refactored) |
| `services/providers/gitlab-provider.ts` | GitLab API integration |
| `services/providers/bitbucket-provider.ts` | BitBucket API integration |
| `services/providers/custom-provider.ts` | Custom Git URL support |
| `services/provider-factory.ts` | Provider instantiation factory |
| `types/repository.ts` | Type definitions for providers |
| `components/ProviderSelector.tsx` | Provider selection UI |
| `components/ProviderConfigForm.tsx` | Provider-specific config forms |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui.tsx` | Add provider selection, multi-provider config UI |
| `src/main.ts` | Handle provider switching, credential storage |
| `services/github-service.ts` | Refactor to use provider abstraction |

---

## UI/UX Considerations

### Visual Design

1. **Provider Icons**: Clear, recognizable icons for each provider
2. **Connection Status**: Visual indicator (green/yellow/red) for connection health
3. **Capability Indicators**: Show what features are available per provider
4. **Self-Hosted Badge**: Indicate when using self-managed instances

### Interaction Flow

1. User opens plugin repository settings
2. User selects Git provider
3. For self-hosted, user enters instance URL
4. User authenticates (OAuth or token)
5. User browses/searches repositories (if supported)
6. User selects repository and branch
7. User navigates to token file/folder
8. Connection is tested and saved

### Edge Cases

1. **OAuth Not Available**: Gracefully fall back to PAT entry
2. **Self-Hosted Unavailable**: Clear error messaging
3. **API Rate Limits**: Handle 429 responses, show retry info
4. **Expired Tokens**: Prompt for re-authentication
5. **Permission Denied**: Explain required scopes/permissions

---

## Testing Strategy

### Unit Tests

1. Provider factory creates correct provider instances
2. Each provider normalizes API responses correctly
3. Authentication header generation
4. URL construction for file fetching

### Integration Tests

1. OAuth flow completion (mock OAuth server)
2. Repository listing and filtering
3. Branch and directory browsing
4. File content fetching
5. Error handling for API failures

### Manual Testing

1. Test with real accounts on each provider
2. Verify OAuth flows in browser
3. Test self-hosted instances (GitLab CE, BitBucket Server)
4. Verify custom URL handling with various Git hosts

---

## Security Considerations

1. **Token Storage**: Encrypt tokens in plugin storage
2. **OAuth Scopes**: Request minimum necessary permissions
3. **Token Expiry**: Handle and refresh expired tokens
4. **Self-Hosted Trust**: Warn users about trusting self-hosted URLs
5. **HTTPS Only**: Enforce HTTPS for all API calls

---

## Future Enhancements

1. **Azure DevOps**: Add Azure Repos support
2. **SSH Keys**: Support SSH authentication for advanced users
3. **Multi-Repo**: Connect multiple token repositories simultaneously
4. **Webhooks**: Auto-sync when repository changes
5. **Offline Mode**: Cache tokens for offline use
