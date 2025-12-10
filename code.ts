import { GitHubTokenService } from './services/github-token-service';
import { FigmaComponentService } from './services/figma-component-service';
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
const figmaComponentService = new FigmaComponentService();

// Store fetched tokens globally
let fetchedTokens: ParsedTokens | null = null;

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
    console.log('[Code] Received test-connection message');
    const { repoUrl, token } = msg;
    
    if (!repoUrl || !token) {
      console.log('[Code] Missing repoUrl or token');
      figma.ui.postMessage({
        type: 'connection-result',
        success: false,
        error: 'Repository URL and token are required'
      });
      return;
    }
    
    const parsed = githubService.parseGitHubUrl(repoUrl);
    
    if (!parsed) {
      console.log('[Code] Invalid GitHub URL format');
      figma.ui.postMessage({
        type: 'connection-result',
        success: false,
        error: 'Invalid GitHub URL format. Expected: https://github.com/owner/repo'
      });
      return;
    }
    
    console.log(`[Code] Testing connection to ${parsed.owner}/${parsed.repo}`);
    
    try {
      const branches = await githubService.fetchBranches(parsed.owner, parsed.repo, token);
      console.log(`[Code] Successfully fetched ${branches.length} branches`);
      
      figma.ui.postMessage({
        type: 'connection-result',
        success: true,
        branches: branches,
        owner: parsed.owner,
        repo: parsed.repo
      });
      console.log('[Code] Sent connection-result success message');
    } catch (error) {
      console.error('[Code] Error fetching branches:', error);
      figma.ui.postMessage({
        type: 'connection-result',
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed. Please check your internet connection and token permissions.'
      });
      console.log('[Code] Sent connection-result error message');
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
    
    try {
      // Send progress update
      figma.ui.postMessage({
        type: 'fetch-progress',
        message: 'Starting token fetch...'
      });

      let parsedTokens: ParsedTokens;
      
      // Wrap in try-catch to prevent crashes
      try {
      
      // If filePath is empty, fetch from directory (all token files)
      if (!filePath || filePath.trim() === '') {
        figma.ui.postMessage({
          type: 'fetch-progress',
          message: 'Scanning repository (including subfolders) for JSON token files...'
        });
        
        // Fetch all token files from repository root (recursively)
        parsedTokens = await githubService.fetchTokensFromDirectory(
          parsed.owner,
          parsed.repo,
          branch,
          token,
          '',
          (message) => {
            figma.ui.postMessage({
              type: 'fetch-progress',
              message: message
            });
          }
        );
      } else {
        // Check if it's a directory or file
        // Try to fetch as file first (faster, more common case)
        try {
          figma.ui.postMessage({
            type: 'fetch-progress',
            message: `Fetching ${filePath}...`
          });
          
          parsedTokens = await githubService.fetchTokens(
            parsed.owner,
            parsed.repo,
            branch,
            token,
            filePath
          );
        } catch (fileError) {
          // If file fetch fails, try as directory
          try {
            figma.ui.postMessage({
              type: 'fetch-progress',
              message: `Scanning directory ${filePath} (including subfolders)...`
            });
            
            const contents = await githubService.fetchDirectoryContents(
              parsed.owner,
              parsed.repo,
              branch,
              token,
              filePath
            );
            
            // If we get an array, it's a directory
            if (Array.isArray(contents)) {
              // Recursively fetch all token files from this directory
              parsedTokens = await githubService.fetchTokensFromDirectory(
                parsed.owner,
                parsed.repo,
                branch,
                token,
                filePath,
                (message) => {
                  figma.ui.postMessage({
                    type: 'fetch-progress',
                    message: message
                  });
                }
              );
            } else {
              throw new Error(`Path "${filePath}" is not a valid file or directory`);
            }
          } catch (dirError) {
            // If both fail, throw a helpful error
            throw new Error(`Path "${filePath}" is neither a valid file nor directory. File error: ${fileError instanceof Error ? fileError.message : 'Unknown'}`);
          }
        }
      }
      
      figma.ui.postMessage({
        type: 'fetch-progress',
        message: 'Parsing tokens...'
      });
      
        // Store tokens globally
        fetchedTokens = parsedTokens;
        
        // Send parsed tokens to UI
        figma.ui.postMessage({
          type: 'tokens-result',
          success: true,
          tokens: parsedTokens.tokens,
          metadata: parsedTokens.metadata,
          errors: parsedTokens.metadata?.errors || []
        });
      } catch (innerError) {
        // Inner error during processing
        throw innerError;
      }
    } catch (error) {
      // Outer error handler - prevent plugin crash
      console.error('Token fetch error:', error);
      figma.ui.postMessage({
        type: 'tokens-result',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tokens. The repository may be too large or have too many files.'
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
  
  if (msg.type === 'scan-components') {
    try {
      const scanAll = msg.scanAll === true;
      
      figma.ui.postMessage({
        type: 'scan-progress',
        message: scanAll ? 'Scanning all pages...' : 'Scanning current page...'
      });

      const result = scanAll 
        ? figmaComponentService.scanAllComponents()
        : figmaComponentService.scanCurrentPage();

      figma.ui.postMessage({
        type: 'scan-result',
        success: true,
        result: result
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'scan-result',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan components'
      });
    }
  }

  if (msg.type === 'get-component-usage') {
    try {
      const { componentId } = msg;
      const stats = figmaComponentService.getComponentUsageStats(componentId);
      
      figma.ui.postMessage({
        type: 'component-usage-result',
        success: true,
        stats: stats
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'component-usage-result',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get usage stats'
      });
    }
  }
  
  if (msg.type === 'scan-token') {
    try {
      const { tokenName } = msg;
      
      if (!fetchedTokens) {
        figma.ui.postMessage({
          type: 'scan-token-result',
          success: false,
          error: 'No tokens fetched. Please fetch tokens first from settings.'
        });
        return;
      }
      
      // Find the token by name (support both dot notation and array path)
      const tokenPath = tokenName.split('.');
      let foundToken = null;
      
      for (const token of fetchedTokens.tokens) {
        // Check if token path matches (case-insensitive)
        const tokenPathStr = token.path.join('.').toLowerCase();
        const searchPathStr = tokenPath.join('.').toLowerCase();
        
        if (tokenPathStr === searchPathStr || token.name.toLowerCase() === tokenName.toLowerCase()) {
          foundToken = token;
          break;
        }
      }
      
      if (!foundToken) {
        figma.ui.postMessage({
          type: 'scan-token-result',
          success: true,
          tokenFound: false,
          tokenName: tokenName
        });
        return;
      }
      
      // Scan all components in the document (COMPONENT type only, not instances)
      figma.ui.postMessage({
        type: 'scan-progress',
        message: 'Scanning components for token usage...'
      });
      
      const pages = figma.root.children;
      const matchingComponents: any[] = [];
      
      // Scan all pages
      for (const page of pages) {
        if (page.type === 'PAGE') {
          // Find only COMPONENT nodes (not INSTANCE or COMPONENT_SET)
          const components = page.findAll(node => node.type === 'COMPONENT');
          
          for (const component of components) {
            try {
              const props = figmaComponentService.extractComponentProperties(component, page.name);
              if (props) {
                // Check if any property matches the token value
                const tokenValue = foundToken.value;
                let matches = false;
                const matchedProperties: string[] = [];
                
                // Check colors
                if (props.colors) {
                  for (const color of props.colors) {
                    if (matchesTokenValue(color.hex, tokenValue) || 
                        matchesTokenValue(color.rgba, tokenValue)) {
                      matches = true;
                      matchedProperties.push(`color: ${color.type} (${color.hex})`);
                    }
                  }
                }
                
                // Check typography
                if (props.typography) {
                  for (const typo of props.typography) {
                    if (matchesTokenValue(typo.fontSize, tokenValue) ||
                        matchesTokenValue(typo.fontFamily, tokenValue) ||
                        matchesTokenValue(typo.fontWeight, tokenValue)) {
                      matches = true;
                      matchedProperties.push(`typography: ${typo.fontFamily} ${typo.fontSize}px`);
                    }
                  }
                }
                
                // Check spacing
                if (props.spacing) {
                  for (const spacing of props.spacing) {
                    if (matchesTokenValue(spacing.value, tokenValue)) {
                      matches = true;
                      matchedProperties.push(`spacing: ${spacing.type} (${spacing.value}px)`);
                    }
                  }
                }
                
                // Check effects
                if (props.effects) {
                  for (const effect of props.effects) {
                    if (matchesTokenValue(effect.radius, tokenValue)) {
                      matches = true;
                      matchedProperties.push(`effect: ${effect.type} (${effect.radius}px)`);
                    }
                  }
                }
                
                if (matches) {
                  matchingComponents.push({
                    id: component.id,
                    name: component.name,
                    page: page.name,
                    matchedProperties: matchedProperties
                  });
                }
              }
            } catch (error) {
              // Skip components that fail to extract
              console.error(`Error extracting properties from ${component.name}:`, error);
            }
          }
        }
      }
      
      figma.ui.postMessage({
        type: 'scan-token-result',
        success: true,
        tokenFound: true,
        tokenName: tokenName,
        tokenValue: foundToken.value,
        matchingComponents: matchingComponents
      });
    } catch (error) {
      figma.ui.postMessage({
        type: 'scan-token-result',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan for token'
      });
    }
  }
  
  if (msg.type === 'navigate-to-component') {
    try {
      const { componentId } = msg;
      const node = figma.getNodeById(componentId);
      
      if (node && 'type' in node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE')) {
        // Select the component
        figma.currentPage.selection = [node as SceneNode];
        // Zoom to component
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        figma.notify(`Navigated to component: ${node.name}`);
      } else {
        figma.notify('Component not found');
      }
    } catch (error) {
      figma.notify(`Error navigating to component: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

// Helper function to match token values
function matchesTokenValue(componentValue: any, tokenValue: any): boolean {
  // Convert both to strings for comparison
  const compStr = String(componentValue).toLowerCase().trim();
  const tokenStr = String(tokenValue).toLowerCase().trim();
  
  // Exact match
  if (compStr === tokenStr) {
    return true;
  }
  
  // For color values, try to normalize
  if (typeof componentValue === 'string' && typeof tokenValue === 'string') {
    // Remove # and compare hex colors
    const compHex = compStr.replace('#', '');
    const tokenHex = tokenStr.replace('#', '');
    if (compHex === tokenHex) {
      return true;
    }
    
    // Try RGB/RGBA comparison
    const rgbMatch = /rgba?\(([^)]+)\)/;
    const compRgb = compStr.match(rgbMatch);
    const tokenRgb = tokenStr.match(rgbMatch);
    if (compRgb && tokenRgb && compRgb[1] === tokenRgb[1]) {
      return true;
    }
  }
  
  // For numeric values, compare with tolerance
  if (typeof componentValue === 'number' && typeof tokenValue === 'number') {
    return Math.abs(componentValue - tokenValue) < 0.01;
  }
  
  return false;
}
