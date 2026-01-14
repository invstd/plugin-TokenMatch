# Token Processing Performance Optimization Plan

## Executive Summary

Current performance issues with 500+ tokens:
- **Repository scanning**: Sequential API calls (~200-500ms per file)
- **Token parsing**: Synchronous recursive walk with excessive object allocation
- **Data transfer**: Large payloads sent to UI (memory pressure in Figma plugin sandbox)
- **Token matching**: Redundant recursive traversal and string operations

**Target**: Reduce total processing time from multiple seconds to under 1 second for 500+ tokens.

---

## Current Architecture Bottlenecks

### 1. GitHub API Calls (Sequential)

```
Current: detectTokenFiles() → fetchFileContents() per file (sequential)
Time: ~200-500ms × N files = 1-5+ seconds for 10+ files
```

**Problem**: Each file is fetched one at a time in a loop.

```typescript
// main.ts:367-424 - Sequential fetching
for (const filePath of tokenFiles) {
  const fileContent = await githubService.fetchFileContents(...);
  // Process sequentially...
}
```

### 2. Token Extraction (Object Allocation)

```
Current: Walk tree, create [...path] for every node
Time: O(n) with high memory churn
```

**Problem**: Creates new arrays constantly via spread operator.

```typescript
// main.ts:317
walk(child, [...path, key], depth + 1);  // New array every call
```

### 3. Type Inference (Regex Heavy)

```
Current: Multiple regex.match() calls per value
Time: ~10-20 regex operations per token
```

**Problem**: Checks every pattern even after finding a match.

```typescript
// main.ts:132-206 - inferType runs many regexes
if (val.match(/^#[0-9A-Fa-f]{3,8}$/)) ...
if (val.match(/^rgba?\(/)) ...
if (val.match(/^hsla?\(/)) ...
// etc.
```

### 4. UI Data Transfer (Large Payloads)

```
Current: Send all tokens at once (capped at 150)
Problem: Still sends full token objects with paths, values, metadata
```

### 5. Token Matching (Redundant Work)

```
Current: For each token, scan all components recursively
Time: O(tokens × components × children)
```

---

## Optimization Plan

### Phase 1: Parallel GitHub API Fetching (High Impact)

**Estimated improvement: 60-80% reduction in fetch time**

#### Changes:

**A. Parallel file content fetching**

```typescript
// services/github-token-service.ts - NEW METHOD
async fetchMultipleFilesParallel(
  files: string[],
  owner: string,
  repo: string,
  branch: string,
  token: string,
  maxConcurrency: number = 5
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < files.length; i += maxConcurrency) {
    const batch = files.slice(i, i + maxConcurrency);
    const promises = batch.map(async (filePath) => {
      try {
        const content = await this.fetchFileContents(owner, repo, branch, token, filePath);
        if (content.content) {
          const decoded = this.decodeBase64Content(content.content);
          return { path: filePath, content: decoded };
        }
      } catch (e) {
        console.error(`Failed to fetch ${filePath}:`, e);
      }
      return null;
    });
    
    const batchResults = await Promise.all(promises);
    batchResults.forEach(r => r && results.set(r.path, r.content));
  }
  
  return results;
}
```

**B. Use GitHub Trees API for faster file discovery**

```typescript
// Instead of recursive directory fetching, use single API call
async fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  const data = await response.json();
  return data.tree.filter((entry: any) => 
    entry.type === 'blob' && 
    entry.path.endsWith('.json') &&
    !this.isExcludedFile(entry.path)
  );
}
```

**C. Consider using raw.githubusercontent.com for faster fetches**

```typescript
// Raw content URL is faster than API
async fetchRawContent(owner: string, repo: string, branch: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(url);
  return response.text(); // No base64 decoding needed!
}
```

---

### Phase 2: Optimized Token Parsing (Medium Impact)

**Estimated improvement: 40-60% reduction in parse time**

#### Changes:

**A. Eliminate array spread in recursion**

