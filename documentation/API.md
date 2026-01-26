# API Documentation

## Core Services API

### FigmaComponentServiceOptimized

Main service for scanning Figma components and extracting properties.

#### Methods

##### `scanComponents(options: ScanOptions): Promise<ScanResult>`

Scans Figma components based on provided options.

**Parameters:**
```typescript
interface ScanOptions {
  tokenType?: 'color' | 'typography' | 'dimension' | 'spacing' | 'effect' | 'all';
  maxNodesPerPage?: number;        // Default: 0 (unlimited)
  maxPages?: number;               // Default: 0 (unlimited)
  chunkSize?: number;              // Default: 50
  onProgress?: (progress: ScanProgress) => void;
  includeChildren?: boolean;       // Default: true
  maxDepth?: number;               // Default: unlimited
  useCache?: boolean;              // Default: true
  usePersistentCache?: boolean;    // Default: true
  pageFilter?: string[];           // Default: [] (all pages)
}
```

**Returns:**
```typescript
interface ScanResult {
  components: ComponentProperties[];
  totalComponents: number;
  scannedPages: string[];
  duration: number;
  cacheHit: boolean;
}
```

**Example:**
```typescript
const service = new FigmaComponentServiceOptimized();
const result = await service.scanComponents({
  tokenType: 'color',
  pageFilter: ['Components', 'Patterns'],
  onProgress: (progress) => {
    console.log(`Progress: ${progress.percentage}%`);
  }
});
```

---

##### `clearCache(): Promise<void>`

Clears both memory and persistent cache.

**Example:**
```typescript
await service.clearCache();
```

---

##### `invalidatePagesCache(pageNames: string[]): Promise<void>`

Invalidates cache for specific pages.

**Parameters:**
- `pageNames`: Array of page names to invalidate

**Example:**
```typescript
await service.invalidatePagesCache(['Components']);
```

---

##### `setDebugLogging(enabled: boolean): void`

Enable or disable debug logging.

**Example:**
```typescript
service.setDebugLogging(true);
```

---

### GitHubTokenService

Service for fetching tokens from GitHub repositories.

#### Constructor

```typescript
constructor(config: GitHubConfig)

interface GitHubConfig {
  repoUrl: string;        // e.g., "https://github.com/owner/repo"
  token: string;          // GitHub Personal Access Token
  directoryPath?: string; // Optional subdirectory path
}
```

#### Methods

##### `testConnection(): Promise<ConnectionResult>`

Tests GitHub connection and fetches repository information.

**Returns:**
```typescript
interface ConnectionResult {
  success: boolean;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  error?: string;
}
```

**Example:**
```typescript
const service = new GitHubTokenService({
  repoUrl: 'https://github.com/company/design-tokens',
  token: 'ghp_xxxxxxxxxxxx',
  directoryPath: 'tokens'
});

const result = await service.testConnection();
if (result.success) {
  console.log(`Connected to ${result.repoOwner}/${result.repoName}`);
}
```

---

##### `getBranches(): Promise<string[]>`

Fetches all branches from the repository.

**Returns:** Array of branch names

**Example:**
```typescript
const branches = await service.getBranches();
console.log('Available branches:', branches);
```

---

##### `fetchTokens(branch: string): Promise<ParsedToken[]>`

Fetches and parses all token files from the specified branch.

**Parameters:**
- `branch`: Branch name to fetch from

**Returns:**
```typescript
interface ParsedToken {
  path: string[];          // Token path (e.g., ['color', 'primary', 'blue'])
  value: string;          // Token value
  type: TokenType;        // Token type
  name: string;           // Full token name
  description?: string;   // Optional description
}
```

**Example:**
```typescript
const tokens = await service.fetchTokens('main');
console.log(`Loaded ${tokens.length} tokens`);
```

---

### TokenMatchingService

Service for matching tokens against components.

#### Methods

##### `matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult`

Matches a single token against scanned components.

