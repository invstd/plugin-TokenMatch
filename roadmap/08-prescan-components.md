# Feature: Pre-scan Components

## Overview

Allow users to pre-scan all pages for components from the settings page, creating a cached index that makes subsequent token matching significantly faster. The main UI displays scan status and offers an option to re-scan before matching.

## User Story

As a designer working with large Figma files, I want to pre-scan all components ahead of time so that token matching is nearly instantaneous when I'm ready to search, rather than waiting for a full scan each time.

## Feature Specifications

### Core Functionality

1. **Pre-scan from Settings**
   - "Scan All Pages" button in the settings panel
   - Progress indicator showing pages/components being scanned
   - Background scanning that doesn't block the UI
   - Cancel option for long-running scans

2. **Scan Cache Management**
   - Store scanned component data in plugin storage
   - Track scan timestamp per page
   - Invalidate cache when file structure changes (if detectable)
   - Manual cache clear option

3. **Main UI Integration**
   - Display "Last scanned: [timestamp]" below the Match button when cache exists
   - Checkbox: "Re-scan components before matching" (unchecked by default)
   - Visual indicator when cache is stale or potentially outdated

4. **Smart Caching**
   - Detect if pages have been modified since last scan (via page hash or component count)
   - Option to scan only modified pages
   - Incremental scan support for large files

### User Interface

#### Settings Page - Pre-scan Section

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Token Repository                                       │
│  ├─ [GitHub configuration...]                           │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Component Pre-scanning                                 │
│                                                         │
│  Pre-scan components across all pages to speed up       │
│  token matching. Recommended for large files.           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  📊 Scan Status                                 │    │
│  │                                                 │    │
│  │  Pages scanned: 12/12                           │    │
│  │  Components found: 847                          │    │
│  │  Last scan: Jan 21, 2026 at 2:34 PM             │    │
│  │                                                 │    │
│  │  Cache size: 2.4 MB                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [ Scan All Pages ]          [ Clear Cache ]            │
│                                                         │
│  ☐ Auto-scan when file opens                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Settings Page - During Scan

```
┌─────────────────────────────────────────────────────────┐
│  Component Pre-scanning                                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  🔄 Scanning...                                 │    │
│  │                                                 │    │
│  │  Page: Components / Buttons                     │    │
│  │  Progress: 5/12 pages                           │    │
│  │                                                 │    │
│  │  ████████████░░░░░░░░░░░░  42%                  │    │
│  │                                                 │    │
│  │  Components found so far: 312                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [ Cancel Scan ]                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Main UI - Match Button Area (with cache)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Token: ids.color.primary.500                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              [ Find Matches ]                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Last scanned: Jan 21, 2026 at 2:34 PM                  │
│  ☐ Re-scan components before matching                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Main UI - Match Button Area (cache stale)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Token: ids.color.primary.500                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              [ Find Matches ]                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ⚠️ Last scanned: Jan 15, 2026 (6 days ago)             │
│  File may have changed since last scan.                 │
│  ☑ Re-scan components before matching                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Main UI - No Cache

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Token: ids.color.primary.500                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              [ Find Matches ]                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  💡 Tip: Pre-scan components in Settings for            │
│     faster matching.                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/scan.ts`)

```typescript
interface ScanCache {
  fileId: string;                    // Figma file identifier
  fileVersion?: string;              // File version if available
  scannedAt: Date;
  pages: PageScanData[];
  totalComponents: number;
  cacheVersion: number;              // For cache invalidation on plugin updates
}

interface PageScanData {
  pageId: string;
  pageName: string;
  scannedAt: Date;
  componentCount: number;
  components: CachedComponent[];
  hash?: string;                     // Hash of page structure for change detection
}

interface CachedComponent {
  id: string;
  name: string;
  pageName: string;
  properties: ComponentProperties;   // Existing type from component scanning
}

interface ScanProgress {
  status: 'idle' | 'scanning' | 'completed' | 'cancelled' | 'error';
  currentPage?: string;
  pagesScanned: number;
  totalPages: number;
  componentsFound: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

interface ScanOptions {
  pages?: string[];                  // Specific page IDs, or all if empty
  forceRescan?: boolean;             // Ignore existing cache
  includeHidden?: boolean;           // Include hidden pages
  onProgress?: (progress: ScanProgress) => void;
}

interface CacheStatus {
  exists: boolean;
  scannedAt?: Date;
  isStale: boolean;                  // True if older than threshold or file changed
  staleReason?: 'age' | 'file_modified' | 'version_mismatch';
  pageCount?: number;
  componentCount?: number;
  cacheSize?: number;                // Bytes
}
```

