/**
 * GitHub Token Service
 * Handles fetching and parsing design tokens from GitHub repositories
 */

import { TokenParser } from './token-parser';
import { ParsedTokens, TokenFile } from '../types/tokens';

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: 'file' | 'dir';
  content?: string; // Base64 encoded
  encoding?: string;
}

export class GitHubTokenService {
  private parser: TokenParser;

  constructor() {
    this.parser = new TokenParser();
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [
      /github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?$/,
      /github\.com\/([^\/]+)\/([^\/]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
    return null;
  }

  /**
   * Fetch branches from GitHub repository
   */
  async fetchBranches(owner: string, repo: string, token: string): Promise<string[]> {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      const branches = await response.json();
      return branches.map((branch: { name: string }) => branch.name);
    } catch (error) {
      throw new Error(`Failed to fetch branches: ${error}`);
    }
  }

  /**
   * OPTIMIZATION: Get the latest commit SHA for a branch
   * Used for cache invalidation - if SHA hasn't changed, tokens haven't changed
   */
  async getLatestCommitSha(
    owner: string,
    repo: string,
    branch: string,
    token: string
  ): Promise<string | null> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        console.warn(`Failed to get commit SHA: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return data.sha || null;
    } catch (error) {
      console.warn('Failed to get latest commit SHA:', error);
      return null;
    }
  }

  /**
   * Fetch file contents from GitHub
   */
  async fetchFileContents(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    path: string
  ): Promise<GitHubFileContent> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to fetch file contents: ${error}`);
    }
  }

  /**
   * Fetch directory contents from GitHub
   */
  async fetchDirectoryContents(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    path: string = ''
  ): Promise<GitHubFileContent[]> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      const contents = await response.json();
      return Array.isArray(contents) ? contents : [contents];
    } catch (error) {
      throw new Error(`Failed to fetch directory contents: ${error}`);
    }
  }

  /**
   * Decode base64 content from GitHub API
   * Note: Figma plugins don't have atob, so we implement it manually
   */
  decodeBase64Content(encodedContent: string): string {
    try {
      // Remove whitespace (GitHub API returns base64 with newlines)
      const clean = encodedContent.replace(/\s/g, '');
      
      // Decode base64 to binary string
      let binaryString: string;
      if (typeof atob === 'function') {
        binaryString = atob(clean);
      } else {
        // Fallback manual decode for environments without atob
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        binaryString = '';
        let i = 0;
        const cleanNoPad = clean.replace(/=+$/, '');
        while (i < cleanNoPad.length) {
          const enc1 = chars.indexOf(cleanNoPad.charAt(i++));
          const enc2 = chars.indexOf(cleanNoPad.charAt(i++));
          const enc3 = chars.indexOf(cleanNoPad.charAt(i++));
          const enc4 = chars.indexOf(cleanNoPad.charAt(i++));
          const bitmap = (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);
          binaryString += String.fromCharCode((bitmap >> 16) & 255);
          if (enc3 !== -1) binaryString += String.fromCharCode((bitmap >> 8) & 255);
          if (enc4 !== -1) binaryString += String.fromCharCode(bitmap & 255);
        }
      }
      
      // Convert binary string to UTF-8
      let result: string;
      if (typeof TextDecoder !== 'undefined') {
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        result = new TextDecoder('utf-8').decode(bytes);
      } else {
        // Fallback: decodeURIComponent + escape trick for UTF-8
        try {
          result = decodeURIComponent(escape(binaryString));
        } catch {
          result = binaryString;
        }
      }
      
      // Clean up common issues:
      // 1. Remove BOM (Byte Order Mark)
      if (result.charCodeAt(0) === 0xFEFF) {
        result = result.slice(1);
      }
      // 2. Remove null bytes
      result = result.replace(/\0/g, '');
      // 3. Trim whitespace
      result = result.trim();
      
      return result;
    } catch (error) {
      throw new Error(`Failed to decode base64 content: ${error}`);
    }
  }

  /**
   * Parse JSON content from GitHub file
   */
  parseJSONContent(content: string): TokenFile {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }

  /**
   * Token flattener: finds tokens in multiple formats recursively.
   * Supports: W3C ($value), Token Studio (value), and plain nested primitives
   */
  private flattenTokens(node: any, path: string[] = []): ParsedTokens {
    const tokens: any[] = [];
    const errors: any[] = [];

    const isW3CToken = (obj: any) => obj && typeof obj === 'object' && ('$value' in obj);
    
    const isTokenStudioToken = (obj: any) => {
      if (!obj || typeof obj !== 'object') return false;
      if ('$value' in obj) return false;
      if (!('value' in obj)) return false;
      const value = obj.value;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return true;
      }
      if (typeof value === 'object' && value !== null) {
        // Check if parent has explicit token properties
        if ('type' in obj || 'description' in obj) return true;
        
        // Check if value object looks like a known composite token type
        const valueKeys = Object.keys(value);
        
        // Border composite token (has color + width or style)
        if (valueKeys.some(k => ['color', 'width', 'style'].includes(k.toLowerCase()))) {
          const borderProps = valueKeys.filter(k => 
            ['color', 'width', 'style', 'bordercolor', 'borderwidth', 'borderstyle'].includes(k.toLowerCase())
          );
          if (borderProps.length >= 2) return true;
        }
        
        // Typography composite token
        if (valueKeys.some(k => ['fontfamily', 'fontsize', 'fontweight', 'lineheight', 'letterspacing'].includes(k.toLowerCase()))) {
          return true;
        }
        
        // Shadow composite token
        if (valueKeys.some(k => ['blur', 'spread', 'offsetx', 'offsety', 'x', 'y'].includes(k.toLowerCase())) &&
            valueKeys.some(k => k.toLowerCase() === 'color')) {
          return true;
        }
        
        // If value contains alias references, likely a composite token
        if (valueKeys.length <= 6 && valueKeys.length >= 2) {
          const hasAliasValues = valueKeys.some(k => {
            const v = value[k];
            return typeof v === 'string' && (v.startsWith('{') || v.startsWith('$'));
          });
          if (hasAliasValues) return true;
        }
      }
      return false;
    };

    const isPrimitiveToken = (value: any, p: string[]): boolean => {
      // Must be a primitive
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return false;
      }
      // Must have at least 1 level of nesting
      if (p.length < 1) return false;
      
      // PERMISSIVE: Accept ALL primitives at depth 1+ as potential tokens
      return true;
    };

    const inferType = (val: any, p: string[]): string => {
      const ps = p.join('.').toLowerCase();
      
      // Handle composite object values (border, typography, shadow)
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const keys = Object.keys(val).map(k => k.toLowerCase());
        
        // Border composite: has color + width or style
        if (keys.some(k => ['width', 'style'].includes(k)) && keys.includes('color')) {
          return 'border';
        }
        
        // Typography composite: has fontFamily, fontSize, etc.
        if (keys.some(k => ['fontfamily', 'fontsize', 'fontweight', 'lineheight'].includes(k))) {
          return 'typography';
        }
        
        // Shadow composite: has blur, spread, offset, color
        if (keys.some(k => ['blur', 'spread', 'x', 'y', 'offsetx', 'offsety'].includes(k))) {
          return 'shadow';
        }
      }
      
      if (typeof val === 'string') {
        if (val.match(/^#[0-9A-Fa-f]{3,8}$/) || val.match(/^rgba?\(/) || val.match(/^hsla?\(/) || ps.includes('color')) return 'color';
        if (val.match(/^\d+(\.\d+)?(ms|s)$/) || ps.includes('duration')) return 'duration';
        if (val.match(/^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/) || ps.includes('size') || ps.includes('spacing')) return 'dimension';
        if (ps.includes('font') || ps.includes('typography')) return 'typography';
        if (ps.includes('shadow')) return 'shadow';
        // Check for border types BEFORE generic border
        if (ps.includes('radius') || ps.includes('corner') || ps.includes('rounded')) return 'borderRadius';
        if (ps.includes('borderwidth') || ps.includes('strokeweight') || (ps.includes('border') && ps.includes('width'))) return 'borderWidth';
        if (ps.includes('border')) return 'border';
      } else if (typeof val === 'number') {
        // Numbers in spacing/size/radius paths are dimensions
        if (ps.includes('spacing') || ps.includes('size') || ps.includes('radius') || ps.includes('gap') || 
            ps.includes('padding') || ps.includes('margin') || ps.includes('width') || ps.includes('height')) {
          return 'dimension';
        }
        return 'number';
      }
      return 'string';
    };

    const addToken = (value: any, explicitType: string | undefined, currentPath: string[]) => {
      const name = currentPath[currentPath.length - 1] || 'unnamed';
      const t = explicitType || inferType(value, currentPath);
      tokens.push({
        name,
        path: currentPath,
        type: t,
        value: value,
        rawValue: value
      });
    };

    const walk = (obj: any, currentPath: string[]) => {
      if (obj === null || obj === undefined) return;

      const currentKey = currentPath[currentPath.length - 1] || '';
      if (currentKey.startsWith('$') && currentKey !== '$value' && currentKey !== '$type') {
        return;
      }

      // W3C format
      if (isW3CToken(obj)) {
        addToken(obj.$value, obj.$type, currentPath);
        return;
      }

      // Token Studio format
      if (isTokenStudioToken(obj)) {
        addToken(obj.value, obj.type, currentPath);
        return;
      }

      // Plain nested primitive format
      if (isPrimitiveToken(obj, currentPath)) {
        addToken(obj, undefined, currentPath);
        return;
      }

      // Recurse into objects
      if (obj && typeof obj === 'object') {
        const keys = Array.isArray(obj) ? obj.map((_, i) => String(i)) : Object.keys(obj);
        for (const key of keys) {
          if (!Array.isArray(obj) && (key.startsWith('$') || key === 'extensions')) {
            continue;
          }
          const child = Array.isArray(obj) ? obj[parseInt(key)] : obj[key];
          walk(child, [...currentPath, key]);
        }
      }
    };

    try {
      walk(node, []);
    } catch (err) {
      errors.push({ path: [], message: err instanceof Error ? err.message : 'Failed to walk tokens' });
    }

    return {
      tokens,
      metadata: {
        filePath: '',
        format: 'auto-detected',
        errors
      }
    };
  }

  /**
   * Fetch and parse design tokens from GitHub
   */
  async fetchTokens(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    filePath: string
  ): Promise<ParsedTokens> {
    // Fetch file from GitHub
    const fileContent = await this.fetchFileContents(owner, repo, branch, token, filePath);

    // Check if it's a file
    if (fileContent.type !== 'file') {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    // Decode base64 content
    if (!fileContent.content) {
      throw new Error('File content is empty');
    }

    const decodedContent = this.decodeBase64Content(fileContent.content);

    // Parse JSON
    const tokenFile = this.parseJSONContent(decodedContent);

    // Parse tokens using TokenParser; fallback to flattener on empty
    let parsedTokens = this.parser.parse(tokenFile, filePath);
    if (!parsedTokens.tokens || parsedTokens.tokens.length === 0) {
      parsedTokens = this.flattenTokens(tokenFile, []);
    }

    return parsedTokens;
  }

  // ============================================================================
  // OPTIMIZED: Pre-compiled exclude patterns (compiled once at class level)
  // ============================================================================
  private static readonly EXCLUDE_PATTERNS = [
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
   * Check if a file should be excluded from token detection
   */
  private isExcludedFile(filePath: string): boolean {
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';
    return GitHubTokenService.EXCLUDE_PATTERNS.some(pattern => 
      pattern.test(fileName) || pattern.test(filePath)
    );
  }

  /**
   * OPTIMIZED: Fetch entire repository tree in a single API call
   * This is MUCH faster than recursive directory fetching
   */
  async fetchRepoTree(
    owner: string,
    repo: string,
    branch: string,
    token: string
  ): Promise<Array<{ path: string; type: string; size?: number }>> {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check for truncated response (repo too large)
      if (data.truncated) {
        console.warn('Repository tree was truncated - falling back to recursive fetch');
        return []; // Signal to use fallback
      }
      
      return data.tree || [];
    } catch (error) {
      console.error('Failed to fetch repo tree:', error);
      return []; // Signal to use fallback
    }
  }

  /**
   * Auto-detect token files in a directory
   * OPTIMIZED: Uses GitHub Trees API for single-call file discovery when possible
   */
  async detectTokenFiles(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    directoryPath: string = ''
  ): Promise<string[]> {
    // Try the optimized Trees API approach first
    const tree = await this.fetchRepoTree(owner, repo, branch, token);
    
    if (tree.length > 0) {
      // FAST PATH: Filter the tree in memory (no additional API calls)
      const normalizedDirPath = directoryPath.replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes
      
      return tree
        .filter(item => {
          // Must be a file (blob)
          if (item.type !== 'blob') return false;
          
          // Must be a .json file
          if (!item.path.toLowerCase().endsWith('.json')) return false;
          
          // Must be in the specified directory (or any dir if empty)
          if (normalizedDirPath && !item.path.startsWith(normalizedDirPath + '/') && item.path !== normalizedDirPath) {
            return false;
          }
          
          // Must not be excluded
          return !this.isExcludedFile(item.path);
        })
        .map(item => item.path);
    }
    
    // FALLBACK: Use recursive directory fetching (slower, for truncated repos)
    return this.detectTokenFilesRecursive(owner, repo, branch, token, directoryPath);
  }

  /**
   * Fallback: Recursive directory-based file detection
   * Used when Trees API returns truncated results
   */
  private async detectTokenFilesRecursive(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    directoryPath: string = ''
  ): Promise<string[]> {
    const contents = await this.fetchDirectoryContents(owner, repo, branch, token, directoryPath);
    const tokenFiles: string[] = [];

    for (const item of contents) {
      if (item.type === 'file') {
        const fileName = item.name.toLowerCase();
        // Include all .json files except those in exclude list
        if (fileName.endsWith('.json') && !this.isExcludedFile(item.path)) {
          tokenFiles.push(item.path);
        }
      } else if (item.type === 'dir') {
        // Skip excluded directories
        if (!this.isExcludedFile(item.path + '/')) {
          // Recursively search in subdirectories
          const subFiles = await this.detectTokenFilesRecursive(owner, repo, branch, token, item.path);
          tokenFiles.push(...subFiles);
        }
      }
    }

    return tokenFiles;
  }
}