**Parameters:**
- `token`: The token to match
- `scanResult`: Result from component scan

**Returns:**
```typescript
interface MatchingResult {
  token: ParsedToken;
  matchingComponents: ComponentMatch[];
  totalMatches: number;
  totalComponentsScanned: number;
}

interface ComponentMatch {
  component: ComponentProperties;
  matches: MatchDetail[];
  confidence: number; // Average confidence (0.7-1.0)
}

interface MatchDetail {
  property: string;              // e.g., "fill color"
  propertyType: 'color' | 'typography' | 'spacing' | 'effect';
  matchedValue: string;          // Component value
  tokenValue: string;            // Token value
  confidence: number;            // 0.7-1.0
  nestedMainComponentId?: string;
}
```

**Confidence Levels:**
- `1.0`: Exact token reference match
- `0.95`: Semantic token match (via reference chain)
- `0.9`: Partial path match
- `0.7`: Value-based match (fallback)

**Example:**
```typescript
const matchingService = new TokenMatchingService();
const result = matchingService.matchTokenToComponents(token, scanResult);

console.log(`Found ${result.totalMatches} matching components`);
result.matchingComponents.forEach(match => {
  console.log(`${match.component.name} - Confidence: ${match.confidence}`);
});
```

---

### TokenParser

Service for parsing token files.

#### Methods

##### `parseTokenFile(content: string, filename: string): ParsedToken[]`

Parses a token file content into normalized tokens.

**Parameters:**
- `content`: File content (JSON, JS, or TS)
- `filename`: File name (used for format detection)

**Returns:** Array of `ParsedToken`

**Supported Formats:**

**Tokens Studio:**
```json
{
  "core": {
    "color": {
      "blue": {
        "500": {
          "value": "#3B82F6",
          "type": "color"
        }
      }
    }
  }
}
```

**Flat:**
```json
{
  "color-primary": "#3B82F6",
  "spacing-md": "16px"
}
```

**Example:**
```typescript
const parser = new TokenParser();
const tokens = parser.parseTokenFile(fileContent, 'tokens.json');
```

---

## Types Reference

### ComponentProperties

```typescript
interface ComponentProperties {
  id: string;
  name: string;
  type: NodeType;
  mainComponentId: string | null;
  variantName: string | null;
  colors: ColorProperty[];
  typography: TypographyProperty[];
  spacing: SpacingProperty[];
  effects: EffectProperty[];
  children?: ComponentProperties[];
}
```

### ColorProperty

```typescript
interface ColorProperty {
  type: 'fill' | 'stroke';
  color: RGBAColor;
  hex: string;
  rgba: string;
  opacity: number;
  tokenReference?: string;
}
```

### TypographyProperty

```typescript
interface TypographyProperty {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  letterSpacing?: number;
  tokenReference?: string;
}
```

### SpacingProperty

```typescript
interface SpacingProperty {
  type: 'padding' | 'gap' | 'width' | 'height' | 'margin';
  value: number;
  unit: 'px' | 'rem' | 'em';
  tokenReference?: string;
}
```

### EffectProperty

```typescript
interface EffectProperty {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'BLUR';
  color?: RGBAColor;
  offset?: { x: number; y: number };
  radius: number;
  spread?: number;
  tokenReference?: string;
}
```

---

## Plugin Messaging API

Communication between UI and plugin sandbox.

### UI → Plugin

#### Match Token

```typescript
emit('match-token', {
  token: ParsedToken,
  scanMode: 'all' | 'current' | 'selection',
  selectedPages: string[]
});
```

#### Test GitHub Connection

```typescript
emit('test-connection', {
  repoUrl: string,
  token: string,
  directoryPath?: string
});
```

#### Fetch Branches

```typescript
emit('fetch-branches', {
  repoUrl: string,
  token: string
});
```

#### Fetch Tokens

```typescript
emit('fetch-tokens', {
  repoUrl: string,
  token: string,
  branch: string,
  directoryPath?: string
});
```

