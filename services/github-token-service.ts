/**
 * GitHub Token Service
 * Handles fetching and parsing design tokens from GitHub repositories
 */

import { TokenParser } from './token-parser';
import { ParsedTokens, TokenFile, ParsedToken, ValidationError } from '../types/tokens';

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
      const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
      console.log(`[GitHubService] Fetching branches from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      console.log(`[GitHubService] Response status: ${response.status}`);
      
      if (!response.ok) {
        let errorMessage = '';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || '';
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText;
        }
        
        if (response.status === 401) {
          throw new Error('Authentication failed. Please check your personal access token.');
        } else if (response.status === 404) {
          throw new Error('Repository not found. Please check the repository URL.');
        } else if (response.status === 403) {
          throw new Error(`Access forbidden: ${errorMessage || 'The token may not have the required permissions.'}`);
        } else {
          throw new Error(`GitHub API error (${response.status}): ${errorMessage || response.statusText}`);
        }
      }
      
      const branches = await response.json();
      console.log(`[GitHubService] Successfully fetched ${branches.length} branches`);
      return branches.map((branch: { name: string }) => branch.name);
    } catch (error) {
      console.error('[GitHubService] Error fetching branches:', error);
      if (error instanceof Error) {
        // Check for network errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new Error('Network error. Please check your internet connection.');
        }
        throw error;
      }
      throw new Error(`Failed to fetch branches: ${String(error)}`);
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
      // GitHub API returns base64 with newlines, remove them
      let cleanContent = encodedContent.replace(/\s/g, '');
      
      // Remove any invalid characters
      cleanContent = cleanContent.replace(/[^A-Za-z0-9\+\/=]/g, '');
      
      // Base64 character set
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      
      // Process in groups of 4 characters
      while (i < cleanContent.length) {
        // Get 4 characters (or remaining)
        const char1 = cleanContent.charAt(i++);
        const char2 = i < cleanContent.length ? cleanContent.charAt(i++) : '=';
        const char3 = i < cleanContent.length ? cleanContent.charAt(i++) : '=';
        const char4 = i < cleanContent.length ? cleanContent.charAt(i++) : '=';
        
        const encoded1 = chars.indexOf(char1);
        const encoded2 = chars.indexOf(char2);
        const encoded3 = char3 === '=' ? -1 : chars.indexOf(char3);
        const encoded4 = char4 === '=' ? -1 : chars.indexOf(char4);
        
        if (encoded1 === -1 || encoded2 === -1) {
          throw new Error(`Invalid base64 character at position ${i - 4}`);
        }
        
        const bitmap = (encoded1 << 18) | (encoded2 << 12) | 
                      ((encoded3 >= 0 ? encoded3 : 0) << 6) | 
                      (encoded4 >= 0 ? encoded4 : 0);
        
        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 >= 0) {
          result += String.fromCharCode((bitmap >> 8) & 255);
        }
        if (encoded4 >= 0) {
          result += String.fromCharCode(bitmap & 255);
        }
        
        // Stop if we hit padding
        if (char3 === '=' || char4 === '=') {
          break;
        }
      }
      
      return result;
    } catch (error) {
      throw new Error(`Failed to decode base64 content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove comments from JSON (JSONC/JSON5 support)
   * Supports both // and block style comments
   */
  private stripJSONComments(jsonString: string): string {
    let result = '';
    let inString = false;
    let stringChar = '';
    let i = 0;
    
    while (i < jsonString.length) {
      const char = jsonString[i];
      const nextChar = i + 1 < jsonString.length ? jsonString[i + 1] : '';
      
      // Handle string literals
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
        result += char;
        i++;
        continue;
      }
      
      if (inString && jsonString[i] === stringChar && jsonString[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
        result += char;
        i++;
        continue;
      }
      
      if (inString) {
        result += char;
        i++;
        continue;
      }
      
      // Handle // comments
      if (char === '/' && nextChar === '/') {
        // Skip to end of line
        while (i < jsonString.length && jsonString[i] !== '\n' && jsonString[i] !== '\r') {
          i++;
        }
        continue;
      }
      
      // Handle /* */ comments
      if (char === '/' && nextChar === '*') {
        i += 2;
        while (i < jsonString.length) {
          if (jsonString[i] === '*' && i + 1 < jsonString.length && jsonString[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
      
      result += char;
      i++;
    }
    
    return result;
  }

  /**
   * Parse JSON content from GitHub file
   * Supports JSON, JSONC (with comments), and JSON5 formats
   */
  parseJSONContent(content: string): TokenFile {
    try {
      // First try standard JSON
      return JSON.parse(content);
    } catch (error) {
      // If that fails, try stripping comments (JSONC format)
      try {
        const cleaned = this.stripJSONComments(content);
        return JSON.parse(cleaned);
      } catch (commentError) {
        // If that also fails, provide better error message
        const preview = content.substring(0, 200).replace(/\n/g, '\\n');
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}. Content preview: ${preview}...`);
      }
    }
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

    // Parse JSON with timeout protection
    let tokenFile: TokenFile;
    try {
      tokenFile = this.parseJSONContent(decodedContent);
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check file size to prevent processing huge files
    const contentSize = decodedContent.length;
    if (contentSize > 5 * 1024 * 1024) { // 5MB limit
      throw new Error(`File ${filePath} is too large (${Math.round(contentSize / 1024)}KB). Maximum size is 5MB.`);
    }

    // Parse tokens using TokenParser
    let parsedTokens: ParsedTokens;
    try {
      parsedTokens = this.parser.parse(tokenFile, filePath);
    } catch (error) {
      throw new Error(`Failed to parse tokens from ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return parsedTokens;
  }

  /**
   * Auto-detect token files in a directory
   * @param maxDepth Maximum recursion depth (default: 5)
   * @param currentDepth Current recursion depth (internal use)
   * @param visitedPaths Set of visited paths to prevent cycles (internal use)
   */
  async detectTokenFiles(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    directoryPath: string = '',
    maxDepth: number = 5,
    currentDepth: number = 0,
    visitedPaths: Set<string> = new Set()
  ): Promise<string[]> {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      console.warn(`Max depth ${maxDepth} reached for ${directoryPath}`);
      return [];
    }
    
    // Prevent cycles
    if (visitedPaths.has(directoryPath)) {
      console.warn(`Cycle detected: ${directoryPath}`);
      return [];
    }
    visitedPaths.add(directoryPath);
    
    try {
      const contents = await this.fetchDirectoryContents(owner, repo, branch, token, directoryPath);
    
    // Include all JSON files, but exclude common non-token files
    const excludePatterns = [
      /package\.json$/i,
      /package-lock\.json$/i,
      /yarn\.lock$/i,
      /tsconfig\.json$/i,
      /jsconfig\.json$/i,
      /\.config\.json$/i,
      /\.eslintrc\.json$/i,
      /\.prettierrc\.json$/i,
      /node_modules/i,
      /\.git/i,
      /dist/i,
      /build/i
    ];
    
    const tokenFilePatterns = [
      /\.json$/i  // Match all JSON files
    ];

      const tokenFiles: string[] = [];
      const MAX_FILES_PER_DIR = 20; // Limit files per directory to prevent memory issues
      let fileCount = 0;

      for (const item of contents) {
        // Skip excluded paths
        if (excludePatterns.some(pattern => pattern.test(item.path))) {
          continue;
        }
        
        if (item.type === 'file') {
          fileCount++;
          if (fileCount > MAX_FILES_PER_DIR) {
            console.warn(`Too many files in ${directoryPath}, limiting to ${MAX_FILES_PER_DIR}`);
            break;
          }
          
          const fileName = item.name.toLowerCase();
          // Check if it's a JSON file and not excluded
          if (tokenFilePatterns.some(pattern => pattern.test(fileName))) {
            tokenFiles.push(item.path);
          }
        } else if (item.type === 'dir') {
          // Recursively search in subdirectories
          // Skip excluded directories
          if (!excludePatterns.some(pattern => pattern.test(item.path))) {
            try {
              // Create new visited set for each branch to allow parallel paths
              const branchVisited = new Set(visitedPaths);
              const subFiles = await this.detectTokenFiles(owner, repo, branch, token, item.path, maxDepth, currentDepth + 1, branchVisited);
              tokenFiles.push(...subFiles);
              
              // Limit total files found to prevent memory issues
              if (tokenFiles.length > 100) {
                console.warn(`Found ${tokenFiles.length} files, stopping search to prevent memory issues`);
                return tokenFiles.slice(0, 100);
              }
            } catch (error) {
              // Log but continue - some directories might not be accessible
              console.warn(`Failed to search directory ${item.path}:`, error);
            }
          }
        }
      }

      return tokenFiles;
    } catch (error) {
      console.error(`Error scanning directory ${directoryPath}:`, error);
      return [];
    }
  }

  /**
   * Fetch and parse multiple token files from a directory
   * If filePath is empty, searches from repository root
   */
  async fetchTokensFromDirectory(
    owner: string,
    repo: string,
    branch: string,
    token: string,
    directoryPath: string = '',
    progressCallback?: (message: string) => void
  ): Promise<ParsedTokens> {
    // First, detect all token files in the directory (recursively)
    if (progressCallback) {
      progressCallback(`Scanning ${directoryPath || 'repository root'}...`);
    }
    
    const tokenFiles = await this.detectTokenFiles(owner, repo, branch, token, directoryPath);
    
    if (tokenFiles.length === 0) {
      throw new Error(`No token files found in ${directoryPath || 'repository root'}`);
    }
    
    if (progressCallback) {
      progressCallback(`Found ${tokenFiles.length} token file${tokenFiles.length === 1 ? '' : 's'}. Parsing...`);
    }
    
    console.log(`Found ${tokenFiles.length} token files in ${directoryPath || 'root'}:`, tokenFiles);

    if (tokenFiles.length === 0) {
      throw new Error(`No token files found in ${directoryPath || 'repository root'}`);
    }

    // Fetch and parse each file (limit to prevent timeout and memory issues)
    const MAX_FILES = 20; // Reduced limit to prevent crashes
    const filesToProcess = tokenFiles.slice(0, MAX_FILES);
    
    if (tokenFiles.length > MAX_FILES) {
      console.warn(`Found ${tokenFiles.length} files, processing first ${MAX_FILES}`);
      if (progressCallback) {
        progressCallback(`Found ${tokenFiles.length} files, processing first ${MAX_FILES}...`);
      }
    }
    
    const allTokens: ParsedToken[] = [];
    const allErrors: ValidationError[] = [];
    const filePaths: string[] = [];

    // Process files one at a time with small delays to prevent stack overflow
    for (let i = 0; i < filesToProcess.length; i++) {
      const filePath = filesToProcess[i];
      try {
        if (progressCallback) {
          progressCallback(`Parsing file ${i + 1}/${filesToProcess.length}: ${filePath.split('/').pop()}...`);
        }
        
        console.log(`[GitHubService] Fetching and parsing: ${filePath}`);
        const startTime = Date.now();
        const parsedTokens = await this.fetchTokens(owner, repo, branch, token, filePath);
        const duration = Date.now() - startTime;
        console.log(`[GitHubService] Completed ${filePath} in ${duration}ms (${parsedTokens.tokens.length} tokens)`);
        allTokens.push(...parsedTokens.tokens);
        if (parsedTokens.metadata?.errors) {
          allErrors.push(...parsedTokens.metadata.errors);
        }
        filePaths.push(filePath);
        
        // Small delay every few files to prevent stack overflow
        if (i > 0 && i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) {
        // Add error for this file but continue with others
        allErrors.push({
          path: [filePath],
          message: error instanceof Error ? error.message : 'Failed to parse file',
          severity: 'error'
        });
      }
    }

    // Merge tokens - handle duplicates by keeping the first occurrence
    const mergedTokens: ParsedToken[] = [];
    const seenPaths = new Set<string>();

    for (const token of allTokens) {
      const tokenPath = token.path.join('.');
      if (!seenPaths.has(tokenPath)) {
        seenPaths.add(tokenPath);
        mergedTokens.push(token);
      } else {
        // Token already exists, log a warning
        allErrors.push({
          path: token.path,
          message: `Duplicate token found in multiple files: ${tokenPath}`,
          severity: 'warning'
        });
      }
    }

    // Re-resolve aliases across all merged tokens
    const mergedTokenFile: TokenFile = {};
    
    // Reconstruct token file structure from merged tokens
    for (const token of mergedTokens) {
      let current: any = mergedTokenFile;
      for (let i = 0; i < token.path.length - 1; i++) {
        const key = token.path[i];
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      const lastKey = token.path[token.path.length - 1];
      current[lastKey] = {
        $type: token.type,
        $value: token.rawValue || token.value,
        $description: token.description,
        $extensions: token.extensions
      };
    }

    // Parse the merged structure to resolve aliases properly
    const finalParsed = this.parser.parse(mergedTokenFile, directoryPath || 'root');
    
    // Combine errors
    finalParsed.metadata.errors = [...allErrors, ...finalParsed.metadata.errors];
    finalParsed.metadata.filePath = filePaths.length === 1 
      ? filePaths[0] 
      : `${filePaths.length} files from ${directoryPath || 'root'}`;

    return finalParsed;
  }
}