```typescript
// Use a mutable path array with push/pop instead of [...path]
const extractTokensOptimized = (obj: any, filePath: string) => {
  const tokens: Token[] = [];
  const path: string[] = [];
  
  const walk = (node: any) => {
    if (node === null || node === undefined) return;
    
    // Check for tokens first (most common case)
    if (isW3CToken(node)) {
      tokens.push({
        name: path[path.length - 1] || 'unnamed',
        path: path.join('.'),  // Join once, store as string
        type: node.$type || inferType(node.$value, path),
        sourceFile: filePath,
        value: node.$value
      });
      return;
    }
    
    // ... similar for other token types
    
    if (typeof node === 'object') {
      for (const key in node) {
        if (key.startsWith('$') || key === 'extensions') continue;
        path.push(key);
        walk(node[key]);
        path.pop();  // Reuse same array
      }
    }
  };
  
  walk(obj);
  return tokens;
};
```

**B. Compile regexes once (outside function)**

```typescript
// Create compiled regex patterns at module level
const COLOR_PATTERNS = {
  hex: /^#[0-9A-Fa-f]{3,8}$/,
  rgba: /^rgba?\(/,
  hsla: /^hsla?\(/
};

const DIMENSION_PATTERN = /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/;
const DURATION_PATTERN = /^\d+(\.\d+)?(ms|s)$/;

// Use early return pattern
const inferTypeOptimized = (value: any, pathStr: string): string => {
  const pathLower = pathStr.toLowerCase();
  
  if (typeof value === 'string') {
    // Check most common types first with early return
    if (COLOR_PATTERNS.hex.test(value)) return 'color';
    if (COLOR_PATTERNS.rgba.test(value)) return 'color';
    if (pathLower.includes('color')) return 'color';
    if (DIMENSION_PATTERN.test(value)) return 'dimension';
    // ... etc with early returns
  }
  
  return 'string';
};
```

**C. Path-based type inference lookup table**

```typescript
// Pre-compute type from path keywords
const PATH_TYPE_MAP = new Map([
  ['color', 'color'],
  ['colour', 'color'],
  ['fill', 'color'],
  ['stroke', 'color'],
  ['background', 'color'],
  ['spacing', 'dimension'],
  ['size', 'dimension'],
  ['gap', 'dimension'],
  ['padding', 'dimension'],
  ['margin', 'dimension'],
  ['radius', 'borderRadius'],
  ['corner', 'borderRadius'],
  ['font', 'typography'],
  ['shadow', 'shadow'],
  // ... etc
]);

const inferFromPath = (pathStr: string): string | null => {
  const lower = pathStr.toLowerCase();
  for (const [keyword, type] of PATH_TYPE_MAP) {
    if (lower.includes(keyword)) return type;
  }
  return null;
};
```

---

### Phase 3: Caching Layer (High Impact for Repeat Scans)

**Estimated improvement: 90%+ for repeat scans**

#### Changes:

**A. Add token caching in clientStorage**

```typescript
// main.ts - Add caching
interface TokenCache {
  repoUrl: string;
  branch: string;
  filePath: string;
  sha: string;  // Git commit SHA for cache invalidation
  tokens: Token[];
  timestamp: number;
}

async function getCachedTokens(key: string): Promise<TokenCache | null> {
  try {
    const cache = await figma.clientStorage.getAsync(`tokenCache_${key}`);
    if (cache && Date.now() - cache.timestamp < 5 * 60 * 1000) { // 5 min TTL
      return cache;
    }
  } catch {}
  return null;
}

async function setCachedTokens(key: string, tokens: Token[], sha: string): Promise<void> {
  const cache: TokenCache = {
    tokens,
    sha,
    timestamp: Date.now()
  };
  await figma.clientStorage.setAsync(`tokenCache_${key}`, cache);
}
```

**B. Use Git SHA for smart cache invalidation**