### Service Layer

#### New Service: `scan-cache-service.ts`

```typescript
// services/scan-cache-service.ts

const CACHE_KEY = 'tokensmatch_component_cache';
const CACHE_VERSION = 1;
const STALE_THRESHOLD_DAYS = 7;

export class ScanCacheService {
  /**
   * Perform a full scan of all pages and cache results
   */
  async scanAllPages(
    options: ScanOptions = {}
  ): Promise<ScanCache> {
    const pages = await this.getPages(options.includeHidden);
    const cache: ScanCache = {
      fileId: figma.fileKey || 'unknown',
      scannedAt: new Date(),
      pages: [],
      totalComponents: 0,
      cacheVersion: CACHE_VERSION
    };

    for (let i = 0; i < pages.length; i++) {
      if (this.scanCancelled) {
        throw new ScanCancelledError();
      }

      const page = pages[i];
      options.onProgress?.({
        status: 'scanning',
        currentPage: page.name,
        pagesScanned: i,
        totalPages: pages.length,
        componentsFound: cache.totalComponents
      });

      const pageData = await this.scanPage(page, options.forceRescan);
      cache.pages.push(pageData);
      cache.totalComponents += pageData.componentCount;
    }

    await this.saveCache(cache);

    options.onProgress?.({
      status: 'completed',
      pagesScanned: pages.length,
      totalPages: pages.length,
      componentsFound: cache.totalComponents,
      completedAt: new Date()
    });

    return cache;
  }

  /**
   * Scan a single page for components
   */
  async scanPage(
    page: PageNode,
    forceRescan: boolean = false
  ): Promise<PageScanData> {
    const existingCache = await this.getPageCache(page.id);
    const currentHash = this.calculatePageHash(page);

    // Use cached data if valid and not forcing rescan
    if (!forceRescan && existingCache && existingCache.hash === currentHash) {
      return existingCache;
    }

    // Perform fresh scan
    const components = await this.extractComponents(page);

    return {
      pageId: page.id,
      pageName: page.name,
      scannedAt: new Date(),
      componentCount: components.length,
      components,
      hash: currentHash
    };
  }

  /**
   * Get cached components for matching (main entry point)
   */
  async getCachedComponents(): Promise<CachedComponent[] | null> {
    const cache = await this.loadCache();
    if (!cache) return null;

    return cache.pages.flatMap(page => page.components);
  }

  /**
   * Check cache status
   */
  async getCacheStatus(): Promise<CacheStatus> {
    const cache = await this.loadCache();

    if (!cache) {
      return { exists: false, isStale: true };
    }

    const ageInDays = this.getDaysSince(cache.scannedAt);
    const isStaleByAge = ageInDays > STALE_THRESHOLD_DAYS;
    const isVersionMismatch = cache.cacheVersion !== CACHE_VERSION;

    return {
      exists: true,
      scannedAt: cache.scannedAt,
      isStale: isStaleByAge || isVersionMismatch,
      staleReason: isVersionMismatch ? 'version_mismatch' :
                   isStaleByAge ? 'age' : undefined,
      pageCount: cache.pages.length,
      componentCount: cache.totalComponents,
      cacheSize: this.estimateCacheSize(cache)
    };
  }

  /**
   * Clear the cache
   */
  async clearCache(): Promise<void> {
    await figma.clientStorage.deleteAsync(CACHE_KEY);
  }

  /**
   * Cancel ongoing scan
   */
  cancelScan(): void {
    this.scanCancelled = true;
  }

  // Private methods

  private scanCancelled = false;

  private async loadCache(): Promise<ScanCache | null> {
    try {
      const data = await figma.clientStorage.getAsync(CACHE_KEY);
      if (!data) return null;

      const cache = JSON.parse(data) as ScanCache;

      // Validate cache version
      if (cache.cacheVersion !== CACHE_VERSION) {
        return null;
      }

      // Convert date strings back to Date objects
      cache.scannedAt = new Date(cache.scannedAt);
      cache.pages.forEach(page => {
        page.scannedAt = new Date(page.scannedAt);
      });

      return cache;
    } catch {
      return null;
    }
  }

  private async saveCache(cache: ScanCache): Promise<void> {
    const data = JSON.stringify(cache);
    await figma.clientStorage.setAsync(CACHE_KEY, data);
  }

  private async getPageCache(pageId: string): Promise<PageScanData | null> {
    const cache = await this.loadCache();
    return cache?.pages.find(p => p.pageId === pageId) || null;
  }

  private async getPages(includeHidden: boolean = false): Promise<PageNode[]> {
    return figma.root.children.filter(page =>
      includeHidden || page.visible !== false
    );
  }

  private calculatePageHash(page: PageNode): string {
    // Simple hash based on component count and names
    const components = page.findAll(node =>
      node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
    );

    const hashInput = components
      .map(c => `${c.id}:${c.name}`)
      .sort()
      .join('|');

    return this.simpleHash(hashInput);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private async extractComponents(page: PageNode): Promise<CachedComponent[]> {
    // Use existing component extraction logic
    const componentNodes = page.findAll(node =>
      node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
    );

    return componentNodes.map(node => ({
      id: node.id,
      name: node.name,
      pageName: page.name,
      properties: this.extractComponentProperties(node)
    }));
  }

  private extractComponentProperties(node: SceneNode): ComponentProperties {
    // Delegate to existing property extraction logic
    // This would call the existing scanner service
    return extractProperties(node);
  }

  private getDaysSince(date: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private estimateCacheSize(cache: ScanCache): number {
    return JSON.stringify(cache).length;
  }
}

class ScanCancelledError extends Error {
  constructor() {
    super('Scan was cancelled');
    this.name = 'ScanCancelledError';
  }
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
// Add to message handlers in main.ts

case 'start-prescan':
  const scanService = new ScanCacheService();
  scanService.scanAllPages({
    forceRescan: msg.forceRescan,
    includeHidden: msg.includeHidden,
    onProgress: (progress) => {
      emit('prescan-progress', progress);
    }
  }).then(cache => {
    emit('prescan-complete', {
      success: true,
      pageCount: cache.pages.length,
      componentCount: cache.totalComponents,
      scannedAt: cache.scannedAt
    });
  }).catch(error => {
    if (error.name === 'ScanCancelledError') {
      emit('prescan-cancelled', {});
    } else {
      emit('prescan-error', { error: error.message });
    }
  });
  break;

case 'cancel-prescan':
  scanCacheService.cancelScan();
  break;

case 'get-cache-status':
  const status = await scanCacheService.getCacheStatus();
  emit('cache-status', status);
  break;

case 'clear-cache':
  await scanCacheService.clearCache();
  emit('cache-cleared', {});
  break;

case 'find-matches':
  // Modified to use cache when available
  const useCache = !msg.forceRescan;
  let components: CachedComponent[] | null = null;

  if (useCache) {
    components = await scanCacheService.getCachedComponents();
  }

  if (!components) {
    // Fall back to live scan
    components = await performLiveScan();
  }

  const matches = findTokenMatches(msg.tokenPath, components);
  emit('match-results', matches);
  break;
```

