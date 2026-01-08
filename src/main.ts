import { GitHubTokenService } from '../services/github-token-service';
import { FigmaComponentService } from '../services/figma-component-service';
import { TokenMatchingService } from '../services/token-matching-service';
import { ParsedTokens } from '../types/tokens';
import { showUI, on, emit } from '@create-figma-plugin/utilities';

export default function () {
  // Show the plugin UI with resize enabled
  showUI({ width: 400, height: 550 }, { resizable: true });

  // Load all pages in the background on startup
  // This ensures pages are available for scanning when needed
  figma.loadAllPagesAsync().catch((error) => {
    console.error('Error loading pages on startup:', error);
  });

interface RepoConfig {
  repoUrl: string;
  token: string;
  branch: string;
  filePath?: string;
}

// Initialize services
const githubService = new GitHubTokenService();
const figmaComponentService = new FigmaComponentService();
const tokenMatchingService = new TokenMatchingService();

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

// Clear configuration
async function clearConfig(): Promise<void> {
  try {
    await figma.clientStorage.deleteAsync('repoConfig');
  } catch (error) {
    console.error('Error clearing config:', error);
  }
}

// Listen for messages from the UI
on('load-config', async () => {
  const config = await loadConfig();
  emit('config-loaded', config);
});

on('clear-config', async () => {
  await clearConfig();
  emit('config-loaded', null);
});

  on('test-connection', async (msg: { repoUrl: string; token: string; filePath?: string }) => {
    const parsed = githubService.parseGitHubUrl(msg.repoUrl);

    if (!parsed) {
      emit('connection-result', {
        success: false,
        error: 'Invalid GitHub URL format'
      });
      return;
    }

    try {
      emit('connection-progress', { message: 'Connecting to GitHub...' });
      const branches = await githubService.fetchBranches(parsed.owner, parsed.repo, msg.token);
      
      // Count files and tokens during test
      let fileCount = 0;
      let sampleFiles: string[] = [];
      
      if (branches.length > 0) {
        try {
          const defaultBranch = branches[0];
          emit('connection-progress', { message: 'Scanning for token files...' });
          
          const tokenFiles = await githubService.detectTokenFiles(
            parsed.owner,
            parsed.repo,
            defaultBranch,
            msg.token,
            msg.filePath || ''
          );
          
          fileCount = tokenFiles.length;
          sampleFiles = tokenFiles.slice(0, 5);
        } catch (error) {
          console.error('Token detection failed:', error);
          // Don't fail the connection test if token detection fails
        }
      }
      
      emit('connection-result', {
        success: true,
        branches: branches.slice(0, 10), // Only send first 10 branches
        owner: parsed.owner,
        repo: parsed.repo,
        fileCount: fileCount,
        tokenCount: fileCount, // Use file count as estimate instead of parsing
        sampleFiles: sampleFiles.map(f => f.length > 50 ? f.substring(0, 47) + '...' : f) // Truncate long file names
      });
    } catch (error) {
      emit('connection-result', {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  });

on('save-config', async (msg: RepoConfig) => {
  await saveConfig(msg);
  emit('config-saved', { success: true });
});

  // Helpers
  const inferType = (val: any, path: string[]): string => {
    const ps = path.join('.').toLowerCase();
    
    if (typeof val === 'string') {
      // Check for color formats
      if (
        val.match(/^#[0-9A-Fa-f]{3,8}$/) ||
        val.match(/^rgba?\(/) ||
        val.match(/^hsla?\(/) ||
        ps.includes('color') ||
        ps.includes('colour')
      ) return 'color';
      
      // Check for duration
      if (val.match(/^\d+(\.\d+)?(ms|s)$/) || ps.includes('duration')) return 'duration';
      
      // Check for dimension
      if (
        val.match(/^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/) ||
        ps.includes('size') || ps.includes('spacing') || ps.includes('radius') ||
        ps.includes('gap') || ps.includes('padding') || ps.includes('margin')
      ) return 'dimension';
      
      // Check for typography
      if (ps.includes('font') || ps.includes('typography') || ps.includes('text')) {
        if (ps.includes('weight')) return 'fontWeight';
        if (ps.includes('family')) return 'fontFamily';
        return 'typography';
      }
      
      // Check for shadow
      if (ps.includes('shadow')) return 'shadow';
      
      // Check for border
      if (ps.includes('border')) return 'border';
    } else if (typeof val === 'number') {
      // Infer from path for numbers
      if (ps.includes('weight')) return 'fontWeight';
      if (ps.includes('opacity') || ps.includes('alpha')) return 'number';
      if (ps.includes('z-index') || ps.includes('zindex')) return 'number';
      return 'number';
    } else if (typeof val === 'object' && val !== null) {
      // Composite tokens
      if (ps.includes('shadow') || val.blur !== undefined || val.spread !== undefined) return 'shadow';
      if (ps.includes('typography') || val.fontFamily !== undefined) return 'typography';
      if (ps.includes('border') || val.width !== undefined && val.style !== undefined) return 'border';
    }
    return 'string';
  };

  /**
   * Check if an object is a W3C Design Token (has $value)
   */
  const isW3CToken = (obj: any): boolean => {
    return obj && typeof obj === 'object' && '$value' in obj;
  };

  /**
   * Check if an object is a Token Studio token (has value but not $value)
   */
  const isTokenStudioToken = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    if ('$value' in obj) return false; // W3C takes precedence
    if (!('value' in obj)) return false;
    
    const value = obj.value;
    
    // If value is a primitive, it's likely a token
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return true;
    }
    
    // If value is an object (composite tokens), check for token properties
    if (typeof value === 'object' && value !== null) {
      const hasTokenProps = 'type' in obj || 'description' in obj;
      return hasTokenProps;
    }
    
    return false;
  };

  /**
   * Check if a value is a primitive that should be treated as a token
   * (for plain nested JSON format like core/colors.json with ids.core.color.neutral.100)
   * 
   * PERMISSIVE: Any primitive at depth 1+ is considered a potential token
   */
  const isPrimitiveToken = (value: any, path: string[]): boolean => {
    // Must be a primitive (string, number, or boolean)
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return false;
    }

    // Must have at least 1 level of nesting (not root-level primitives)
    if (path.length < 1) {
      return false;
    }

    // Accept ALL primitives at depth 1+ as potential tokens
    // This is intentionally permissive to catch various token formats
    return true;
  };

  const extractTokensFromJson = (obj: any, filePath: string) => {
    const tokens: Array<{ name: string; path: string[]; type: string; sourceFile: string; value?: any }> = [];
    
    const addToken = (value: any, explicitType: string | undefined, path: string[]) => {
      const name = path[path.length - 1] || 'unnamed';
      const t = explicitType || inferType(value, path);
      tokens.push({ 
        name, 
        path: [...path], 
        type: t, 
        sourceFile: filePath,
        value: value 
      });
    };
    
    const walk = (node: any, path: string[], depth: number) => {
      // Skip null/undefined
      if (node === null || node === undefined) {
        return;
      }

      // Skip internal metadata keys
      const currentKey = path[path.length - 1] || '';
      if (currentKey.startsWith('$') && currentKey !== '$value' && currentKey !== '$type') {
        return;
      }
      
      // Check for W3C format token ($value)
      if (isW3CToken(node)) {
        addToken(node.$value, node.$type, path);
        return;
      }

      // Check for Token Studio format (value property without $)
      if (isTokenStudioToken(node)) {
        addToken(node.value, node.type, path);
        return;
      }

      // Check if this is a primitive value at a leaf node (plain nested format)
      if (isPrimitiveToken(node, path)) {
        addToken(node, undefined, path);
        return;
      }

      // If it's an object/array, recurse into children
      if (typeof node === 'object') {
        const keys = Array.isArray(node) ? node.map((_, i) => String(i)) : Object.keys(node);
        
        for (const key of keys) {
          // Skip internal/metadata keys at object level
          if (!Array.isArray(node) && (key.startsWith('$') || key === 'extensions')) {
            continue;
          }
          
          const child = Array.isArray(node) ? node[parseInt(key)] : node[key];
          walk(child, [...path, key], depth + 1);
        }
      }
    };

    walk(obj, [], 0);

    return tokens;
  };

  on('fetch-tokens', async (msg: { repoUrl: string; token: string; branch: string; filePath?: string }) => {
    const parsed = githubService.parseGitHubUrl(msg.repoUrl);

    if (!parsed) {
      emit('tokens-result', {
        success: false,
        error: 'Invalid GitHub URL format'
      });
      return;
    }

    try {
      // Detect token files in the directory (or root if no path provided)
      const directoryPath = msg.filePath || '';
      emit('tokens-progress', { message: 'Scanning for token files...' });
      
      const tokenFiles = await githubService.detectTokenFiles(
        parsed.owner,
        parsed.repo,
        msg.branch,
        msg.token,
        directoryPath
      );

      if (tokenFiles.length === 0) {
        emit('tokens-result', {
          success: false,
          error: `No token files found${directoryPath ? ` in '${directoryPath}'` : ' in repository'}. Looking for .json files (excluding config files).`
        });
        return;
      }

      // Fetch and aggregate tokens from all detected files
      const allTokens: any[] = [];
      const allErrors: Array<{ file: string; message: string }> = [];
      let filesProcessed = 0;
      let totalTokens = 0;
      const perFileCounts: Array<{ file: string; count: number }> = [];
      const MAX_TOKENS_TO_SEND = 150; // even stricter cap to avoid memory issues
      
      for (const filePath of tokenFiles) {
        try {
          emit('tokens-progress', { message: `Processing ${filePath}...` });
          
          // Fetch raw file
          const fileContent = await githubService.fetchFileContents(
            parsed.owner,
            parsed.repo,
            msg.branch,
            msg.token,
            filePath
          );
          if (!fileContent.content) {
            throw new Error('Empty file content');
          }
          const decoded = githubService.decodeBase64Content(fileContent.content);
          
          let json: any;
          try {
            json = JSON.parse(decoded);
          } catch (e) {
            throw new Error(`JSON parse failed: ${(e as Error).message}`);
          }

          const extracted = extractTokensFromJson(json, filePath);

          const countForFile = extracted.length;
          totalTokens += countForFile;
          perFileCounts.push({ file: filePath, count: countForFile });
          emit('tokens-progress', { message: `Found ${countForFile} tokens in ${filePath}` });

          if (countForFile === 0) {
            allErrors.push({
              file: filePath,
              message: 'No token values found in this file (checked $value, value, and primitives)'
            });
          }

          // Only push up to limit (no values to keep payload tiny)
          for (const t of extracted) {
            if (allTokens.length < MAX_TOKENS_TO_SEND) {
              allTokens.push(t);
            } else {
              break;
            }
          }

          filesProcessed++;
          
          // No structured parse errors here; none to push
        } catch (error) {
          console.error(`Failed to parse ${filePath}:`, error);
          perFileCounts.push({ file: filePath, count: 0 });
          allErrors.push({
            file: filePath,
            message: error instanceof Error ? error.message : 'Failed to parse file'
          });
        }
      }

      // Send minimal data to avoid memory issues
      emit('tokens-result', {
        success: true,
        tokens: allTokens.map(t => ({
          name: t.name || '',
          path: t.path || '',
          type: t.type || 'unknown',
          sourceFile: t.sourceFile || ''
        })),
        metadata: {
          totalTokens,
          truncated: totalTokens > allTokens.length,
          filesProcessed: filesProcessed,
          totalFiles: tokenFiles.length,
          perFileCounts,
          errors: allErrors
        }
      });
    } catch (error) {
      emit('tokens-result', {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tokens'
      });
    }
  });

on('detect-token-files', async (msg: { repoUrl: string; token: string; branch: string; directoryPath?: string }) => {
  const parsed = githubService.parseGitHubUrl(msg.repoUrl);
  
  if (!parsed) {
    emit('token-files-result', {
      success: false,
      error: 'Invalid GitHub URL format'
    });
    return;
  }
  
  try {
    const tokenFiles = await githubService.detectTokenFiles(
      parsed.owner,
      parsed.repo,
      msg.branch,
      msg.token,
      msg.directoryPath || ''
    );
    emit('token-files-result', {
      success: true,
      files: tokenFiles
    });
  } catch (error) {
    emit('token-files-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect token files'
    });
  }
});

on('scan-components', async (msg: { scanAll?: boolean }) => {
  try {
    const scanAll = msg.scanAll === true;
    
    if (scanAll) {
      emit('scan-progress', { message: 'Loading all pages...' });
      // Load all pages before scanning
      await figma.loadAllPagesAsync();
      emit('scan-progress', { message: 'Scanning all pages...' });
    } else {
      emit('scan-progress', { message: 'Scanning current page...' });
    }

    const result = scanAll
      ? figmaComponentService.scanAllComponents()
      : figmaComponentService.scanCurrentPage();

    emit('scan-result', {
      success: true,
      result: result
    });
  } catch (error) {
    emit('scan-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan components'
    });
  }
});

on('scan-components-for-token', async (msg: { token: any; scanAll?: boolean; scanSelection?: boolean }) => {
  try {
    const { token, scanAll, scanSelection } = msg;
    const scanAllPages = scanAll === true;
    const scanSelected = scanSelection === true;
    
    if (!token) {
      emit('scan-result', {
        success: false,
        error: 'No token provided'
      });
      return;
    }

    let progressMessage = 'Scanning for token matches...';
    if (scanAllPages) {
      progressMessage = 'Loading all pages...';
      emit('scan-progress', { message: progressMessage });
      
      // Load all pages before scanning
      await figma.loadAllPagesAsync();
      
      progressMessage = 'Scanning all pages for token matches...';
    } else if (scanSelected) {
      progressMessage = 'Scanning selection for token matches...';
    } else {
      progressMessage = 'Scanning current page for token matches...';
    }

    emit('scan-progress', { message: progressMessage });

    // Scan components
    emit('scan-progress', { message: 'Scanning components...' });
    let scanResult;
    if (scanAllPages) {
      scanResult = figmaComponentService.scanAllComponents();
    } else if (scanSelected) {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        emit('scan-result', {
          success: false,
          error: 'No selection found. Please select a frame or node to scan.'
        });
        return;
      }
      scanResult = figmaComponentService.scanNodes(selection);
    } else {
      scanResult = figmaComponentService.scanCurrentPage();
    }

    emit('scan-progress', { message: `Found ${scanResult.totalComponents} components. Matching tokens...` });

    // Use matching service to find matches
    const matchingResult = tokenMatchingService.matchTokenToComponents(token, scanResult);
    
    emit('scan-progress', { message: 'Matching complete!' });

      // Format results for UI
      const formattedResults = {
        token: {
          name: token.name,
          path: token.path,
          type: token.type,
          value: token.value
        },
        matchingComponents: matchingResult.matchingComponents.map(match => ({
          id: match.component.id,
          name: match.component.name,
          page: match.component.pageName,
          type: match.component.type,
          matches: match.matches.map(m => `${m.property}: ${m.matchedValue}`),
          matchDetails: match.matches,
          confidence: match.confidence
        })),
        totalMatches: matchingResult.totalMatches,
        totalComponentsScanned: matchingResult.totalComponentsScanned
      };

    emit('scan-result', {
      success: true,
      result: formattedResults
    });
  } catch (error) {
    emit('scan-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan components for token'
    });
  }
});