### Plugin → UI

#### Match Result

```typescript
emit('match-result', {
  success: boolean,
  token: ParsedToken,
  matches: GroupedMatch[],
  totalMatches: number,
  scanDuration: number,
  error?: string
});
```

#### Connection Result

```typescript
emit('connection-result', {
  success: boolean,
  repoOwner?: string,
  repoName?: string,
  defaultBranch?: string,
  error?: string
});
```

#### Branches Result

```typescript
emit('branches-result', {
  success: boolean,
  branches?: string[],
  error?: string
});
```

#### Tokens Result

```typescript
emit('tokens-result', {
  success: boolean,
  tokens?: ParsedToken[],
  tokenCount?: number,
  error?: string
});
```

---

## Storage API

### Client Storage Keys

Used with `figma.clientStorage`:

```typescript
// GitHub configuration
'github_repo_url'      // string
'github_token'         // string
'github_directory'     // string
'github_branch'        // string

// UI state
'last_selected_token'  // string (token name)
'scan_mode'           // 'all' | 'current' | 'selection'

// Component cache
'component_cache_v1'   // Record<string, CachedScanResult>
'cache_document_hash'  // string
```

**Example:**
```typescript
// Save settings
await figma.clientStorage.setAsync('github_repo_url', repoUrl);

// Load settings
const repoUrl = await figma.clientStorage.getAsync('github_repo_url');
```

---

## Constants

### Confidence Thresholds

```typescript
const MIN_CONFIDENCE_THRESHOLD = 0.85; // Minimum to show in results

// Confidence levels
const EXACT_MATCH = 1.0;        // Exact token reference
const SEMANTIC_MATCH = 0.95;    // Via reference chain
const PARTIAL_MATCH = 0.9;      // Partial path match
const VALUE_MATCH = 0.7;        // Value-based only
```

### Scan Limits

```typescript
const DEFAULT_BATCH_SIZE = 50;      // Components per batch
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
```

### Token Types

```typescript
type TokenType = 
  | 'color'
  | 'fontFamily'
  | 'fontWeight'
  | 'typography'
  | 'dimension'
  | 'spacing'
  | 'shadow'
  | 'borderRadius'
  | 'borderWidth'
  | 'border'
  | 'composition'
  | 'other';
```

---

## Error Handling

All async methods return Promises that may reject with errors:

```typescript
try {
  const result = await service.fetchTokens('main');
} catch (error) {
  if (error.message.includes('401')) {
    console.error('Invalid GitHub token');
  } else if (error.message.includes('404')) {
    console.error('Repository not found');
  } else {
    console.error('Unknown error:', error);
  }
}
```

Common error codes:
- `401`: Unauthorized (invalid token)
- `404`: Not found (repo, branch, or file)
- `403`: Forbidden (rate limit or permissions)
- `500`: GitHub server error

---

## Performance Considerations

### Batch Processing

When scanning large files (1000+ components):

```typescript
const options: ScanOptions = {
  chunkSize: 50,  // Process in batches
  onProgress: (p) => console.log(`${p.percentage}%`)
};
```

### Caching Strategy

```typescript
// First scan: ~5-10s
const result1 = await service.scanComponents({ usePersistentCache: true });

// Subsequent scans: ~50-200ms (from cache)
const result2 = await service.scanComponents({ usePersistentCache: true });

// Force fresh scan
await service.clearCache();
const result3 = await service.scanComponents({ useCache: false });
```

### Memory Management

For very large files, consider:
- Scanning specific pages only
- Limiting depth of component tree
- Disabling child extraction if not needed

```typescript
const options: ScanOptions = {
  pageFilter: ['Components'],  // Specific pages only
  maxDepth: 2,                // Limit nesting depth
  includeChildren: false       // Skip children if not needed
};
```

---

**Version**: 1.0.0  
**Last Updated**: January 2026
