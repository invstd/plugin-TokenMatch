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
        return 'type' in obj || 'description' in obj;
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
      if (typeof val === 'string') {
        if (val.match(/^#[0-9A-Fa-f]{3,8}$/) || val.match(/^rgba?\(/) || val.match(/^hsla?\(/) || ps.includes('color')) return 'color';
        if (val.match(/^\d+(\.\d+)?(ms|s)$/) || ps.includes('duration')) return 'duration';
        if (val.match(/^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/) || ps.includes('size') || ps.includes('spacing') || ps.includes('radius')) return 'dimension';
        if (ps.includes('font') || ps.includes('typography')) return 'typography';
        if (ps.includes('shadow')) return 'shadow';
      } else if (typeof val === 'number') {
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

  /**
   * Auto-detect token files in a directory
   */
  async detectTokenFiles(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    directoryPath: string = ''
  ): Promise<string[]> {
    const contents = await this.fetchDirectoryContents(owner, repo, branch, token, directoryPath);
    
    // Files to exclude (common non-token JSON files)
    const excludePatterns = [
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
      /\(ignore\)\.json$/i
    ];

    const tokenFiles: string[] = [];

    for (const item of contents) {
      if (item.type === 'file') {
        const fileName = item.name.toLowerCase();
        // Include all .json files except those in exclude list
        if (fileName.endsWith('.json')) {
          const shouldExclude = excludePatterns.some(pattern => pattern.test(fileName));
          if (!shouldExclude) {
            tokenFiles.push(item.path);
          }
        }
      } else if (item.type === 'dir') {
        // Recursively search in subdirectories
        const subFiles = await this.detectTokenFiles(owner, repo, branch, token, item.path);
        tokenFiles.push(...subFiles);
      }
    }

    return tokenFiles;
  }
}