on('get-component-usage', async (msg: { componentId: string }) => {
  try {
    const { componentId } = msg;
    const stats = figmaComponentService.getComponentUsageStats(componentId);
    emit('component-usage-result', {
      success: true,
      stats: stats
    });
  } catch (error) {
    emit('component-usage-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get usage stats'
    });
  }
});

on('navigate-to-component', async (msg: { componentId: string }) => {
  try {
    const { componentId } = msg;
    const node = figma.getNodeById(componentId);
    
    if (node && 'type' in node) {
      // Handle nodes that might be on different pages
      const nodeParent = findPageForNode(node);
      if (nodeParent && nodeParent.type === 'PAGE' && nodeParent !== figma.currentPage) {
        await figma.setCurrentPageAsync(nodeParent);
      }
      
      // Select and zoom to the node (works with any SceneNode type)
      if (node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        emit('navigate-result', { success: true });
      } else {
        emit('navigate-result', {
          success: false,
          error: 'Cannot select document or page nodes'
        });
      }
    } else {
      emit('navigate-result', {
        success: false,
        error: 'Node not found'
      });
    }
  } catch (error) {
    emit('navigate-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to navigate to component'
    });
  }
});

// Helper to find the page containing a node
function findPageForNode(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE') {
    current = current.parent;
  }
  return current as PageNode | null;
}