### UI Modifications

#### Settings Page State

```typescript
// Add to settings state
const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
const [autoScanOnOpen, setAutoScanOnOpen] = useState(false);

// Load cache status on mount
useEffect(() => {
  emit('get-cache-status');
}, []);

// Listen for cache status updates
useEffect(() => {
  const handlers = {
    'cache-status': (status: CacheStatus) => setCacheStatus(status),
    'prescan-progress': (progress: ScanProgress) => setScanProgress(progress),
    'prescan-complete': (result) => {
      setScanProgress(null);
      emit('get-cache-status');
    },
    'prescan-cancelled': () => setScanProgress(null),
    'prescan-error': (error) => {
      setScanProgress(null);
      showError(error.error);
    },
    'cache-cleared': () => setCacheStatus({ exists: false, isStale: true })
  };

  // Register handlers...
}, []);
```

#### Settings Page Component

```typescript
const PrescanSettings = () => {
  const isScanning = scanProgress?.status === 'scanning';

  const handleStartScan = () => {
    emit('start-prescan', { forceRescan: true });
  };

  const handleCancelScan = () => {
    emit('cancel-prescan');
  };

  const handleClearCache = () => {
    emit('clear-cache');
  };

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="font-semibold mb-2">Component Pre-scanning</h3>
      <p className="text-sm text-gray-600 mb-4">
        Pre-scan components across all pages to speed up token matching.
        Recommended for large files.
      </p>

      {/* Scan Status Box */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        {isScanning ? (
          // Scanning state
          <>
            <div className="flex items-center gap-2 mb-2">
              <Spinner className="h-4 w-4" />
              <span className="font-medium">Scanning...</span>
            </div>
            <p className="text-sm text-gray-600">
              Page: {scanProgress.currentPage}
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Progress: {scanProgress.pagesScanned}/{scanProgress.totalPages} pages
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{
                  width: `${(scanProgress.pagesScanned / scanProgress.totalPages) * 100}%`
                }}
              />
            </div>
            <p className="text-sm text-gray-500">
              Components found so far: {scanProgress.componentsFound}
            </p>
          </>
        ) : cacheStatus?.exists ? (
          // Cache exists
          <>
            <div className="flex items-center gap-2 mb-2">
              <CheckIcon className="h-4 w-4 text-green-500" />
              <span className="font-medium">Scan Status</span>
            </div>
            <p className="text-sm text-gray-600">
              Pages scanned: {cacheStatus.pageCount}
            </p>
            <p className="text-sm text-gray-600">
              Components found: {cacheStatus.componentCount}
            </p>
            <p className="text-sm text-gray-600">
              Last scan: {formatDate(cacheStatus.scannedAt)}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Cache size: {formatBytes(cacheStatus.cacheSize)}
            </p>
          </>
        ) : (
          // No cache
          <>
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon className="h-4 w-4 text-gray-400" />
              <span className="font-medium">No scan data</span>
            </div>
            <p className="text-sm text-gray-600">
              Components have not been pre-scanned yet.
            </p>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isScanning ? (
          <button
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            onClick={handleCancelScan}
          >
            Cancel Scan
          </button>
        ) : (
          <>
            <button
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              onClick={handleStartScan}
            >
              Scan All Pages
            </button>
            {cacheStatus?.exists && (
              <button
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                onClick={handleClearCache}
              >
                Clear Cache
              </button>
            )}
          </>
        )}
      </div>

      {/* Auto-scan option */}
      <label className="flex items-center gap-2 mt-4 text-sm">
        <input
          type="checkbox"
          checked={autoScanOnOpen}
          onChange={(e) => setAutoScanOnOpen(e.target.checked)}
          className="rounded"
        />
        Auto-scan when file opens
      </label>
    </div>
  );
};
```