```typescript
// Check if repo has new commits before re-fetching
async function getLatestCommitSha(owner: string, repo: string, branch: string, token: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  return data.sha;
}

// In fetch-tokens handler:
const cacheKey = `${owner}/${repo}/${branch}/${directoryPath}`;
const cached = await getCachedTokens(cacheKey);
const currentSha = await getLatestCommitSha(owner, repo, branch, token);

if (cached && cached.sha === currentSha) {
  // Return cached tokens immediately
  emit('tokens-result', { success: true, tokens: cached.tokens, fromCache: true });
  return;
}
```

---

### Phase 4: Streaming & Chunked Processing (Medium Impact)

**Estimated improvement: Better UX, reduced memory pressure**

#### Changes:

**A. Process and emit tokens in chunks**

```typescript
// main.ts - Stream results to UI
const CHUNK_SIZE = 50;

for (let i = 0; i < allTokens.length; i += CHUNK_SIZE) {
  const chunk = allTokens.slice(i, i + CHUNK_SIZE);
  emit('tokens-chunk', {
    tokens: chunk,
    progress: Math.min(100, Math.round((i + chunk.length) / allTokens.length * 100)),
    isLast: i + CHUNK_SIZE >= allTokens.length
  });
  
  // Yield to event loop to keep UI responsive
  await new Promise(resolve => setTimeout(resolve, 0));
}
```

**B. UI accumulates chunks progressively**

```typescript
// ui.tsx
on('tokens-chunk', (msg) => {
  setFetchedTokens(prev => [...prev, ...msg.tokens]);
  setProgress(msg.progress);
  if (msg.isLast) {
    setLoading(false);
  }
});
```

---

### Phase 5: Optimized Token Matching (Medium Impact)

**Estimated improvement: 30-50% reduction in match time**

#### Changes:

**A. Build inverted index for token lookup**

```typescript
// services/token-matching-service.ts
class TokenMatchingService {
  private tokenIndex: Map<string, ParsedToken[]> = new Map();
  
  // Build index once, query many times
  buildTokenIndex(tokens: ParsedToken[]): void {
    this.tokenIndex.clear();
    
    for (const token of tokens) {
      // Index by type
      const typeKey = `type:${token.type}`;
      if (!this.tokenIndex.has(typeKey)) {
        this.tokenIndex.set(typeKey, []);
      }
      this.tokenIndex.get(typeKey)!.push(token);
      
      // Index by path segments for quick lookup
      const pathParts = token.path;
      for (const part of pathParts) {
        const partKey = `path:${part.toLowerCase()}`;
        if (!this.tokenIndex.has(partKey)) {
          this.tokenIndex.set(partKey, []);
        }
        this.tokenIndex.get(partKey)!.push(token);
      }
    }
  }
  
  // Fast lookup by type
  getTokensByType(type: string): ParsedToken[] {
    return this.tokenIndex.get(`type:${type}`) || [];
  }
}
```

**B. Pre-normalize component values once**

```typescript
// figma-component-service.ts
// Store normalized values during scan, not during match
extractColors(node: SceneNode): ColorProperty[] {
  const colors: ColorProperty[] = [];
  
  if ('fills' in node && Array.isArray(node.fills)) {
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i];
      if (fill.type === 'SOLID') {
        const color = this.rgbaToColor(fill.color, fill.opacity ?? 1);
        colors.push({
          ...color,
          // Pre-compute normalized values for matching
          normalizedHex: color.hex.toLowerCase().replace('#', ''),
          tokenReference: this.getFillTokenReferences(node, i)
        });
      }
    }
  }
  return colors;
}
```

**C. Skip value matching when token reference exists**

```typescript
// Prioritize token reference matching (O(1) string compare)
// Only fall back to value matching if no reference
private matchColor(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
  const tokenPath = token.path.join('.').toLowerCase();
  
  // FAST PATH: Token reference matching
  for (const color of component.colors) {
    if (color.tokenReference) {
      const refLower = this.normalizeReference(color.tokenReference);
      if (refLower === tokenPath) {
        return [{ /* match */ confidence: 1.0 }];
      }
    }
  }
  
  // SLOW PATH: Value matching (only if no refs found)
  // ...
}
```

