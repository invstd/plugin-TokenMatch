/**
 * Optimized Figma Component Service
 * Designed for large files (100+ pages, many component variants)
 * 
 * Key optimizations:
 * 1. Lazy/progressive scanning with chunking
 * 2. Token type-specific extraction (only extract what we need)
 * 3. Caching with cache invalidation
 * 4. Indexed token references for O(1) lookups
 * 5. Configurable scan depth and limits
 */

import {
  ComponentProperties,
  ColorProperty,
  TypographyProperty,
  SpacingProperty,
  EffectProperty,
  ScanResult,
  ComponentScanError,
  ComponentUsageStats,
  RGBAColor
} from '../types/components';

// Types for optimization
export interface ScanOptions {
  /** Token type to filter extraction (only extract relevant properties) */
  tokenType?: 'color' | 'typography' | 'dimension' | 'spacing' | 'effect' | 'borderRadius' | 'borderWidth' | 'shadow' | 'all';
  /** Maximum nodes to scan per page (0 = unlimited) */
  maxNodesPerPage?: number;
  /** Maximum pages to scan (0 = unlimited) */
  maxPages?: number;
  /** Batch size for chunked processing */
  chunkSize?: number;
  /** Progress callback */
  onProgress?: (progress: ScanProgress) => void;
  /** Whether to include children in extraction */
  includeChildren?: boolean;
  /** Maximum depth for child extraction */
  maxDepth?: number;
  /** Whether to use cached results */
  useCache?: boolean;
  /** Whether to use persistent storage cache (figma.clientStorage) */
  usePersistentCache?: boolean;
  /** Specific page names to scan (empty = all) */
  pageFilter?: string[];
}

export interface ScanProgress {
  currentPage: number;
  totalPages: number;
  currentPageName: string;
  componentsFound: number;
  nodesScanned: number;
  phase: 'loading' | 'scanning' | 'matching' | 'complete';
}

interface CacheEntry {
  components: ComponentProperties[];
  timestamp: number;
  pageVersion?: number;
  documentVersion?: string; // Figma document version for incremental invalidation
  editSessionId?: string;   // Figma edit session for change detection
}

interface PersistentCacheEntry {
  components: ComponentProperties[];
  timestamp: number;
  documentVersion: string;
  editSessionId: string;
  tokenType: string;
  pageNames: string[];
}

interface TokenIndex {
  byPath: Map<string, Set<string>>; // token path -> component IDs
  byValue: Map<string, Set<string>>; // normalized value -> component IDs
}

export class FigmaComponentServiceOptimized {
  private errors: ComponentScanError[] = [];
  
  // Cache for scan results
  private cache: Map<string, CacheEntry> = new Map();
  private cacheMaxAge = 5 * 60 * 1000; // 5 minutes
  
  // Token index for fast lookups
  private tokenIndex: TokenIndex = {
    byPath: new Map(),
    byValue: new Map()
  };
  
  // Tokens Studio plugin namespace
  private readonly TOKENS_STUDIO_NAMESPACE = 'tokens';
  
  // Debug logging - OFF by default for performance
  private debugLogging = false;

  /**
   * Enable/disable debug logging
   */
  setDebugLogging(enabled: boolean): void {
    this.debugLogging = enabled;
  }

  /**
   * Clear all caches (memory and persistent)
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    this.tokenIndex = { byPath: new Map(), byValue: new Map() };

    // Clear persistent cache
    try {
      const keys = await figma.clientStorage.keysAsync();
      const cacheKeys = keys.filter(key => key.startsWith('componentCache_'));
      for (const key of cacheKeys) {
        await figma.clientStorage.deleteAsync(key);
      }
    } catch (error) {
      console.error('Error clearing persistent cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; indexedPaths: number; indexedValues: number } {
    return {
      entries: this.cache.size,
      indexedPaths: this.tokenIndex.byPath.size,
      indexedValues: this.tokenIndex.byValue.size
    };
  }

  /**
   * Get document version information for cache invalidation
   * Uses document ID and a hash of page names/IDs as a proxy for version
   */
  private getDocumentVersion(): { documentVersion: string; editSessionId: string } {
    // Create a version string from document structure
    // This changes when pages are added/removed/renamed
    const pages = figma.root.children
      .filter(p => p.type === 'PAGE')
      .map(p => `${p.id}:${p.name}`)
      .join('|');

    const versionHash = pages.split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0).toString(36);