#### Main UI State

```typescript
// Add to main UI state
const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
const [rescanBeforeMatch, setRescanBeforeMatch] = useState(false);

// Load cache status
useEffect(() => {
  emit('get-cache-status');
}, []);

// Auto-check rescan if cache is stale
useEffect(() => {
  if (cacheStatus?.isStale) {
    setRescanBeforeMatch(true);
  }
}, [cacheStatus]);
```

#### Main UI Match Button Area

```typescript
const MatchButtonArea = () => {
  const handleMatch = () => {
    emit('find-matches', {
      tokenPath: selectedToken,
      forceRescan: rescanBeforeMatch
    });
  };

  return (
    <div className="space-y-3">
      <button
        className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium
                   hover:bg-blue-600 disabled:opacity-50"
        onClick={handleMatch}
        disabled={!selectedToken}
      >
        Find Matches
      </button>

      {/* Cache status and rescan option */}
      {cacheStatus?.exists ? (
        <div className="text-sm">
          <p className={`flex items-center gap-1 ${
            cacheStatus.isStale ? 'text-amber-600' : 'text-gray-500'
          }`}>
            {cacheStatus.isStale && <WarningIcon className="h-4 w-4" />}
            Last scanned: {formatRelativeDate(cacheStatus.scannedAt)}
            {cacheStatus.isStale && cacheStatus.staleReason === 'age' && (
              <span className="text-gray-400 ml-1">
                ({formatDaysAgo(cacheStatus.scannedAt)})
              </span>
            )}
          </p>
          {cacheStatus.isStale && (
            <p className="text-xs text-gray-400 mt-0.5">
              File may have changed since last scan.
            </p>
          )}
          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={rescanBeforeMatch}
              onChange={(e) => setRescanBeforeMatch(e.target.checked)}
              className="rounded"
            />
            Re-scan components before matching
          </label>
        </div>
      ) : (
        <div className="text-sm text-gray-500 flex items-start gap-2">
          <LightbulbIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Tip: Pre-scan components in Settings for faster matching.
          </span>
        </div>
      )}
    </div>
  );
};
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/scan-cache-service.ts` | Component caching and pre-scan logic |
| `types/scan.ts` | Type definitions for scan cache |
| `components/PrescanSettings.tsx` | Settings page pre-scan UI |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add prescan message handlers, integrate cache into matching |
| `src/ui.tsx` | Add cache status display, rescan checkbox |
| `src/settings.tsx` | Add pre-scan section |