---

### Phase 6: Web Worker for Heavy Processing (Optional, High Impact)

**Estimated improvement: Non-blocking UI, perceived instant**

For very large token sets, offload parsing to a Web Worker:

```typescript
// workers/token-parser.worker.ts
self.onmessage = (e) => {
  const { jsonContent, filePath } = e.data;
  const tokens = extractTokensOptimized(JSON.parse(jsonContent), filePath);
  self.postMessage({ tokens });
};

// main.ts - Use worker pool
const workerPool = new WorkerPool('workers/token-parser.worker.js', 4);

async function parseTokensInParallel(files: Map<string, string>): Promise<Token[]> {
  const tasks = Array.from(files.entries()).map(([path, content]) =>
    workerPool.run({ jsonContent: content, filePath: path })
  );
  const results = await Promise.all(tasks);
  return results.flat();
}
```

---

## Implementation Priority

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| 1. Parallel API | High | Medium | **P0** |
| 2. Parsing Optimization | Medium | Low | **P0** |
| 3. Caching | High (repeat) | Medium | **P1** |
| 4. Streaming | UX | Low | **P1** |
| 5. Match Optimization | Medium | Medium | **P2** |
| 6. Web Workers | High | High | **P3** |

---

## Implementation Order

### Sprint 1 (Quick Wins - P0)
1. Implement parallel file fetching with `Promise.all` batching
2. Replace `[...path]` with mutable path array
3. Pre-compile regex patterns
4. Add early returns in type inference

### Sprint 2 (Caching & Streaming - P1)
1. Add token cache with SHA-based invalidation
2. Implement chunked token emission
3. Add progress reporting for large fetches

### Sprint 3 (Advanced Optimizations - P2/P3)
1. Build inverted token index
2. Pre-normalize component values
3. Consider Web Worker for parsing (if still needed)

---

## Metrics to Track

Before implementing, measure baseline:
- Time to detect files
- Time to fetch all files
- Time to parse tokens
- Time to match tokens
- Memory usage in plugin

After each phase, re-measure to validate improvement.

---

## Quick Start: Minimal Changes for Maximum Impact

If you want the biggest improvement with the least code change, implement these two things:

### 1. Parallel file fetching (main.ts)

```typescript
// Replace the sequential loop with parallel batches
const BATCH_SIZE = 5;
const fileContents: Array<{path: string; content: string}> = [];

for (let i = 0; i < tokenFiles.length; i += BATCH_SIZE) {
  const batch = tokenFiles.slice(i, i + BATCH_SIZE);
  emit('tokens-progress', { message: `Fetching files ${i+1}-${Math.min(i+BATCH_SIZE, tokenFiles.length)}...` });
  
  const batchResults = await Promise.all(
    batch.map(async (filePath) => {
      try {
        const fileContent = await githubService.fetchFileContents(
          parsed.owner, parsed.repo, msg.branch, msg.token, filePath
        );
        if (fileContent.content) {
          const decoded = githubService.decodeBase64Content(fileContent.content);
          return { path: filePath, content: decoded };
        }
      } catch (e) {
        return null;
      }
    })
  );
  
  fileContents.push(...batchResults.filter(Boolean));
}

// Then process all contents (still fast, parsing is quick)
for (const { path, content } of fileContents) {
  const json = JSON.parse(content);
  const tokens = extractTokensFromJson(json, path);
  allTokens.push(...tokens);
}
```

### 2. Mutable path array (main.ts)

```typescript
const extractTokensFromJson = (obj: any, filePath: string) => {
  const tokens: Array<...> = [];
  const pathStack: string[] = [];  // Mutable, reused
  
  const walk = (node: any) => {
    // ... same logic, but use pathStack.push(key) and pathStack.pop()
    // instead of [...path, key]
  };
  
  walk(obj);
  return tokens;
};
```

These two changes alone should reduce processing time by 50-70%.

