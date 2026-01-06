import { GitHubTokenService } from './services/github-token-service';
import { ParsedTokens } from './types/tokens';

// Show the plugin UI
figma.showUI(__html__, { width: 400, height: 600 });

// Detect system theme preference
const isDarkMode = true; // Default to dark
figma.ui.postMessage({ type: 'theme', theme: isDarkMode ? 'dark' : 'light' });

interface RepoConfig {
  repoUrl: string;
  token: string;
  branch: string;
  filePath?: string;
}

// Initialize services
const githubService = new GitHubTokenService();

// Load saved configuration on startup
async function loadConfig(): Promise<RepoConfig | null> {
  try {
    const config = await figma.clientStorage.getAsync('repoConfig');
    return config || null;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
}

// Save configuration
async function saveConfig(config: RepoConfig): Promise<void> {
  try {
    await figma.clientStorage.setAsync('repoConfig', config);
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'load-config') {
    const config = await loadConfig();
    figma.ui.postMessage({
      type: 'config-loaded',
      config: config
    });
  }
  
  if (msg.type === 'test-connection') {
    const { repoUrl, token } = msg;
    const parsed = githubService.parseGitHubUrl(repoUrl);
    
    if (!parsed) {
      figma.ui.postMessage({
        type: 'connection-result',
        success: false,
        error: 'Invalid GitHub URL format'
      });
      return;
    }
    
    try {
      const branches = await githubService.fetchBranches(parsed.owner, parsed.repo, token);
      figma.ui.postMessage({
        type: 'connection-result',
        success: true,
        branches: branches,
        owner: parsed.owner,
        repo: parsed.repo
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'connection-result',
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  }
  
  if (msg.type === 'save-config') {
    const config: RepoConfig = {
      repoUrl: msg.repoUrl,
      token: msg.token,
      branch: msg.branch,
      filePath: msg.filePath
    };
    
    await saveConfig(config);
    
    figma.ui.postMessage({
      type: 'config-saved',
      success: true
    });
  }
  
  if (msg.type === 'fetch-tokens') {
    const { repoUrl, token, branch, filePath } = msg;
    const parsed = githubService.parseGitHubUrl(repoUrl);
    
    if (!parsed) {
      figma.ui.postMessage({
        type: 'tokens-result',
        success: false,
        error: 'Invalid GitHub URL format'
      });
      return;
    }
    
    if (!filePath) {
      figma.ui.postMessage({
        type: 'tokens-result',
        success: false,
        error: 'File path is required'
      });
      return;
    }
    
    try {
      // Use the new GitHubTokenService to fetch and parse tokens
      const parsedTokens: ParsedTokens = await githubService.fetchTokens(
        parsed.owner,
        parsed.repo,
        branch,
        token,
        filePath
      );
      
      // Send parsed tokens to UI
      figma.ui.postMessage({
        type: 'tokens-result',
        success: true,
        tokens: parsedTokens.tokens,
        metadata: parsedTokens.metadata,
        errors: parsedTokens.metadata?.errors || []
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'tokens-result',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tokens'
      });
    }
  }

  if (msg.type === 'detect-token-files') {
    const { repoUrl, token, branch, directoryPath } = msg;
    const parsed = githubService.parseGitHubUrl(repoUrl);
    
    if (!parsed) {
      figma.ui.postMessage({
        type: 'token-files-result',
        success: false,
        error: 'Invalid GitHub URL format'
      });
      return;
    }
    
    try {
      const tokenFiles = await githubService.detectTokenFiles(
        parsed.owner,
        parsed.repo,
        branch,
        token,
        directoryPath || ''
      );
      
      figma.ui.postMessage({
        type: 'token-files-result',
        success: true,
        files: tokenFiles
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'token-files-result',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to detect token files'
      });
    }
  }
  
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
