import { GitHubTokenService } from '../services/github-token-service';
import { FigmaComponentService } from '../services/figma-component-service';
import { FigmaComponentServiceOptimized, ScanOptions } from '../services/figma-component-service-optimized';
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
const figmaComponentServiceOptimized = new FigmaComponentServiceOptimized();
const tokenMatchingService = new TokenMatchingService();

// Use optimized service by default for better performance
const USE_OPTIMIZED_SCANNER = true;

// Track last known document version for change detection
let lastKnownDocumentVersion: string | null = null;

/**
 * Check if document has changed since last scan
 * Useful for detecting when cache should be invalidated
 */
function hasDocumentChanged(): boolean {
  // Create a simple version hash from page structure
  const pages = figma.root.children
    .filter(p => p.type === 'PAGE')
    .map(p => p.id)
    .join(',');

  if (lastKnownDocumentVersion === null) {
    lastKnownDocumentVersion = pages;
    return false;
  }

  const changed = pages !== lastKnownDocumentVersion;
  lastKnownDocumentVersion = pages;
  return changed;
}

/**
 * Clear component cache if document has changed
 * This provides automatic incremental invalidation
 */
async function checkAndInvalidateCache(): Promise<void> {
  if (hasDocumentChanged()) {
    console.log('[Cache] Document changed, clearing component cache');
    await figmaComponentServiceOptimized.clearCache();
  }
}

// ============================================================================
// OPTIMIZATION: Token caching with Git SHA-based invalidation
// ============================================================================
interface TokenCache {
  sha: string;                    // Git commit SHA for cache invalidation
  tokens: any[];                  // Cached tokens
  metadata: {
    totalTokens: number;
    filesProcessed: number;
    totalFiles: number;
    perFileCounts: Array<{ file: string; count: number }>;
  };
  timestamp: number;              // When the cache was created
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minute TTL as fallback

/**
 * Generate a cache key from repo info
 */
function getCacheKey(owner: string, repo: string, branch: string, filePath: string): string {
  return `tokenCache_${owner}_${repo}_${branch}_${filePath || 'root'}`;
}

/**
 * Get cached tokens if valid
 */
async function getCachedTokens(cacheKey: string): Promise<TokenCache | null> {
  try {
    const cache = await figma.clientStorage.getAsync(cacheKey) as TokenCache | null;
    if (cache && cache.sha && cache.tokens) {
      // Check TTL as a safety fallback (even if SHA matches)
      if (Date.now() - cache.timestamp < CACHE_TTL_MS) {
        return cache;
      }
    }
  } catch (error) {
    console.error('Error reading token cache:', error);
  }
  return null;
}

/**
 * Save tokens to cache
 */
async function setCachedTokens(cacheKey: string, sha: string, tokens: any[], metadata: TokenCache['metadata']): Promise<void> {
  try {
    const cache: TokenCache = {
      sha,
      tokens,
      metadata,
      timestamp: Date.now()
    };
    await figma.clientStorage.setAsync(cacheKey, cache);
  } catch (error) {
    console.error('Error saving token cache:', error);
  }
}

/**
 * Clear token cache for a specific repo
 */
async function clearTokenCache(cacheKey: string): Promise<void> {
  try {
    await figma.clientStorage.deleteAsync(cacheKey);
  } catch (error) {
    console.error('Error clearing token cache:', error);
  }
}

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