    return {
      documentVersion: versionHash,
      editSessionId: figma.root.id // Use root ID as a session identifier
    };
  }

  /**
   * Generate cache key for persistent storage
   */
  private getPersistentCacheKey(tokenType: string, pageNames: string[]): string {
    const sortedPages = pageNames.slice().sort().join(',');
    return `componentCache_${tokenType}_${sortedPages || 'all'}`;
  }

  /**
   * Get from persistent cache if valid
   */
  private async getFromPersistentCache(
    tokenType: string,
    pageNames: string[]
  ): Promise<ComponentProperties[] | null> {
    try {
      const cacheKey = this.getPersistentCacheKey(tokenType, pageNames);
      const cached = await figma.clientStorage.getAsync(cacheKey) as PersistentCacheEntry | null;

      if (!cached) return null;

      // Validate cache against document version
      const currentVersion = this.getDocumentVersion();

      // Cache is valid if:
      // 1. Document version matches (no major changes)
      // 2. Edit session matches (same document instance)
      // 3. Not expired (5 minutes)
      const isValid =
        cached.documentVersion === currentVersion.documentVersion &&
        cached.editSessionId === currentVersion.editSessionId &&
        Date.now() - cached.timestamp < this.cacheMaxAge;

      if (isValid) {
        if (this.debugLogging) {
          console.log(`[Cache] HIT - Persistent cache valid for ${tokenType} (${pageNames.length} pages)`);
        }
        return cached.components;
      } else {
        if (this.debugLogging) {
          console.log(`[Cache] MISS - Invalidated (version: ${cached.documentVersion} vs ${currentVersion.documentVersion})`);
        }
        // Clean up invalid cache
        await figma.clientStorage.deleteAsync(cacheKey);
      }
    } catch (error) {
      if (this.debugLogging) {
        console.error('Error reading persistent cache:', error);
      }
    }
    return null;
  }

  /**
   * Save to persistent cache
   */
  private async saveToPersistentCache(
    tokenType: string,
    pageNames: string[],
    components: ComponentProperties[]
  ): Promise<void> {
    try {
      const cacheKey = this.getPersistentCacheKey(tokenType, pageNames);
      const version = this.getDocumentVersion();

      const entry: PersistentCacheEntry = {
        components,
        timestamp: Date.now(),
        documentVersion: version.documentVersion,
        editSessionId: version.editSessionId,
        tokenType,
        pageNames
      };

      await figma.clientStorage.setAsync(cacheKey, entry);

      if (this.debugLogging) {
        console.log(`[Cache] SAVED - ${components.length} components for ${tokenType} (version: ${version.documentVersion})`);
      }
    } catch (error) {
      if (this.debugLogging) {
        console.error('Error saving persistent cache:', error);
      }
    }
  }

  /**
   * Invalidate cache entries that include specific pages
   * Use this for incremental invalidation when specific pages change
   */
  async invalidatePagesCache(pageNames: string[]): Promise<void> {
    try {
      const keys = await figma.clientStorage.keysAsync();
      const cacheKeys = keys.filter(key => key.startsWith('componentCache_'));

      for (const cacheKey of cacheKeys) {
        try {
          const entry = await figma.clientStorage.getAsync(cacheKey) as PersistentCacheEntry | null;
          if (!entry) continue;

          // Check if this cache entry includes any of the changed pages
          const hasChangedPage = entry.pageNames.some(pageName =>
            pageNames.some(changedPage =>
              pageName.toLowerCase() === changedPage.toLowerCase()
            )
          );

          if (hasChangedPage) {
            await figma.clientStorage.deleteAsync(cacheKey);
            if (this.debugLogging) {
              console.log(`[Cache] INVALIDATED - ${cacheKey} (affected pages: ${pageNames.join(', ')})`);
            }
          }
        } catch (error) {
          // Skip individual errors
        }
      }
    } catch (error) {
      if (this.debugLogging) {
        console.error('Error invalidating page caches:', error);
      }
    }
  }

  /**
   * Get all cached page names (useful for debugging)
   */
  async getCachedPageNames(): Promise<string[]> {
    try {
      const keys = await figma.clientStorage.keysAsync();
      const cacheKeys = keys.filter(key => key.startsWith('componentCache_'));
      const allPageNames = new Set<string>();

      for (const cacheKey of cacheKeys) {
        try {
          const entry = await figma.clientStorage.getAsync(cacheKey) as PersistentCacheEntry | null;
          if (entry?.pageNames) {
            entry.pageNames.forEach(name => allPageNames.add(name));
          }
        } catch {
          // Skip errors
        }
      }

      return Array.from(allPageNames);
    } catch (error) {
      return [];
    }
  }

  /**
   * Scan all components with optimization options
   * Uses chunked processing to prevent UI freezes
   */
  async scanAllComponentsOptimized(options: ScanOptions = {}): Promise<ScanResult> {
    this.errors = [];
    const components: ComponentProperties[] = [];
    let totalInstances = 0;

    const {
      tokenType = 'all',
      maxNodesPerPage = 0,
      maxPages = 0,
      chunkSize = 100,
      onProgress,
      includeChildren = true,
      maxDepth = 3,
      useCache = true,
      usePersistentCache = true,
      pageFilter = []
    } = options;

    const pages = figma.root.children.filter(p => p.type === 'PAGE');
    const pagesToScan = pageFilter.length > 0
      ? pages.filter(p => pageFilter.includes(p.name))
      : pages;

    const totalPages = maxPages > 0 ? Math.min(maxPages, pagesToScan.length) : pagesToScan.length;
    const pageNames = pagesToScan.slice(0, totalPages).map(p => p.name);

    // Try persistent cache first (cross-session cache)
    if (usePersistentCache && useCache) {
      onProgress?.({
        currentPage: 0,
        totalPages,
        currentPageName: 'Checking cache...',
        componentsFound: 0,
        nodesScanned: 0,
        phase: 'loading'
      });

      const cachedComponents = await this.getFromPersistentCache(tokenType, pageNames);
      if (cachedComponents) {
        // Cache hit! Build index and return
        this.buildTokenIndex(cachedComponents);

        onProgress?.({
          currentPage: totalPages,
          totalPages,
          currentPageName: 'Complete (from cache)',
          componentsFound: cachedComponents.length,
          nodesScanned: 0,
          phase: 'complete'
        });

        return {
          components: cachedComponents,
          totalComponents: cachedComponents.length,
          totalInstances: 0,
          pagesScanned: totalPages,
          errors: []
        };
      }
    }

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const page = pagesToScan[pageIndex];
      
      // Report progress
      onProgress?.({
        currentPage: pageIndex + 1,
        totalPages,
        currentPageName: page.name,
        componentsFound: components.length,
        nodesScanned: 0,
        phase: 'scanning'
      });

      // Check cache first
      const cacheKey = `${page.id}-${tokenType}`;
      if (useCache) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          components.push(...cached);
          continue;
        }
      }

      // Scan this page with chunking
      const pageResult = await this.scanPageChunked(
        page,
        tokenType,
        chunkSize,
        maxNodesPerPage,
        includeChildren,
        maxDepth,
        (nodesScanned) => {
          onProgress?.({
            currentPage: pageIndex + 1,
            totalPages,
            currentPageName: page.name,
            componentsFound: components.length,
            nodesScanned,
            phase: 'scanning'
          });
        }
      );

      // Cache results
      if (useCache) {
        this.cache.set(cacheKey, {
          components: pageResult.components,
          timestamp: Date.now()
        });
      }

      components.push(...pageResult.components);
      totalInstances += pageResult.totalInstances;

      // Yield to prevent UI freeze
      await this.yieldToMain();
    }

    // Build index for fast lookups
    this.buildTokenIndex(components);

    // Save to persistent cache for next time
    if (usePersistentCache && useCache && components.length > 0) {
      await this.saveToPersistentCache(tokenType, pageNames, components);
    }

    onProgress?.({
      currentPage: totalPages,
      totalPages,
      currentPageName: 'Complete',
      componentsFound: components.length,
      nodesScanned: 0,
      phase: 'complete'
    });

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: totalPages,
      errors: this.errors
    };
  }

  /**
   * Scan a single page with chunked processing
   */
  private async scanPageChunked(
    page: PageNode,
    tokenType: string,
    chunkSize: number,
    maxNodes: number,
    includeChildren: boolean,
    maxDepth: number,
    onNodesScanned?: (count: number) => void
  ): Promise<{ components: ComponentProperties[]; totalInstances: number }> {
    const components: ComponentProperties[] = [];
    let totalInstances = 0;
    let nodesScanned = 0;

    // Use a more efficient traversal with early exit
    const componentsToProcess: SceneNode[] = [];
    
    // First pass: collect component nodes (fast)
    this.collectComponentNodes(page, componentsToProcess, maxNodes);
    
    // Process in chunks
    for (let i = 0; i < componentsToProcess.length; i += chunkSize) {
      const chunk = componentsToProcess.slice(i, i + chunkSize);
      
      for (const node of chunk) {
        try {
          const props = this.extractComponentPropertiesOptimized(
            node,
            page.name,
            tokenType,
            includeChildren,
            maxDepth,
            0
          );
          if (props) {
            components.push(props);
          }
          nodesScanned++;
          onNodesScanned?.(nodesScanned);
        } catch (error) {
          this.errors.push({
            componentId: node.id,
            componentName: node.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Yield between chunks
      if (i + chunkSize < componentsToProcess.length) {
        await this.yieldToMain();
      }
    }

    // Count instances (optional, can be expensive for large files)
    // totalInstances = page.findAll(node => node.type === 'INSTANCE').length;

    return { components, totalInstances };
  }

  /**
   * Efficiently collect component nodes without full tree traversal
   */
  private collectComponentNodes(
    parent: BaseNode & ChildrenMixin,
    result: SceneNode[],
    maxNodes: number
  ): void {
    if (maxNodes > 0 && result.length >= maxNodes) return;

    for (const child of parent.children) {
      if (maxNodes > 0 && result.length >= maxNodes) break;

      if (child.type === 'COMPONENT' || child.type === 'COMPONENT_SET') {
        result.push(child);
      }
      
      // Only recurse into container nodes, skip deep nesting
      if ('children' in child && (child.type === 'FRAME' || child.type === 'GROUP' || child.type === 'SECTION')) {
        this.collectComponentNodes(child, result, maxNodes);
      }
    }
  }

  /**
   * Extract component properties with token type filtering
   * Only extracts properties relevant to the specified token type
   */
  private extractComponentPropertiesOptimized(
    node: SceneNode,
    pageName: string,
    tokenType: string,
    includeChildren: boolean,
    maxDepth: number,
    currentDepth: number
  ): ComponentProperties | null {
    if (
      node.type !== 'COMPONENT' &&
      node.type !== 'COMPONENT_SET' &&
      node.type !== 'INSTANCE' &&
      node.type !== 'FRAME'
    ) {
      return null;
    }

    // Cast type - we've already filtered to only valid types above
    const nodeType = node.type === 'FRAME' ? 'COMPONENT' : node.type as 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE';
    
    const properties: ComponentProperties = {
      id: node.id,
      name: node.name,
      type: nodeType,
      pageName: pageName,
      colors: [],
      typography: [],
      spacing: [],
      effects: []
    };

    // Determine main component name for variants (used for grouping)
    // For COMPONENT inside COMPONENT_SET: parent's name
    // For COMPONENT_SET: its own name
    // For INSTANCE: get from mainComponent's parent
    if (node.type === 'COMPONENT_SET') {
      properties.mainComponentName = node.name;
      properties.mainComponentId = node.id;
    } else if (node.type === 'COMPONENT') {
      const component = node as ComponentNode;
      if (component.parent?.type === 'COMPONENT_SET') {
        properties.mainComponentName = component.parent.name;
        properties.mainComponentId = component.parent.id;
      } else {
        // Standalone component (not a variant)
        properties.mainComponentName = node.name;
        properties.mainComponentId = node.id;
      }
    } else if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      try {
        const mainComp = instance.mainComponent;
        if (mainComp) {
          if (mainComp.parent?.type === 'COMPONENT_SET') {
            properties.mainComponentName = mainComp.parent.name;
            properties.mainComponentId = mainComp.parent.id;
          } else {
            properties.mainComponentName = mainComp.name;
            properties.mainComponentId = mainComp.id;
          }
        }
      } catch {
        // mainComponent might not be available synchronously
        properties.mainComponentName = node.name.split(',')[0].trim();
      }
    }

    // Only extract properties relevant to the token type
    const shouldExtractColors = tokenType === 'all' || tokenType === 'color';
    const shouldExtractTypography = tokenType === 'all' || tokenType === 'typography';
    const shouldExtractSpacing = tokenType === 'all' || 
      ['dimension', 'spacing', 'borderRadius', 'borderWidth'].includes(tokenType);
    const shouldExtractEffects = tokenType === 'all' || 
      ['effect', 'shadow'].includes(tokenType);

    // Conditional extraction based on token type
    if (shouldExtractColors) {
      properties.colors = this.extractColorsOptimized(node);
    }

    if (shouldExtractTypography) {
      properties.typography = this.extractTypographyOptimized(node, includeChildren);
    }

    if (shouldExtractSpacing) {
      properties.spacing = this.extractSpacingOptimized(node, tokenType);
    }

    if (shouldExtractEffects) {
      properties.effects = this.extractEffectsOptimized(node);
    }

    // Extract basic layout properties (cheap operation)
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'FRAME') {
      const frame = node as ComponentNode | ComponentSetNode | FrameNode;
      if ('layoutMode' in frame && frame.layoutMode) {
        properties.layoutMode = frame.layoutMode;
        properties.itemSpacing = frame.itemSpacing;
      }
      properties.width = frame.width;
      properties.height = frame.height;
    }

    // Conditional child extraction with depth limit
    if (includeChildren && currentDepth < maxDepth && 'children' in node) {
      const childProperties: ComponentProperties[] = [];
      
      // Only process direct children, limit depth
      for (const child of node.children) {
        // Skip children that won't have relevant token data
        if (this.shouldSkipNode(child, tokenType)) continue;

        const childProps = this.extractComponentPropertiesOptimized(
          child,
          pageName,
          tokenType,
          includeChildren,
          maxDepth,
          currentDepth + 1
        );
        if (childProps && this.hasRelevantProperties(childProps)) {
          childProperties.push(childProps);
        }
      }
      
      if (childProperties.length > 0) {
        properties.children = childProperties;
      }
    }

    return properties;
  }

  /**
   * Determine if a node should be skipped based on token type
   */
  private shouldSkipNode(node: SceneNode, tokenType: string): boolean {
    // Skip invisible nodes
    if ('visible' in node && !node.visible) return true;
    
    // Skip nodes unlikely to have token data
    if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
      if (tokenType !== 'color') return true;
    }
    
    // Skip tiny nodes (likely decorative)
    if ('width' in node && 'height' in node) {
      if (node.width < 1 || node.height < 1) return true;
    }

    return false;
  }

  /**
   * Check if component has any relevant properties extracted
   */
  private hasRelevantProperties(props: ComponentProperties): boolean {
    return !!(
      props.colors.length > 0 ||
      props.typography.length > 0 ||
      props.spacing.length > 0 ||
      props.effects.length > 0 ||
      (props.children && props.children.length > 0)
    );
  }

  /**
   * Optimized color extraction - minimal overhead
   */
  private extractColorsOptimized(node: SceneNode): ColorProperty[] {
    const colors: ColorProperty[] = [];

    if ('fills' in node && Array.isArray(node.fills)) {
      for (let i = 0; i < node.fills.length; i++) {
        const fill = node.fills[i];
        if (fill.type === 'SOLID') {
          const opacity = fill.opacity ?? 1;
          const color = this.rgbaToColor(fill.color, opacity);
          const tokenRef = this.getFillTokenReferencesFast(node, i);
          
          colors.push({
            type: 'fill',
            color: { r: fill.color.r, g: fill.color.g, b: fill.color.b, a: opacity },
            hex: color.hex,
            rgba: color.rgba,
            opacity,
            tokenReference: tokenRef
          });
        }
      }
    }

    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (let i = 0; i < node.strokes.length; i++) {
        const stroke = node.strokes[i];
        if (stroke.type === 'SOLID') {
          const opacity = stroke.opacity ?? 1;
          const color = this.rgbaToColor(stroke.color, opacity);
          const tokenRef = this.getStrokeTokenReferencesFast(node, i);
          
          colors.push({
            type: 'stroke',
            color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b, a: opacity },
            hex: color.hex,
            rgba: color.rgba,
            opacity,
            tokenReference: tokenRef
          });
        }
      }
    }

    return colors;
  }

  /**
   * Optimized typography extraction
   */
  private extractTypographyOptimized(node: SceneNode, recurse: boolean): TypographyProperty[] {
    const typography: TypographyProperty[] = [];

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      if (typeof textNode.fontName !== 'symbol') {
        const fontName = textNode.fontName;
        const tokenRef = this.getTypographyTokenFast(textNode);

        typography.push({
          fontFamily: fontName.family,
          fontSize: typeof textNode.fontSize === 'number' ? textNode.fontSize : 16,
          fontWeight: typeof fontName.style === 'string' ? this.parseFontWeight(fontName.style) : 400,
          lineHeight: typeof textNode.lineHeight === 'number' ? textNode.lineHeight : undefined,
          letterSpacing: typeof textNode.letterSpacing === 'number' ? textNode.letterSpacing : undefined,
          tokenReference: tokenRef
        });
      }
    }

    if (recurse && 'children' in node) {
      for (const child of node.children) {
        if (child.type === 'TEXT' || ('children' in child && this.containsTextNode(child))) {
          typography.push(...this.extractTypographyOptimized(child, recurse));
        }
      }
    }

    return typography;
  }

  /**
   * Fast check if a node contains any text nodes
   */
  private containsTextNode(node: SceneNode): boolean {
    if (node.type === 'TEXT') return true;
    if ('children' in node) {
      for (const child of node.children) {
        if (child.type === 'TEXT') return true;
        // Don't recurse too deep for this check
        if ('children' in child && child.children.length > 0) {
          if (child.children.some(c => c.type === 'TEXT')) return true;
        }
      }
    }
    return false;
  }

  /**
   * Optimized spacing extraction with token type filter
   */
  private extractSpacingOptimized(node: SceneNode, tokenType: string): SpacingProperty[] {
    const spacing: SpacingProperty[] = [];
    
    const isFrameLike = node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || 
                        node.type === 'FRAME' || node.type === 'INSTANCE';

    if (!isFrameLike && !('cornerRadius' in node)) {
      return spacing;
    }

    const extractAll = tokenType === 'all' || tokenType === 'dimension' || tokenType === 'spacing';
    const extractRadius = tokenType === 'all' || tokenType === 'borderRadius';
    const extractBorderWidth = tokenType === 'all' || tokenType === 'borderWidth';

    if (isFrameLike) {
      const frame = node as ComponentNode | ComponentSetNode | FrameNode | InstanceNode;

      // Basic dimensions (cheap)
      if (extractAll) {
        spacing.push(
          { type: 'width', value: frame.width, unit: 'px', tokenReference: this.getSpacingTokenFast(node, 'width') },
          { type: 'height', value: frame.height, unit: 'px', tokenReference: this.getSpacingTokenFast(node, 'height') }
        );
      }

      // Padding (only for auto-layout frames)
      if (extractAll && 'paddingTop' in frame && typeof frame.paddingTop === 'number') {
        const horizontalToken = this.getSpacingTokenFast(node, 'horizontalPadding');
        const verticalToken = this.getSpacingTokenFast(node, 'verticalPadding');
        const paddingToken = this.getSpacingTokenFast(node, 'padding');

        if (frame.paddingTop) {
          spacing.push({
            type: 'padding',
            value: frame.paddingTop,
            unit: 'px',
            tokenReference: verticalToken || paddingToken
          });
        }
        if (frame.paddingRight) {
          spacing.push({
            type: 'padding',
            value: frame.paddingRight,
            unit: 'px',
            tokenReference: horizontalToken || paddingToken
          });
        }
        if (frame.paddingBottom) {
          spacing.push({
            type: 'padding',
            value: frame.paddingBottom,
            unit: 'px',
            tokenReference: verticalToken || paddingToken
          });
        }
        if (frame.paddingLeft) {
          spacing.push({
            type: 'padding',
            value: frame.paddingLeft,
            unit: 'px',
            tokenReference: horizontalToken || paddingToken
          });
        }
      }

      // Gap/spacing
      if (extractAll && 'itemSpacing' in frame && frame.itemSpacing) {
        spacing.push({
          type: 'gap',
          value: frame.itemSpacing,
          unit: 'px',
          tokenReference: this.getSpacingTokenFast(node, 'itemSpacing')
        });
      }
      
      // Border radius
      if (extractRadius && 'cornerRadius' in frame) {
        const radiusToken = this.getBorderRadiusTokenFast(node);
        if (typeof frame.cornerRadius === 'number' && frame.cornerRadius > 0) {
          spacing.push({
            type: 'borderRadius',
            value: frame.cornerRadius,
            unit: 'px',
            tokenReference: radiusToken
          });
        }
      }
      
      // Border width
      if (extractBorderWidth && 'strokeWeight' in frame && 
          typeof frame.strokeWeight === 'number' && frame.strokeWeight > 0) {
        spacing.push({
          type: 'borderWidth',
          value: frame.strokeWeight,
          unit: 'px',
          tokenReference: this.getBorderWidthTokenFast(node)
        });
      }
    } else if (extractRadius && 'cornerRadius' in node) {
      const rectNode = node as RectangleNode;
      const radiusToken = this.getBorderRadiusTokenFast(node);
      
      if (typeof rectNode.cornerRadius === 'number' && rectNode.cornerRadius > 0) {
        spacing.push({
          type: 'borderRadius',
          value: rectNode.cornerRadius,
          unit: 'px',
          tokenReference: radiusToken
        });
      }
    }

    return spacing;
  }

  /**
   * Optimized effects extraction
   */
  private extractEffectsOptimized(node: SceneNode): EffectProperty[] {
    const effects: EffectProperty[] = [];

    if (!('effects' in node) || !Array.isArray(node.effects)) {
      return effects;
    }

    for (let i = 0; i < node.effects.length; i++) {
      const effect = node.effects[i];
      if (!effect.visible) continue;

      const tokenRef = this.getEffectTokenFast(node, i);
      
      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        effects.push({
          type: effect.type === 'DROP_SHADOW' ? 'drop-shadow' : 'inner-shadow',
          visible: effect.visible,
          radius: effect.radius,
          color: effect.color ? { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: effect.color.a } : undefined,
          offset: { x: effect.offset?.x ?? 0, y: effect.offset?.y ?? 0 },
          spread: effect.spread,
          tokenReference: tokenRef
        });
      } else if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
        effects.push({
          type: effect.type === 'LAYER_BLUR' ? 'layer-blur' : 'background-blur',
          visible: effect.visible,
          radius: effect.radius,
          tokenReference: tokenRef
        });
      }
    }

    return effects;
  }

  // ========================================
  // FAST TOKEN REFERENCE EXTRACTION
  // Reduced namespace checks, single-pass
  // ========================================

  private getFillTokenReferencesFast(node: SceneNode, index: number): string | undefined {
    // Try most common keys first
    return this.getSharedDataFast(node, 'fill') ||
           this.getSharedDataFast(node, `fills.${index}`) ||
           this.getSharedDataFast(node, 'fillColor') ||
           this.getVariableBindingFast(node, 'fills');
  }

  private getStrokeTokenReferencesFast(node: SceneNode, index: number): string | undefined {
    return this.getSharedDataFast(node, 'stroke') ||
           this.getSharedDataFast(node, `strokes.${index}`) ||
           this.getSharedDataFast(node, 'strokeColor') ||
           this.getVariableBindingFast(node, 'strokes');
  }

  private getTypographyTokenFast(node: SceneNode): string | undefined {
    return this.getSharedDataFast(node, 'typography') ||
           this.getSharedDataFast(node, 'fontFamily') ||
           this.getSharedDataFast(node, 'fontSize');
  }

  private getSpacingTokenFast(node: SceneNode, property: string): string | undefined {
    return this.getSharedDataFast(node, property) ||
           this.getVariableBindingFast(node, property);
  }

  private getBorderRadiusTokenFast(node: SceneNode): string | undefined {
    return this.getSharedDataFast(node, 'borderRadius') ||
           this.getSharedDataFast(node, 'cornerRadius') ||
           this.getVariableBindingFast(node, 'cornerRadius');
  }

  private getBorderWidthTokenFast(node: SceneNode): string | undefined {
    return this.getSharedDataFast(node, 'borderWidth') ||
           this.getSharedDataFast(node, 'strokeWeight') ||
           this.getVariableBindingFast(node, 'strokeWeight');
  }

  private getEffectTokenFast(node: SceneNode, index: number): string | undefined {
    return this.getSharedDataFast(node, 'boxShadow') ||
           this.getSharedDataFast(node, `effects.${index}`) ||
           this.getVariableBindingFast(node, 'effects');
  }

  /**
   * Fast shared plugin data lookup - only check 'tokens' namespace
   */
  private getSharedDataFast(node: SceneNode, key: string): string | undefined {
    try {
      const value = node.getSharedPluginData('tokens', key);
      if (value && value.trim()) {
        return this.cleanTokenReference(value);
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Fast variable binding lookup
   */
  private getVariableBindingFast(node: SceneNode, property: string): string | undefined {
    try {
      if (!('boundVariables' in node) || !node.boundVariables) return undefined;
      
      const boundVars = node.boundVariables as Record<string, any>;
      const binding = boundVars[property];
      
      if (binding) {
        const bindingToCheck = Array.isArray(binding) ? binding[0] : binding;
        if (bindingToCheck?.id) {
          const variable = figma.variables.getVariableById(bindingToCheck.id);
          return variable?.name;
        }
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Clean token reference value
   */
  private cleanTokenReference(value: string): string {
    let cleaned = value.trim();
    while (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    cleaned = cleaned.replace(/^[{]|[}]$/g, '');
    cleaned = cleaned.replace(/^\$/, '');
    return cleaned.trim();
  }

  // ========================================
  // TOKEN INDEX FOR FAST LOOKUPS
  // ========================================

  /**
   * Build an index of token references for fast lookups
   */
  private buildTokenIndex(components: ComponentProperties[]): void {
    this.tokenIndex = { byPath: new Map(), byValue: new Map() };

    const indexComponent = (comp: ComponentProperties) => {
      // Index colors
      for (const color of comp.colors) {
        if (color.tokenReference) {
          this.addToIndex(this.tokenIndex.byPath, color.tokenReference.toLowerCase(), comp.id);
        }
        if (color.hex) {
          this.addToIndex(this.tokenIndex.byValue, color.hex.toLowerCase(), comp.id);
        }
      }

      // Index spacing
      for (const spacing of comp.spacing) {
        if (spacing.tokenReference) {
          // Clean up context prefix for indexing
          const cleanRef = spacing.tokenReference.replace(/^\[\w+\]\s*/, '').toLowerCase();
          this.addToIndex(this.tokenIndex.byPath, cleanRef, comp.id);
        }
        this.addToIndex(this.tokenIndex.byValue, `${spacing.value}${spacing.unit}`, comp.id);
      }

      // Index effects
      for (const effect of comp.effects) {
        if (effect.tokenReference) {
          this.addToIndex(this.tokenIndex.byPath, effect.tokenReference.toLowerCase(), comp.id);
        }
      }

      // Index typography
      for (const typo of comp.typography) {
        if (typo.tokenReference) {
          this.addToIndex(this.tokenIndex.byPath, typo.tokenReference.toLowerCase(), comp.id);
        }
      }

      // Recurse into children
      if (comp.children) {
        for (const child of comp.children) {
          indexComponent(child);
        }
      }
    };

    for (const comp of components) {
      indexComponent(comp);
    }
  }

  private addToIndex(index: Map<string, Set<string>>, key: string, componentId: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(componentId);
  }

  /**
   * Fast lookup by token path using index
   */
  getComponentsByTokenPath(tokenPath: string): string[] {
    const key = tokenPath.toLowerCase();
    const exact = this.tokenIndex.byPath.get(key);
    if (exact) return Array.from(exact);

    // Partial match fallback
    const matches: Set<string> = new Set();
    const entries = Array.from(this.tokenIndex.byPath.entries());
    for (const [path, componentIds] of entries) {
      if (path.includes(key) || key.includes(path)) {
        componentIds.forEach((id: string) => matches.add(id));
      }
    }
    return Array.from(matches);
  }

  /**
   * Fast lookup by token value using index
   */
  getComponentsByTokenValue(value: string): string[] {
    const key = value.toLowerCase();
    return Array.from(this.tokenIndex.byValue.get(key) || []);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Yield to main thread to prevent UI freeze
   */
  private yieldToMain(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Get from cache if valid
   */
  private getFromCache(key: string): ComponentProperties[] | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheMaxAge) {
      return entry.components;
    }
    return null;
  }

  /**
   * Convert RGBA color to hex and rgba string
   */
  rgbaToColor(color: RGB, opacity: number): { hex: string; rgba: string } {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    const hex = `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
    const rgba = `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`;

    return { hex, rgba };
  }

  /**
   * Parse font weight from style name
   */
  parseFontWeight(style: string): number {
    const weightMap: Record<string, number> = {
      thin: 100, extralight: 200, light: 300, regular: 400,
      medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900
    };

    const lowerStyle = style.toLowerCase();
    for (const [key, value] of Object.entries(weightMap)) {
      if (lowerStyle.includes(key)) return value;
    }

    const match = style.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 400;
  }

  // ========================================
  // ORIGINAL API COMPATIBILITY
  // ========================================

  /**
   * Scan all components (original API, uses optimized implementation)
   */
  scanAllComponents(): ScanResult {
    // Synchronous wrapper for compatibility
    // For best performance, use scanAllComponentsOptimized() directly
    this.errors = [];
    const components: ComponentProperties[] = [];
    let totalInstances = 0;
    const pages = figma.root.children;

    for (const page of pages) {
      if (page.type === 'PAGE') {
        const pageComponents = page.findAll(
          node => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
        );

        for (const component of pageComponents) {
          try {
            const props = this.extractComponentPropertiesOptimized(
              component, page.name, 'all', true, 3, 0
            );
            if (props) components.push(props);
          } catch (error) {
            this.errors.push({
              componentId: component.id,
              componentName: component.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: pages.length,
      errors: this.errors
    };
  }

  /**
   * Scan components on specific pages only (by page name)
   * This is much faster than scanning all pages when you know which pages to scan
   */
  scanFilteredPages(pageNames: string[]): ScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    let totalInstances = 0;
    const pages = figma.root.children;
    
    // Normalize page names for case-insensitive matching
    const normalizedPageNames = pageNames.map(n => n.toLowerCase().trim());
    
    // Filter to matching pages
    const matchingPages = pages.filter(page => 
      page.type === 'PAGE' && 
      normalizedPageNames.includes(page.name.toLowerCase().trim())
    );

    for (const page of matchingPages) {
      if (page.type === 'PAGE') {
        const pageComponents = page.findAll(
          node => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
        );

        for (const component of pageComponents) {
          try {
            const props = this.extractComponentPropertiesOptimized(
              component, page.name, 'all', true, 3, 0
            );
            if (props) components.push(props);
          } catch (error) {
            this.errors.push({
              componentId: component.id,
              componentName: component.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: matchingPages.length,
      errors: this.errors
    };
  }

  /**
   * Scan current page only
   */
  scanCurrentPage(): ScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    const currentPage = figma.currentPage;

    const pageComponents = currentPage.findAll(
      node => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
    );

    for (const component of pageComponents) {
      try {
        const props = this.extractComponentPropertiesOptimized(
          component, currentPage.name, 'all', true, 3, 0
        );
        if (props) components.push(props);
      } catch (error) {
        this.errors.push({
          componentId: component.id,
          componentName: component.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances: 0,
      pagesScanned: 1,
      errors: this.errors
    };
  }

  /**
   * Scan selected nodes
   */
  scanNodes(nodes: readonly SceneNode[]): ScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    const currentPage = figma.currentPage;

    for (const node of nodes) {
      if ('findAll' in node && typeof node.findAll === 'function') {
        const nodeComponents = node.findAll(
          (n: SceneNode) => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'
        ) as SceneNode[];

        for (const component of nodeComponents) {
          try {
            const props = this.extractComponentPropertiesOptimized(
              component, currentPage.name, 'all', true, 3, 0
            );
            if (props) components.push(props);
          } catch (error) {
            this.errors.push({
              componentId: component.id,
              componentName: component.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        try {
          const props = this.extractComponentPropertiesOptimized(
            node, currentPage.name, 'all', true, 3, 0
          );
          if (props && !components.find(c => c.id === props.id)) {
            components.push(props);
          }
        } catch (error) {
          this.errors.push({
            componentId: node.id,
            componentName: node.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances: 0,
      pagesScanned: 1,
      errors: this.errors
    };
  }

  /**
   * Get component usage stats
   */
  getComponentUsageStats(componentId: string): ComponentUsageStats {
    const pages = new Set<string>();
    let instanceCount = 0;

    for (const page of figma.root.children) {
      if (page.type === 'PAGE') {
        const pageInstances = page.findAll(
          node => node.type === 'INSTANCE' && node.mainComponent?.id === componentId
        );
        if (pageInstances.length > 0) {
          instanceCount += pageInstances.length;
          pages.add(page.name);
        }
      }
    }

    return { instances: instanceCount, pages: Array.from(pages) };
  }
}