on('cancel', () => {
  figma.closePlugin();
});

on('resize-window', (msg: { width: number; height: number }) => {
  figma.ui.resize(msg.width, msg.height);
});

// ============================================================================
// DIAGNOSTIC: Inspect Plugin Data (Phase 1 Investigation)
// This helps discover how Tokens Studio stores token references
// ============================================================================

interface PluginDataInspection {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  pluginData: Record<string, string>;
  sharedPluginData: Record<string, Record<string, string>>;
  boundVariables?: Record<string, any>;
}

/**
 * Inspect all plugin data on a node to discover Tokens Studio data format
 */
function inspectPluginData(node: SceneNode): PluginDataInspection {
  const results: PluginDataInspection = {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    pluginData: {},
    sharedPluginData: {}
  };

  // Get all plugin data keys (our plugin's namespace)
  try {
    const pluginDataKeys = node.getPluginDataKeys();
    for (const key of pluginDataKeys) {
      results.pluginData[key] = node.getPluginData(key);
    }
  } catch (e) {
    console.error('Error getting plugin data keys:', e);
  }

  // Get shared plugin data from known namespaces
  // These are namespaces that Tokens Studio and other plugins might use
  const namespaces = [
    'tokens',
    'tokens-studio', 
    'tokensStudio',
    'figma-tokens',
    'design-tokens',
    'token-studio',
    'com.tokens.studio',
    'tokens.studio',
    'io.tokens.studio',
    'figmatokens',
    'style-dictionary',
    // Common other plugin namespaces
    'ds',
    'design-system',
    'theme',
    'variables'
  ];

  for (const namespace of namespaces) {
    try {
      const keys = node.getSharedPluginDataKeys(namespace);
      if (keys.length > 0) {
        results.sharedPluginData[namespace] = {};
        for (const key of keys) {
          const value = node.getSharedPluginData(namespace, key);
          results.sharedPluginData[namespace][key] = value;
        }
      }
    } catch (e) {
      // Namespace doesn't exist or error accessing it - that's fine
    }
  }

  // Also check for Figma Variables (modern approach)
  try {
    if ('boundVariables' in node && node.boundVariables) {
      results.boundVariables = {};
      const boundVars = node.boundVariables as Record<string, any>;
      for (const [prop, binding] of Object.entries(boundVars)) {
        if (binding) {
          // Try to get variable details
          if (Array.isArray(binding)) {
            results.boundVariables[prop] = binding.map((b: any) => {
              try {
                const variable = figma.variables.getVariableById(b.id);
                return {
                  id: b.id,
                  name: variable?.name,
                  resolvedType: variable?.resolvedType,
                  valuesByMode: variable?.valuesByMode
                };
              } catch {
                return { id: b.id, error: 'Could not resolve variable' };
              }
            });
          } else if (binding.id) {
            try {
              const variable = figma.variables.getVariableById(binding.id);
              results.boundVariables[prop] = {
                id: binding.id,
                name: variable?.name,
                resolvedType: variable?.resolvedType,
                valuesByMode: variable?.valuesByMode
              };
            } catch {
              results.boundVariables[prop] = { id: binding.id, error: 'Could not resolve variable' };
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error getting bound variables:', e);
  }

  return results;
}

/**
 * Recursively inspect a node and its children
 */
function inspectNodeTree(node: SceneNode, maxDepth: number = 3, currentDepth: number = 0): PluginDataInspection[] {
  const results: PluginDataInspection[] = [];
  
  // Inspect this node
  const inspection = inspectPluginData(node);
  
  // Only include if there's actual data
  const hasData = 
    Object.keys(inspection.pluginData).length > 0 ||
    Object.keys(inspection.sharedPluginData).length > 0 ||
    (inspection.boundVariables && Object.keys(inspection.boundVariables).length > 0);
  
  // Always include the node itself for context, mark if it has data
  results.push({
    ...inspection,
    // Add a marker if this node has no plugin data
    pluginData: hasData ? inspection.pluginData : { '_noData': 'true' }
  });
  
  // Recurse into children if not at max depth
  if (currentDepth < maxDepth && 'children' in node) {
    for (const child of node.children) {
      results.push(...inspectNodeTree(child, maxDepth, currentDepth + 1));
    }
  }
  
  return results;
}

on('inspect-selection', async () => {
  try {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      emit('inspect-result', {
        success: false,
        error: 'No selection. Please select a node to inspect.'
      });
      return;
    }
    
    emit('inspect-progress', { message: 'Inspecting plugin data...' });
    
    const allResults: PluginDataInspection[] = [];
    
    for (const node of selection) {
      // Inspect the selected node and its children (up to 3 levels deep)
      const nodeResults = inspectNodeTree(node, 3);
      allResults.push(...nodeResults);
    }
    
    // Filter to only nodes with actual data for the summary
    const nodesWithData = allResults.filter(r => 
      !r.pluginData['_noData'] &&
      (Object.keys(r.pluginData).length > 0 ||
       Object.keys(r.sharedPluginData).length > 0 ||
       (r.boundVariables && Object.keys(r.boundVariables).length > 0))
    );
    
    // Clean up the _noData marker
    allResults.forEach(r => {
      if (r.pluginData['_noData']) {
        r.pluginData = {};
      }
    });
    
    emit('inspect-result', {
      success: true,
      results: allResults,
      summary: {
        totalNodesInspected: allResults.length,
        nodesWithPluginData: nodesWithData.length,
        namespacesFound: Array.from(new Set(nodesWithData.flatMap(r => Object.keys(r.sharedPluginData)))),
        pluginDataKeysFound: Array.from(new Set(nodesWithData.flatMap(r => Object.keys(r.pluginData)))),
        hasVariableBindings: nodesWithData.some(r => r.boundVariables && Object.keys(r.boundVariables).length > 0)
      }
    });
  } catch (error) {
    emit('inspect-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to inspect selection'
    });
  }
});

}
