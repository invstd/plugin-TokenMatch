/**
 * GitHub Token Service
 * Handles fetching and parsing design tokens from GitHub repositories
 */
import { TokenParser } from './token-parser';
export class GitHubTokenService {
    constructor() {
        this.parser = new TokenParser();
    }
    /**
     * Parse GitHub URL to extract owner and repo
     */
    parseGitHubUrl(url) {
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
    async fetchBranches(owner, repo, token) {
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
            return branches.map((branch) => branch.name);
        }
        catch (error) {
            throw new Error(`Failed to fetch branches: ${error}`);
        }
    }
    /**
     * Fetch file contents from GitHub
     */
    async fetchFileContents(owner, repo, branch, token, path) {
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
        }
        catch (error) {
            throw new Error(`Failed to fetch file contents: ${error}`);
        }
    }
    /**
     * Fetch directory contents from GitHub
     */
    async fetchDirectoryContents(owner, repo, branch, token, path = '') {
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
        }
        catch (error) {
            throw new Error(`Failed to fetch directory contents: ${error}`);
        }
    }
    /**
     * Decode base64 content from GitHub API
     * Note: Figma plugins don't have atob, so we implement it manually
     */
    decodeBase64Content(encodedContent) {
        try {
            // GitHub API returns base64 with newlines, remove them
            const cleanContent = encodedContent.replace(/\s/g, '');
            // Base64 character set
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            let result = '';
            let i = 0;
            // Remove padding
            cleanContent.replace(/[^A-Za-z0-9\+\/]/g, '');
            while (i < cleanContent.length) {
                const encoded1 = chars.indexOf(cleanContent.charAt(i++));
                const encoded2 = chars.indexOf(cleanContent.charAt(i++));
                const encoded3 = chars.indexOf(cleanContent.charAt(i++));
                const encoded4 = chars.indexOf(cleanContent.charAt(i++));
                const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
                result += String.fromCharCode((bitmap >> 16) & 255);
                if (encoded3 !== 64)
                    result += String.fromCharCode((bitmap >> 8) & 255);
                if (encoded4 !== 64)
                    result += String.fromCharCode(bitmap & 255);
            }
            return result;
        }
        catch (error) {
            throw new Error(`Failed to decode base64 content: ${error}`);
        }
    }
    /**
     * Parse JSON content from GitHub file
     */
    parseJSONContent(content) {
        try {
            return JSON.parse(content);
        }
        catch (error) {
            throw new Error(`Failed to parse JSON: ${error}`);
        }
    }
    /**
     * Fetch and parse design tokens from GitHub
     */
    async fetchTokens(owner, repo, branch, token, filePath) {
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
        // Parse tokens using TokenParser
        const parsedTokens = this.parser.parse(tokenFile, filePath);
        return parsedTokens;
    }
    /**
     * Auto-detect token files in a directory
     */
    async detectTokenFiles(owner, repo, branch, token, directoryPath = '') {
        const contents = await this.fetchDirectoryContents(owner, repo, branch, token, directoryPath);
        const tokenFilePatterns = [
            /tokens?\.json$/i,
            /design-tokens?\.json$/i,
            /\.tokens?\.json$/i
        ];
        const tokenFiles = [];
        for (const item of contents) {
            if (item.type === 'file') {
                const fileName = item.name.toLowerCase();
                if (tokenFilePatterns.some(pattern => pattern.test(fileName))) {
                    tokenFiles.push(item.path);
                }
            }
            else if (item.type === 'dir') {
                // Recursively search in subdirectories
                const subFiles = await this.detectTokenFiles(owner, repo, branch, token, item.path);
                tokenFiles.push(...subFiles);
            }
        }
        return tokenFiles;
    }
}