  // ============================================================================
  // OPTIMIZED: Pre-compiled regex patterns (compiled once, reused)
  // ============================================================================
  const REGEX_HEX_COLOR = /^#[0-9A-Fa-f]{3,8}$/;
  const REGEX_RGBA = /^rgba?\(/;
  const REGEX_HSLA = /^hsla?\(/;
  const REGEX_DURATION = /^\d+(\.\d+)?(ms|s)$/;
  const REGEX_DIMENSION = /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/;
  const REGEX_SPACING_PATTERN = /\d+x$/;

  // Helpers - OPTIMIZED with pre-compiled regex and early returns
  const inferType = (val: any, pathStr: string): string => {
    // pathStr is already lowercase and joined (optimization: avoid repeated joins)
    
    if (typeof val === 'string') {
      // Check for color formats FIRST (most common, use early return)
      if (REGEX_HEX_COLOR.test(val)) return 'color';
      if (REGEX_RGBA.test(val)) return 'color';
      if (REGEX_HSLA.test(val)) return 'color';
      if (pathStr.includes('color') || pathStr.includes('colour')) return 'color';
      
      // Check for duration
      if (REGEX_DURATION.test(val)) return 'duration';
      if (pathStr.includes('duration')) return 'duration';
      
      // Check for border-radius specifically (before general dimension check)
      if (pathStr.includes('radius') || pathStr.includes('corner') || 
          pathStr.includes('rounded') || pathStr.includes('borderradius')) {
        return 'borderRadius';
      }
      
      // Check for border-width specifically
      if ((pathStr.includes('border') && (pathStr.includes('width') || pathStr.includes('weight'))) ||
          (pathStr.includes('stroke') && pathStr.includes('weight'))) {
        return 'borderWidth';
      }
      
      // Check for dimension/spacing
      if (REGEX_DIMENSION.test(val)) return 'dimension';
      if (pathStr.includes('size') || pathStr.includes('spacing') || pathStr.includes('space') ||
          pathStr.includes('gap') || pathStr.includes('padding') || pathStr.includes('margin') ||
          pathStr.includes('sizing') || pathStr.includes('dimension') ||
          REGEX_SPACING_PATTERN.test(pathStr)) {
        return 'dimension';
      }
      
      // Check for typography
      if (pathStr.includes('font') || pathStr.includes('typography') || pathStr.includes('text')) {
        if (pathStr.includes('weight')) return 'fontWeight';
        if (pathStr.includes('family')) return 'fontFamily';
        return 'typography';
      }
      
      // Check for shadow
      if (pathStr.includes('shadow') || pathStr.includes('elevation')) return 'shadow';
      
      // Check for border (after more specific border-radius and border-width)
      if (pathStr.includes('border') && !pathStr.includes('radius')) return 'border';
      
      return 'string';
    }
    
    if (typeof val === 'number') {
      // Infer from path for numbers - use early returns
      if (pathStr.includes('radius') || pathStr.includes('corner') || pathStr.includes('rounded')) return 'borderRadius';
      if (pathStr.includes('border') && pathStr.includes('width')) return 'borderWidth';
      if (pathStr.includes('stroke') && pathStr.includes('weight')) return 'borderWidth';
      if (pathStr.includes('weight') && pathStr.includes('font')) return 'fontWeight';
      if (pathStr.includes('opacity') || pathStr.includes('alpha')) return 'number';
      if (pathStr.includes('z-index') || pathStr.includes('zindex')) return 'number';
      // Check for spacing patterns
      if (pathStr.includes('spacing') || pathStr.includes('space') || pathStr.includes('gap') ||
          pathStr.includes('padding') || pathStr.includes('margin') || pathStr.includes('size') ||
          REGEX_SPACING_PATTERN.test(pathStr)) {
        return 'dimension';
      }
      return 'number';
    }
    
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      // Composite tokens - detect by structure
      const keys = Object.keys(val).map(k => k.toLowerCase());
      
      // Shadow composite: has blur, spread, color, offset
      if (pathStr.includes('shadow') || pathStr.includes('elevation') ||
          keys.some(k => ['blur', 'spread', 'offsetx', 'offsety'].includes(k))) {
        return 'shadow';
      }
      
      // Typography composite: has fontFamily, fontSize, etc.
      if (pathStr.includes('typography') || 
          keys.some(k => ['fontfamily', 'fontsize', 'fontweight', 'lineheight'].includes(k))) {
        return 'typography';
      }
      
      // Border composite: has color + width or style
      if (pathStr.includes('border') ||
          (keys.includes('width') && (keys.includes('color') || keys.includes('style'))) ||
          (keys.includes('color') && keys.includes('style'))) {
        return 'border';
      }
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
    
    // If value is an object (composite tokens like border, typography, shadow)
    if (typeof value === 'object' && value !== null) {
      // Check if parent has explicit token properties (type, description)
      if ('type' in obj || 'description' in obj) {
        return true;
      }
      
      // Check if value object looks like a known composite token type:
      // - Border: has color, width, style
      // - Typography: has fontFamily, fontSize, fontWeight, lineHeight
      // - Shadow: has color, x/offsetX, y/offsetY, blur, spread
      const valueKeys = Object.keys(value);
      
      // Border composite token
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

  /**
   * Check if an object is an unwrapped composite token (no 'value' wrapper)
   * This handles typography/border/shadow tokens that are structured as direct objects
   * e.g., { fontFamily: "...", fontSize: "...", fontWeight: "...", lineHeight: "..." }
   */
  const isUnwrappedCompositeToken = (obj: any, path: string[]): boolean => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    
    // Don't treat W3C or Token Studio wrapped tokens as unwrapped
    if ('$value' in obj || 'value' in obj) return false;
    
    const keys = Object.keys(obj);
    const lowercaseKeys = keys.map(k => k.toLowerCase());
    
    // Typography composite: has fontFamily, fontSize, fontWeight, or lineHeight
    const typographyKeys = ['fontfamily', 'fontsize', 'fontweight', 'lineheight', 'letterspacing', 'texttransform', 'textdecoration'];
    const hasTypographyKeys = lowercaseKeys.filter(k => typographyKeys.includes(k)).length >= 2;
    if (hasTypographyKeys) {
      return true;
    }
    
    // Border composite: has color + width or style  
    const hasBorderKeys = lowercaseKeys.includes('color') && 
      (lowercaseKeys.includes('width') || lowercaseKeys.includes('style'));
    if (hasBorderKeys) {
      return true;
    }
    
    // Shadow composite: has blur/spread + color + offset
    const hasShadowKeys = lowercaseKeys.some(k => ['blur', 'spread'].includes(k)) &&
      lowercaseKeys.includes('color') &&
      (lowercaseKeys.some(k => ['x', 'y', 'offsetx', 'offsety'].includes(k)));
    if (hasShadowKeys) {
      return true;
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

  // ============================================================================
  // OPTIMIZED: Token extraction with mutable path array (no spread operator)
  // ============================================================================
  const extractTokensFromJson = (obj: any, filePath: string) => {
    const tokens: Array<{ name: string; path: string[]; type: string; sourceFile: string; value?: any }> = [];
    
    // OPTIMIZATION: Use a mutable path array with push/pop instead of [...path]
    const pathStack: string[] = [];
    
    const addToken = (value: any, explicitType: string | undefined) => {
      const name = pathStack[pathStack.length - 1] || 'unnamed';
      // OPTIMIZATION: Join path once and pass string to inferType
      const pathStr = pathStack.join('.').toLowerCase();
      const t = explicitType || inferType(value, pathStr);
      
      tokens.push({ 
        name, 
        path: pathStack.slice(), // Create copy only when adding token (much less frequent)
        type: t, 
        sourceFile: filePath,
        value: value 
      });
    };
    
    const walk = (node: any) => {
      // Skip null/undefined
      if (node === null || node === undefined) {
        return;
      }

      // Skip internal metadata keys
      const currentKey = pathStack[pathStack.length - 1] || '';
      if (currentKey.startsWith('$') && currentKey !== '$value' && currentKey !== '$type') {
        return;
      }
      
      // Check for W3C format token ($value)
      if (isW3CToken(node)) {
        addToken(node.$value, node.$type);
        return;
      }

      // Check for Token Studio format (value property without $)
      if (isTokenStudioToken(node)) {
        addToken(node.value, node.type);
        return;
      }

      // Check if this is a primitive value at a leaf node (plain nested format)
      if (isPrimitiveToken(node, pathStack)) {
        addToken(node, undefined);
        return;
      }
      
      // Check if this is an unwrapped composite token (typography/border/shadow without 'value' wrapper)
      if (isUnwrappedCompositeToken(node, pathStack)) {
        addToken(node, undefined);
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
          // OPTIMIZATION: push/pop instead of creating new arrays
          pathStack.push(key);
          walk(child);
          pathStack.pop();
        }
      }
    };

    walk(obj);

    return tokens;
  };

  // ============================================================================
  // OPTIMIZED: Parallel file fetching with batched Promise.all + Caching + Streaming
  // ============================================================================
  const FETCH_BATCH_SIZE = 5; // Fetch 5 files in parallel (avoid rate limiting)
  const STREAM_CHUNK_SIZE = 100; // Send tokens in chunks for progressive loading

  on('fetch-tokens', async (msg: { repoUrl: string; token: string; branch: string; filePath?: string; forceRefresh?: boolean }) => {
    const parsed = githubService.parseGitHubUrl(msg.repoUrl);

    if (!parsed) {
      emit('tokens-result', {
        success: false,
        error: 'Invalid GitHub URL format'
      });
      return;
    }

    try {
      const directoryPath = msg.filePath || '';
      const cacheKey = getCacheKey(parsed.owner, parsed.repo, msg.branch, directoryPath);
      
      // ========================================================================
      // OPTIMIZATION 1: Check cache with SHA-based invalidation
      // ========================================================================
      if (!msg.forceRefresh) {
        emit('tokens-progress', { message: 'Checking for cached tokens...' });
        
        // Get current commit SHA and cached data in parallel
        const [currentSha, cachedData] = await Promise.all([
          githubService.getLatestCommitSha(parsed.owner, parsed.repo, msg.branch, msg.token),
          getCachedTokens(cacheKey)
        ]);
        
        // If we have valid cached data and SHA matches, return cached tokens immediately
        if (cachedData && currentSha && cachedData.sha === currentSha) {
          emit('tokens-progress', { message: 'Using cached tokens (no changes detected)' });
          
          // Stream cached tokens in chunks for responsive UI
          const cachedTokens = cachedData.tokens;
          for (let i = 0; i < cachedTokens.length; i += STREAM_CHUNK_SIZE) {
            const chunk = cachedTokens.slice(i, i + STREAM_CHUNK_SIZE);
            const isLast = i + STREAM_CHUNK_SIZE >= cachedTokens.length;
            
            emit('tokens-chunk', {
              tokens: chunk,
              chunkIndex: Math.floor(i / STREAM_CHUNK_SIZE),
              totalChunks: Math.ceil(cachedTokens.length / STREAM_CHUNK_SIZE),
              isLast
            });
          }
          
          emit('tokens-result', {
            success: true,
            tokens: cachedTokens,
            metadata: {
              ...cachedData.metadata,
              fromCache: true,
              cacheAge: Date.now() - cachedData.timestamp,
              errors: []
            }
          });
          return;
        }
      }
      
      // ========================================================================
      // OPTIMIZATION 2: Detect token files (uses Trees API)
      // ========================================================================
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

      // ========================================================================
      // OPTIMIZATION 3: Parallel file fetching with batched Promise.all
      // ========================================================================
      
      const allTokens: any[] = [];
      const allErrors: Array<{ file: string; message: string }> = [];
      let filesProcessed = 0;
      let totalTokens = 0;
      const perFileCounts: Array<{ file: string; count: number }> = [];
      
      // Store fetched file contents for processing
      const fileContents: Array<{ path: string; content: string }> = [];
      
      // Phase 1: Fetch all files in parallel batches
      emit('tokens-progress', { message: `Fetching ${tokenFiles.length} files...` });
      
      for (let i = 0; i < tokenFiles.length; i += FETCH_BATCH_SIZE) {
        const batch = tokenFiles.slice(i, i + FETCH_BATCH_SIZE);
        const batchEnd = Math.min(i + FETCH_BATCH_SIZE, tokenFiles.length);
        
        emit('tokens-progress', { 
          message: `Fetching files ${i + 1}-${batchEnd} of ${tokenFiles.length}...` 
        });
        
        // Fetch batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (filePath) => {
            try {
              const fileContent = await githubService.fetchFileContents(
                parsed.owner,
                parsed.repo,
                msg.branch,
                msg.token,
                filePath
              );
              
              if (!fileContent.content) {
                return { path: filePath, error: 'Empty file content' };
              }
              
              const decoded = githubService.decodeBase64Content(fileContent.content);
              return { path: filePath, content: decoded };
            } catch (error) {
              return { 
                path: filePath, 
                error: error instanceof Error ? error.message : 'Fetch failed' 
              };
            }
          })
        );
        
        // Collect results
        for (const result of batchResults) {
          if ('content' in result && result.content) {
            fileContents.push({ path: result.path, content: result.content });
          } else if ('error' in result) {
            allErrors.push({ file: result.path, message: result.error as string });
            perFileCounts.push({ file: result.path, count: 0 });
          }
        }
      }
      
      // ========================================================================
      // OPTIMIZATION 4: Parse files and stream results progressively
      // ========================================================================
      emit('tokens-progress', { message: `Processing ${fileContents.length} files...` });
      
      let chunkBuffer: any[] = [];
      let chunkIndex = 0;
      
      for (const { path: filePath, content } of fileContents) {
        try {
          let json: any;
          try {
            json = JSON.parse(content);
          } catch (e) {
            throw new Error(`JSON parse failed: ${(e as Error).message}`);
          }

          const extracted = extractTokensFromJson(json, filePath);

          const countForFile = extracted.length;
          totalTokens += countForFile;
          perFileCounts.push({ file: filePath, count: countForFile });

          if (countForFile === 0) {
            allErrors.push({
              file: filePath,
              message: 'No token values found in this file (checked $value, value, and primitives)'
            });
          }

          // Add tokens and stream chunks
          for (const t of extracted) {
            const formattedToken = {
              name: t.name || '',
              path: t.path || '',
              type: t.type || 'unknown',
              sourceFile: t.sourceFile || '',
              value: t.value // Include value for search and display
            };
            allTokens.push(formattedToken);
            chunkBuffer.push(formattedToken);
            
            // Stream chunk when buffer is full
            if (chunkBuffer.length >= STREAM_CHUNK_SIZE) {
              emit('tokens-chunk', {
                tokens: chunkBuffer,
                chunkIndex: chunkIndex++,
                isLast: false
              });
              chunkBuffer = [];
            }
          }

          filesProcessed++;
        } catch (error) {
          console.error(`Failed to parse ${filePath}:`, error);
          perFileCounts.push({ file: filePath, count: 0 });
          allErrors.push({
            file: filePath,
            message: error instanceof Error ? error.message : 'Failed to parse file'
          });
        }
      }
      
      // Stream any remaining tokens in buffer
      if (chunkBuffer.length > 0) {
        emit('tokens-chunk', {
          tokens: chunkBuffer,
          chunkIndex: chunkIndex++,
          isLast: true
        });
      }

      emit('tokens-progress', { message: `Found ${totalTokens} tokens in ${filesProcessed} files` });

      // ========================================================================
      // OPTIMIZATION 5: Cache the results for next time
      // ========================================================================
      const currentSha = await githubService.getLatestCommitSha(
        parsed.owner, parsed.repo, msg.branch, msg.token
      );
      
      if (currentSha) {
        await setCachedTokens(cacheKey, currentSha, allTokens, {
          totalTokens,
          filesProcessed,
          totalFiles: tokenFiles.length,
          perFileCounts
        });
      }

      // Send final result (UI may already have tokens from chunks)
      emit('tokens-result', {
        success: true,
        tokens: allTokens,
        metadata: {
          totalTokens,
          filesProcessed: filesProcessed,
          totalFiles: tokenFiles.length,
          perFileCounts,
          errors: allErrors,
          fromCache: false
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
      ? await figmaComponentService.scanAllComponents()
      : await figmaComponentService.scanCurrentPage();

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

on('scan-components-for-token', async (msg: { token: any; scanAll?: boolean; scanSelection?: boolean; pageFilter?: string[] }) => {
  try {
    const { token, scanAll, scanSelection, pageFilter } = msg;
    const scanAllPages = scanAll === true;
    const scanSelected = scanSelection === true;
    const hasPageFilter = pageFilter && pageFilter.length > 0;

    if (!token) {
      emit('scan-result', {
        success: false,
        error: 'No token provided'
      });
      return;
    }

    // Check for document changes and invalidate cache if needed
    await checkAndInvalidateCache();

    // Determine token type for optimized extraction
    const tokenType = token.type || 'all';

    let progressMessage = 'Scanning for token matches...';
    if (scanAllPages) {
      progressMessage = hasPageFilter 
        ? `Loading ${pageFilter!.length} page(s)...`
        : 'Loading all pages...';
      emit('scan-progress', { message: progressMessage });
      
      // Load all pages before scanning
      await figma.loadAllPagesAsync();
      
      progressMessage = hasPageFilter
        ? `Scanning ${pageFilter!.join(', ')} for token matches...`
        : 'Scanning all pages for token matches...';
    } else if (scanSelected) {
      progressMessage = 'Scanning selection for token matches...';
    } else {
      progressMessage = 'Scanning current page for token matches...';
    }

    emit('scan-progress', { message: progressMessage });

    let scanResult;

    // Use optimized async scanner for "all pages" with progress callbacks
    if (USE_OPTIMIZED_SCANNER && scanAllPages) {
      emit('scan-progress', { message: 'Scanning components (optimized)...' });
      
      // Build scan options
      const scanOptions: ScanOptions = {
        tokenType: tokenType as any,
        useCache: true,
        usePersistentCache: true, // Enable persistent cache with document version tracking
        chunkSize: 100,
        maxDepth: 3,
        includeChildren: true,
        pageFilter: hasPageFilter ? pageFilter : undefined,
        onProgress: (progress) => {
          const percent = Math.round((progress.currentPage / progress.totalPages) * 100);
          emit('scan-progress', {
            message: `Page ${progress.currentPage}/${progress.totalPages}: ${progress.currentPageName} (${progress.componentsFound} found)`,
            progress: percent
          });
        }
      };
      
      // Use optimized async scanner
      scanResult = await figmaComponentServiceOptimized.scanAllComponentsOptimized(scanOptions);
    } else {
      // Fallback to synchronous scanner for current page/selection
      emit('scan-progress', { message: 'Scanning components...' });
      
      if (scanAllPages) {
        if (hasPageFilter) {
          scanResult = await figmaComponentService.scanFilteredPages(pageFilter!);
        } else {
          scanResult = await figmaComponentService.scanAllComponents();
        }
      } else if (scanSelected) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          emit('scan-result', {
            success: false,
            error: 'No selection found. Please select a frame or node to scan.'
          });
          return;
        }
        scanResult = await figmaComponentService.scanNodes(selection);
      } else {
        scanResult = await figmaComponentService.scanCurrentPage();
      }
    }

    emit('scan-progress', { message: `Found ${scanResult.totalComponents} components. Matching tokens...` });

    // Use matching service to find matches
    const matchingResult = tokenMatchingService.matchTokenToComponents(token, scanResult);
    
    emit('scan-progress', { message: 'Filtering nested duplicates...' });

    // Filter out components that only match because they contain other matched components
    // For example: if KdsButton has a direct match, don't show KdsCard that only matches via nested KdsButton
    // NEW ALGORITHM: Use mainComponentId for reliable deduplication
    
    // Helper: Check if a property is a direct match (not nested in another component)
    // Direct matches:
    //   - "fill color" (no arrow)
    //   - "Variant=Active → fill color" (one arrow, variant to property)
    // Nested matches:
    //   - "ParentFrame → ChildComponent → fill color" (arrows through component layers)
    //   - "Count=1 → AvatarGroup → KdsAvatar → fill color" (variant with nested components)
    const isDirectMatch = (property: string): boolean => {
      if (!property.includes(' → ')) return true; // No arrow means direct
      
      const parts = property.split(' → ');
      
      // If only 1 arrow and first part has = (variant syntax), it's direct
      // E.g., "Variant=Active → fill color"
      if (parts.length === 2 && parts[0].includes('=')) {
        return true;
      }
      
      // If multiple arrows, it's nested through component layers
      // E.g., "Count=1 → AvatarGroup → KdsAvatar → fill color"
      if (parts.length > 2) {
        return false;
      }
      
      // Single arrow without = in first part is also nested
      // E.g., "FrameName → fill color"
      return false;
    };
    
    // Build map of mainComponentIds with direct matches
    const directMatchIds = new Set<string>();
    for (const match of matchingResult.matchingComponents) {
      const hasDirectMatch = match.matches.some(m => isDirectMatch(m.property));
      if (hasDirectMatch && match.component.mainComponentId) {
        directMatchIds.add(match.component.mainComponentId);
      }
    }

    // Filter out containers that only match via already-matched nested components
    const filteredComponents = matchingResult.matchingComponents.filter(match => {
      const hasDirectMatch = match.matches.some(m => isDirectMatch(m.property));
      if (hasDirectMatch) return true;

      // Keep if any nested match points to a component NOT in directMatchIds
      return match.matches.some(m => {
        if (isDirectMatch(m.property)) return false; // Not a nested match
        return !m.nestedMainComponentId || !directMatchIds.has(m.nestedMainComponentId);
      });
    });
    
    emit('scan-progress', { message: 'Matching complete!' });

    // Format results for UI
    const formattedResults = {
      token: {
        name: token.name,
        path: token.path,
        type: token.type,
        value: token.value
      },
      matchingComponents: filteredComponents.map(match => ({
        id: match.component.id,
        name: match.component.name,
        page: match.component.pageName,
        type: match.component.type,
        mainComponentName: match.component.mainComponentName,
        mainComponentId: match.component.mainComponentId,
        variantName: match.component.variantName,  // NEW
        matches: match.matches.map(m => `${m.property}: ${m.matchedValue}`),
        matchDetails: match.matches,
        confidence: match.confidence
      })),
      totalMatches: filteredComponents.length,
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
    // Use async version for dynamic-page document access
    const node = await figma.getNodeByIdAsync(componentId);
    
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

// ============================================================================
// Phase 2: Create Component Collection (Paste to Canvas)
// ============================================================================

interface MatchingComponent {
  id: string;
  name: string;
  page: string;
  type: string;
  mainComponentName?: string;
  mainComponentId?: string;
  variantName?: string;  // NEW
  matches: string[];
  matchDetails: Array<{
    property: string;
    propertyType: string;
    matchedValue: string;
    tokenValue: string;
    confidence: number;
  }>;
}

interface ComponentCollectionRequest {
  token: {
    name: string;
    path: string[];
    type: string;
    value?: any;
  };
  groupedComponents: { [mainName: string]: MatchingComponent[] };
  matchingComponents: MatchingComponent[];
}

/**
 * Get a default variant component from a ComponentSet or Component
 * Returns a ComponentNode that can be used to create an instance
 */
async function getDefaultVariantComponent(nodeId: string): Promise<ComponentNode | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) return null;
  
  // If it's a COMPONENT_SET, get the first/default variant
  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;
    // Try to get default variant or first child
    const defaultVariant = componentSet.defaultVariant || componentSet.children[0];
    if (defaultVariant?.type === 'COMPONENT') {
      return defaultVariant as ComponentNode;
    }
  }
  
  // If it's already a COMPONENT, return it
  if (node.type === 'COMPONENT') {
    return node as ComponentNode;
  }
  
  // If it's an INSTANCE, get its main component
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    return await instance.getMainComponentAsync();
  }
  
  return null;
}

on('create-component-collection', async (msg: ComponentCollectionRequest) => {
  try {
    const { token, groupedComponents, matchingComponents } = msg;
    
    const groupEntries = Object.entries(groupedComponents || {});
    if (groupEntries.length === 0 && (!matchingComponents || matchingComponents.length === 0)) {
      emit('create-collection-result', {
        success: false,
        error: 'No components to collect'
      });
      return;
    }

    // Get the token path for naming
    const tokenPath = Array.isArray(token.path) ? token.path.join('.') : token.name;
    
    // Create the main container frame
    const containerFrame = figma.createFrame();
    containerFrame.name = `Token Matches: ${tokenPath}`;
    containerFrame.layoutMode = 'VERTICAL';
    containerFrame.primaryAxisSizingMode = 'AUTO';
    containerFrame.counterAxisSizingMode = 'AUTO';
    containerFrame.paddingTop = 32;
    containerFrame.paddingBottom = 32;
    containerFrame.paddingLeft = 32;
    containerFrame.paddingRight = 32;
    containerFrame.itemSpacing = 24;
    containerFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
    containerFrame.cornerRadius = 8;

    // Create header text
    const headerText = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    headerText.fontName = { family: 'Inter', style: 'Bold' };
    headerText.characters = `Token: ${tokenPath}`;
    headerText.fontSize = 18;
    headerText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    containerFrame.appendChild(headerText);

    // Count total unique main components
    const totalGroups = groupEntries.length;
    const totalVariants = matchingComponents?.length || 0;
    
    // Create subtitle with count
    const subtitleText = figma.createText();
    subtitleText.fontName = { family: 'Inter', style: 'Regular' };
    subtitleText.characters = `${totalGroups} component${totalGroups !== 1 ? 's' : ''}${totalVariants > totalGroups ? ` (${totalVariants} variants total)` : ''}`;
    subtitleText.fontSize = 12;
    subtitleText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    containerFrame.appendChild(subtitleText);

    // Create components list frame (vertical layout for multiple cards)
    const gridFrame = figma.createFrame();
    gridFrame.name = 'Components List';
    gridFrame.layoutMode = 'VERTICAL';
    gridFrame.primaryAxisSizingMode = 'AUTO';
    gridFrame.counterAxisSizingMode = 'AUTO';
    gridFrame.itemSpacing = 16;
    gridFrame.fills = [];
    containerFrame.appendChild(gridFrame);

    // Process each group (main component with its variants)
    let createdCount = 0;
    
    for (const [mainName, variants] of groupEntries) {
      const variantCount = variants.length;
      
      try {
        // Create a card frame for this component group
        const cardFrame = figma.createFrame();
        cardFrame.name = mainName;
        cardFrame.layoutMode = 'VERTICAL';
        cardFrame.primaryAxisSizingMode = 'AUTO';
        cardFrame.counterAxisSizingMode = 'AUTO';
        cardFrame.paddingTop = 16;
        cardFrame.paddingBottom = 16;
        cardFrame.paddingLeft = 16;
        cardFrame.paddingRight = 16;
        cardFrame.itemSpacing = 8;
        // White background for canvas cards
        cardFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        cardFrame.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
        cardFrame.strokeWeight = 1;
        cardFrame.cornerRadius = 6;

        // Add component name label
        const nameLabel = figma.createText();
        nameLabel.fontName = { family: 'Inter', style: 'Bold' };
        nameLabel.characters = mainName;
        nameLabel.fontSize = 12;
        nameLabel.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
        cardFrame.appendChild(nameLabel);

        // Add match info: show property and value in format "{value} {tag} used in {n} variants"
        const firstVariant = variants[0];
        if (firstVariant?.matchDetails && firstVariant.matchDetails.length > 0) {
          const matchDetail = firstVariant.matchDetails[0];
          const matchLabel = figma.createText();
          matchLabel.fontName = { family: 'Inter', style: 'Regular' };
          
          // Extract value (before ← if present)
          let value = '';
          if (matchDetail.matchedValue) {
            const valueMatch = matchDetail.matchedValue.match(/^([^←]+)/);
            if (valueMatch) {
              value = valueMatch[1].trim();
            }
          }
          
          // Get property type (cleaned)
          const propType = matchDetail.property.replace(/\s*\([^)]*\)\s*/g, '').trim();
          
          // Format: "{value} {tag} used in {n} variants" or "{value} {tag}"
          let matchText = value ? `${value} → ${propType}` : propType;
          if (variantCount > 1) {
            matchText += ` (${variantCount} variants)`;
          }
          
          matchLabel.characters = matchText;
          matchLabel.fontSize = 10;
          matchLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          cardFrame.appendChild(matchLabel);
        }

        // Create a horizontal container for all variant instances (with wrapping)
        const instancesContainer = figma.createFrame();
        instancesContainer.name = 'Variants';
        instancesContainer.layoutMode = 'HORIZONTAL';
        instancesContainer.layoutWrap = 'WRAP';
        instancesContainer.primaryAxisSizingMode = 'AUTO';
        instancesContainer.counterAxisSizingMode = 'AUTO';
        // Safety padding of 60px to catch absolute positioned elements (was 40)
        instancesContainer.paddingTop = 60;
        instancesContainer.paddingBottom = 60;
        instancesContainer.paddingLeft = 60;
        instancesContainer.paddingRight = 60;
        instancesContainer.itemSpacing = 20;  // Was 12
        instancesContainer.counterAxisSpacing = 20;  // Was 12
        instancesContainer.fills = [];
        // Don't clip content to catch absolute positioned elements
        instancesContainer.clipsContent = false;
        cardFrame.appendChild(instancesContainer);

        // Create instances for each matched variant
        // For COMPONENT_SET nodes, we need to create instances for ALL variants that have matches
        // (not just the first one we find)
        let instancesCreated = 0;
        const processedVariantNames = new Set<string>(); // Avoid exact duplicates
        
        // Collect all unique variant names from the match details of all variants in this group
        const variantNamesToCreate = new Set<string>();
        for (const variant of variants) {
          // Extract variant names from match details
          if (variant.matchDetails && variant.matchDetails.length > 0) {
            for (const detail of variant.matchDetails) {
              const parts = detail.property.split(' → ');
              if (parts.length > 0 && parts[0].includes('=')) {
                variantNamesToCreate.add(parts[0].trim());
              }
            }
          }
          // Also include direct variantName if present
          if (variant.variantName) {
            variantNamesToCreate.add(variant.variantName);
          }
        }
        
        // Now get the component set node (use first variant's ID)
        const firstVariantInGroup = variants[0];
        if (!firstVariantInGroup) continue;
        
        try {
          const node = await figma.getNodeByIdAsync(firstVariantInGroup.id);
          if (!node) continue;
          
          // Handle different node types
          if (node.type === 'COMPONENT_SET') {
            const componentSet = node as ComponentSetNode;
            
            // Create instances for each variant name we found
            for (const variantName of Array.from(variantNamesToCreate)) {
              if (processedVariantNames.has(variantName)) continue;
              processedVariantNames.add(variantName);
              
              // Find the matching variant component
              let targetVariant: ComponentNode | null = null;
              for (const child of componentSet.children) {
                if (child.type === 'COMPONENT' && child.name === variantName) {
                  targetVariant = child as ComponentNode;
                  break;
                }
              }
              
              if (targetVariant) {
                const instance = targetVariant.createInstance();
                
                // Don't resize - let components use their natural size (hug content)
                instancesContainer.appendChild(instance);
                instancesCreated++;
              }
            }
          } else {
            // For non-COMPONENT_SET nodes, handle each variant individually (old logic)
            for (const variant of variants) {
              try {
                const varNode = await figma.getNodeByIdAsync(variant.id);
                if (!varNode) continue;
                
                let nodeToAdd: SceneNode | null = null;
                let variantIdentifier = variant.name;
                
                if (varNode.type === 'INSTANCE') {
                  const instance = varNode as InstanceNode;
                  try {
                    const mainComp = await instance.getMainComponentAsync();
                    if (mainComp) {
                      variantIdentifier = mainComp.name;
                    }
                  } catch {}
                  
                  if (processedVariantNames.has(variantIdentifier)) continue;
                  processedVariantNames.add(variantIdentifier);
                  
                  nodeToAdd = instance.clone();
                } else if (varNode.type === 'COMPONENT') {
                  const component = varNode as ComponentNode;
                  variantIdentifier = component.name;
                  
                  if (processedVariantNames.has(variantIdentifier)) continue;
                  processedVariantNames.add(variantIdentifier);
                  
                  nodeToAdd = component.createInstance();
                } else if (varNode.type === 'FRAME' || varNode.type === 'GROUP' || varNode.type === 'RECTANGLE' || 
                           varNode.type === 'ELLIPSE' || varNode.type === 'LINE' || varNode.type === 'TEXT' ||
                           varNode.type === 'VECTOR' || varNode.type === 'POLYGON' || varNode.type === 'STAR') {
                  if (processedVariantNames.has(variantIdentifier)) continue;
                  processedVariantNames.add(variantIdentifier);
                  
                  nodeToAdd = (varNode as FrameNode | GroupNode | RectangleNode | EllipseNode | LineNode | TextNode | VectorNode | PolygonNode | StarNode).clone();
                }
                
                if (nodeToAdd) {
                  // Don't resize - let components use their natural size (hug content)
                  instancesContainer.appendChild(nodeToAdd);
                  instancesCreated++;
                }
              } catch (error) {
                console.error(`Failed to create instance for variant ${variant.id}:`, error);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to process component ${mainName}:`, error);
        }
        
        // Only add the card if we created at least one instance
        if (instancesCreated > 0) {
          gridFrame.appendChild(cardFrame);
          createdCount++;
        } else {
          // Clean up empty card
          cardFrame.remove();
        }
      } catch (error) {
        console.error(`Failed to create card for ${mainName}:`, error);
      }
    }

    // Position the container frame in the viewport
    const viewport = figma.viewport;
    containerFrame.x = viewport.center.x - containerFrame.width / 2;
    containerFrame.y = viewport.center.y - containerFrame.height / 2;

    // Add to current page
    figma.currentPage.appendChild(containerFrame);

    // Select and zoom to the new frame
    figma.currentPage.selection = [containerFrame];
    figma.viewport.scrollAndZoomIntoView([containerFrame]);

    // Notify success
    figma.notify(`Created collection with ${createdCount} component${createdCount !== 1 ? 's' : ''}`);
    
    emit('create-collection-result', {
      success: true,
      count: createdCount,
      frameId: containerFrame.id
    });
  } catch (error) {
    console.error('Failed to create component collection:', error);
    emit('create-collection-result', {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create collection'
    });
  }
});

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