---

## UI/UX Considerations

### Visual Design

1. **Progress Feedback**: Clear progress bar and status text during scan
2. **Stale Indicators**: Warning color (amber) for outdated cache
3. **Helpful Tips**: Guide users to pre-scan in settings
4. **Subtle Status**: "Last scanned" text should be informative but not distracting

### Interaction Flow

1. **First-time user**: Sees tip about pre-scanning, matching works normally (live scan)
2. **User pre-scans**: Goes to Settings, clicks "Scan All Pages", waits for completion
3. **Subsequent matching**: Cache is used automatically, much faster results
4. **Cache gets stale**: User sees warning, "Re-scan" checkbox is auto-checked
5. **User wants fresh data**: Checks "Re-scan components before matching" manually

### Edge Cases

1. **Scan interrupted**: Plugin closed during scan - partial cache discarded
2. **File opened in another instance**: Cache may be from different session
3. **Very large files**: Consider scan time limits, chunking, or page selection
4. **Cache storage limits**: Handle storage quota exceeded gracefully
5. **Plugin updates**: Cache version mismatch triggers fresh scan prompt

---

## Testing Strategy

### Unit Tests

1. Cache serialization/deserialization
2. Page hash calculation consistency
3. Stale detection logic
4. Cache version validation

### Integration Tests

1. Full prescan workflow
2. Cache usage during matching
3. Cancel scan functionality
4. Cache clear and reload

### Manual Testing

1. Test with files of varying sizes (10, 100, 1000+ components)
2. Verify scan progress updates smoothly
3. Test cache persistence across plugin restarts
4. Verify stale detection after file modifications

---

## Performance Considerations

1. **Background Scanning**: Use async iteration to avoid blocking UI
2. **Incremental Scans**: Only scan modified pages when possible
3. **Storage Optimization**: Compress cache data if needed
4. **Memory Management**: Process large files in chunks
5. **Debounce Updates**: Don't flood UI with progress updates

---

## Future Enhancements

1. **Selective Page Scan**: Let users choose specific pages to scan
2. **Auto-refresh**: Detect file changes and prompt for rescan
3. **Scan Scheduling**: Auto-scan on file open or at intervals
4. **Cloud Sync**: Sync cache across devices (would require backend)
5. **Scan Profiles**: Different scan configurations for different workflows
