# Feature: Unused Token Finder

## Overview

Identify tokens from the design token repository that aren't referenced by any components in the Figma file, with special handling for tokens that are consumed by other tokens in semantic relationships (aliases/references).

## User Story

As a design system maintainer, I want to identify tokens that aren't being used by any components, so I can determine if they should be deprecated, removed, or if components need to be updated to use them.

## Feature Specifications

### Core Functionality

1. **Unused Token Detection**
   - Compare all tokens from repository against component token references
   - Build comprehensive usage index across all scanned components
   - Identify tokens with zero direct component references

2. **Semantic Relationship Analysis**
   - Parse token alias/reference relationships (e.g., `{color.primary.500}`)
   - Distinguish between:
     - **Orphaned tokens**: Not used by components OR other tokens
     - **Semantic-only tokens**: Consumed by other tokens, not directly by components
     - **Primitive tokens**: Base values that semantic tokens reference
   - Build dependency graph of token relationships

3. **Categorization & Recommendations**
   - Safe to remove: Truly orphaned tokens
   - Review needed: Semantic-only tokens (may be intentional design decisions)
   - Core primitives: Base tokens consumed by semantic tokens

### User Interface

#### New UI Elements

1. **Unused Tokens View**
   - Tab or toggle in main interface
   - Category filters (orphaned, semantic-only, primitives)
   - Search/filter within unused tokens

2. **Token Relationship Visualization**
   - Show which tokens consume/are consumed by selected token
   - Visual indicator of semantic chain depth

3. **Bulk Actions**
   - "Copy unused token list" for documentation
   - "Export unused tokens report"

### Results Display Format

```
┌─────────────────────────────────────────────────────────┐
│ Unused Tokens Analysis                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Orphaned Tokens (12)                          ▼ Expand  │
│ ──────────────────────────────────────────────────────  │
│ ⚠️ ids.color.deprecated.error                          │
│    Type: color | Value: #DC2626                         │
│    No references found                                  │
│                                                         │
│ ⚠️ ids.spacing.legacy.xxl                              │
│    Type: dimension | Value: 48px                        │
│    No references found                                  │
│                                                         │
│ Semantic-Only Tokens (8)                      ▼ Expand  │
│ ──────────────────────────────────────────────────────  │
│ 🔗 ids.color.primary.500                               │
│    Type: color | Value: #3B82F6                         │
│    Consumed by: ids.color.button.primary (2 refs)       │
│                 ids.color.link.default (1 ref)          │
│                                                         │
│ Primitive Tokens (24)                         ▼ Expand  │
│ ──────────────────────────────────────────────────────  │
│ 📦 ids.color.blue.500                                  │
│    Type: color | Value: #3B82F6                         │
│    Base primitive for semantic tokens                   │
│    Consumed by: ids.color.primary.500 (→ 3 components)  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/tokens.ts`)

```typescript
interface TokenUsageInfo {
  token: ParsedToken;
  directComponentUsage: number;        // Components directly referencing this token
  consumedByTokens: TokenReference[];  // Other tokens that reference this token
  consumesTokens: TokenReference[];    // Tokens this token references (aliases)
  usageCategory: 'orphaned' | 'semantic-only' | 'primitive' | 'active';
  componentRefs: Array<{
    componentId: string;
    componentName: string;
    propertyType: string;
  }>;
}

interface TokenReference {
  tokenPath: string;
  referenceType: 'alias' | 'composite';  // alias = direct ref, composite = part of value
}

interface TokenDependencyGraph {
  nodes: Map<string, TokenUsageInfo>;
  edges: Array<{
    from: string;  // consuming token path
    to: string;    // consumed token path
  }>;
}

interface UnusedTokensResult {
  orphaned: TokenUsageInfo[];
  semanticOnly: TokenUsageInfo[];
  primitives: TokenUsageInfo[];
  summary: {
    totalTokens: number;
    activeTokens: number;
    orphanedTokens: number;
    semanticOnlyTokens: number;
    primitiveTokens: number;
  };
  dependencyGraph: TokenDependencyGraph;
}
```

### Service Layer

#### New Service: `unused-token-service.ts`

```typescript
// services/unused-token-service.ts

export class UnusedTokenService {
  /**
   * Build complete token usage index from scanned components
   */
  buildTokenUsageIndex(
    allTokens: ParsedToken[],
    componentMatches: ComponentMatch[]
  ): Map<string, TokenUsageInfo>;

  /**
   * Parse token aliases/references to build dependency graph
   */
  buildDependencyGraph(
    tokens: ParsedToken[]
  ): TokenDependencyGraph;

  /**
   * Analyze and categorize unused tokens
   */
  analyzeUnusedTokens(
    usageIndex: Map<string, TokenUsageInfo>,
    dependencyGraph: TokenDependencyGraph
  ): UnusedTokensResult;

  /**
   * Get transitive usage (indirect component usage through semantic chains)
   */
  getTransitiveUsage(
    tokenPath: string,
    dependencyGraph: TokenDependencyGraph
  ): number;
}
```

### Algorithm: Token Reference Parsing

Token values can reference other tokens using various syntaxes:

```typescript
// W3C/Tokens Studio alias format
const ALIAS_PATTERNS = [
  /\{([^}]+)\}/g,           // {color.primary.500}
  /\$([a-zA-Z0-9._-]+)/g,   // $color.primary.500
];

function parseTokenReferences(token: ParsedToken): TokenReference[] {
  const references: TokenReference[] = [];
  const valueStr = typeof token.value === 'string'
    ? token.value
    : JSON.stringify(token.value);

  for (const pattern of ALIAS_PATTERNS) {
    let match;
    while ((match = pattern.exec(valueStr)) !== null) {
      references.push({
        tokenPath: normalizeTokenPath(match[1]),
        referenceType: 'alias'
      });
    }
  }

  // Handle composite values (typography, shadow)
  if (typeof token.value === 'object' && token.value !== null) {
    for (const [key, subValue] of Object.entries(token.value)) {
      if (typeof subValue === 'string') {
        for (const pattern of ALIAS_PATTERNS) {
          let match;
          while ((match = pattern.exec(subValue)) !== null) {
            references.push({
              tokenPath: normalizeTokenPath(match[1]),
              referenceType: 'composite'
            });
          }
        }
      }
    }
  }

  return references;
}

function normalizeTokenPath(path: string): string {
  // Convert various formats to consistent dot notation
  return path
    .replace(/\[['"]?/g, '.')
    .replace(/['"]?\]/g, '')
    .replace(/^\./, '');
}
```

### Algorithm: Dependency Graph Construction

```typescript
function buildDependencyGraph(tokens: ParsedToken[]): TokenDependencyGraph {
  const nodes = new Map<string, TokenUsageInfo>();
  const edges: Array<{ from: string; to: string }> = [];

  // Initialize all nodes
  for (const token of tokens) {
    const tokenPath = token.path.join('.');
    nodes.set(tokenPath, {
      token,
      directComponentUsage: 0,
      consumedByTokens: [],
      consumesTokens: [],
      usageCategory: 'orphaned', // Will be updated
      componentRefs: []
    });
  }

  // Build edges (references between tokens)
  for (const token of tokens) {
    const tokenPath = token.path.join('.');
    const references = parseTokenReferences(token);

    for (const ref of references) {
      // Add edge
      edges.push({ from: tokenPath, to: ref.tokenPath });

      // Update consuming token
      const consumingNode = nodes.get(tokenPath);
      if (consumingNode) {
        consumingNode.consumesTokens.push(ref);
      }

      // Update consumed token
      const consumedNode = nodes.get(ref.tokenPath);
      if (consumedNode) {
        consumedNode.consumedByTokens.push({
          tokenPath,
          referenceType: ref.referenceType
        });
      }
    }
  }

  return { nodes, edges };
}
```

### Algorithm: Token Categorization

```typescript
function categorizeTokens(
  usageIndex: Map<string, TokenUsageInfo>,
  dependencyGraph: TokenDependencyGraph
): UnusedTokensResult {
  const orphaned: TokenUsageInfo[] = [];
  const semanticOnly: TokenUsageInfo[] = [];
  const primitives: TokenUsageInfo[] = [];
  const active: TokenUsageInfo[] = [];

  for (const [tokenPath, info] of usageIndex) {
    const hasDirectUsage = info.directComponentUsage > 0;
    const isConsumedByTokens = info.consumedByTokens.length > 0;
    const consumesOtherTokens = info.consumesTokens.length > 0;

    if (hasDirectUsage) {
      // Token is directly used by components
      info.usageCategory = 'active';
      active.push(info);
    } else if (isConsumedByTokens && !consumesOtherTokens) {
      // Token is referenced by other tokens but doesn't reference any
      // This is a primitive/base token
      const transitiveUsage = getTransitiveUsage(tokenPath, dependencyGraph);
      if (transitiveUsage > 0) {
        info.usageCategory = 'primitive';
        primitives.push(info);
      } else {
        // Primitive but the consuming tokens are also unused
        info.usageCategory = 'orphaned';
        orphaned.push(info);
      }
    } else if (isConsumedByTokens && consumesOtherTokens) {
      // Token is in the middle of a semantic chain
      const transitiveUsage = getTransitiveUsage(tokenPath, dependencyGraph);
      if (transitiveUsage > 0) {
        info.usageCategory = 'semantic-only';
        semanticOnly.push(info);
      } else {
        info.usageCategory = 'orphaned';
        orphaned.push(info);
      }
    } else if (!isConsumedByTokens && consumesOtherTokens) {
      // Token references other tokens but nothing references it
      // This is a semantic token that's not used
      info.usageCategory = 'orphaned';
      orphaned.push(info);
    } else {
      // No references in or out, not used by components
      info.usageCategory = 'orphaned';
      orphaned.push(info);
    }
  }

  return {
    orphaned,
    semanticOnly,
    primitives,
    summary: {
      totalTokens: usageIndex.size,
      activeTokens: active.length,
      orphanedTokens: orphaned.length,
      semanticOnlyTokens: semanticOnly.length,
      primitiveTokens: primitives.length
    },
    dependencyGraph
  };
}

function getTransitiveUsage(
  tokenPath: string,
  graph: TokenDependencyGraph,
  visited: Set<string> = new Set()
): number {
  if (visited.has(tokenPath)) return 0;
  visited.add(tokenPath);

  const node = graph.nodes.get(tokenPath);
  if (!node) return 0;

  // Direct usage
  let total = node.directComponentUsage;

  // Check all tokens that consume this one
  for (const consumer of node.consumedByTokens) {
    total += getTransitiveUsage(consumer.tokenPath, graph, visited);
  }

  return total;
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
case 'analyze-unused-tokens':
  const unusedService = new UnusedTokenService();

  // Build usage index from current matches
  const usageIndex = unusedService.buildTokenUsageIndex(
    fetchedTokens,
    cachedMatchResults
  );

  // Build dependency graph
  const depGraph = unusedService.buildDependencyGraph(fetchedTokens);

  // Analyze and categorize
  const unusedResult = unusedService.analyzeUnusedTokens(usageIndex, depGraph);

  emit('unused-tokens-result', unusedResult);
  break;

case 'get-token-dependencies':
  // Get detailed dependency info for a specific token
  const tokenInfo = dependencyGraph.nodes.get(msg.tokenPath);
  emit('token-dependencies-result', {
    tokenPath: msg.tokenPath,
    info: tokenInfo,
    consumers: getTokenConsumers(msg.tokenPath, dependencyGraph),
    dependencies: getTokenDependencies(msg.tokenPath, dependencyGraph)
  });
  break;
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
const [unusedTokensResult, setUnusedTokensResult] = useState<UnusedTokensResult | null>(null);
const [selectedCategory, setSelectedCategory] = useState<'all' | 'orphaned' | 'semantic-only' | 'primitive'>('all');
const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());
```

#### New UI Components

```typescript
const UnusedTokensView = ({ result }: { result: UnusedTokensResult }) => {
  const filteredTokens = useMemo(() => {
    switch (selectedCategory) {
      case 'orphaned': return result.orphaned;
      case 'semantic-only': return result.semanticOnly;
      case 'primitive': return result.primitives;
      default: return [...result.orphaned, ...result.semanticOnly, ...result.primitives];
    }
  }, [result, selectedCategory]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          label="Orphaned"
          count={result.summary.orphanedTokens}
          color="red"
          onClick={() => setSelectedCategory('orphaned')}
          active={selectedCategory === 'orphaned'}
        />
        <SummaryCard
          label="Semantic-Only"
          count={result.summary.semanticOnlyTokens}
          color="yellow"
          onClick={() => setSelectedCategory('semantic-only')}
          active={selectedCategory === 'semantic-only'}
        />
        <SummaryCard
          label="Primitives"
          count={result.summary.primitiveTokens}
          color="blue"
          onClick={() => setSelectedCategory('primitive')}
          active={selectedCategory === 'primitive'}
        />
      </div>

      {/* Token list */}
      <div className="space-y-2">
        {filteredTokens.map(info => (
          <UnusedTokenCard
            key={info.token.path.join('.')}
            info={info}
            expanded={expandedTokens.has(info.token.path.join('.'))}
            onToggle={() => toggleExpanded(info.token.path.join('.'))}
          />
        ))}
      </div>

      {/* Export button */}
      <button
        className="w-full border border-gray-300 py-2 rounded-lg"
        onClick={() => copyUnusedTokensReport(result)}
      >
        Copy Report to Clipboard
      </button>
    </div>
  );
};

const UnusedTokenCard = ({ info, expanded, onToggle }) => {
  const categoryIcon = {
    'orphaned': '⚠️',
    'semantic-only': '🔗',
    'primitive': '📦'
  }[info.usageCategory];

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <span>{categoryIcon}</span>
          <span className="font-mono text-sm">{info.token.path.join('.')}</span>
        </div>
        <TokenPreview token={info.token} />
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="text-xs text-gray-500">
            Type: {info.token.type} | Value: {formatTokenValue(info.token.value)}
          </div>

          {info.consumedByTokens.length > 0 && (
            <div>
              <div className="text-xs font-semibold">Consumed by:</div>
              {info.consumedByTokens.map(ref => (
                <div key={ref.tokenPath} className="text-xs text-blue-600 ml-2">
                  {ref.tokenPath}
                </div>
              ))}
            </div>
          )}

          {info.consumesTokens.length > 0 && (
            <div>
              <div className="text-xs font-semibold">References:</div>
              {info.consumesTokens.map(ref => (
                <div key={ref.tokenPath} className="text-xs text-green-600 ml-2">
                  {ref.tokenPath}
                </div>
              ))}
            </div>
          )}
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
| `services/unused-token-service.ts` | Core unused token detection and categorization |
| `types/token-usage.ts` | Type definitions for usage analysis |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add message handlers for unused token analysis |
| `src/ui.tsx` | Add unused tokens view and components |
| `services/github-token-service.ts` | Expose raw token references for alias parsing |

---

## UI/UX Considerations

### Visual Design

1. **Category Colors**
   - Orphaned: Red/warning (safe to remove)
   - Semantic-only: Yellow (review needed)
   - Primitives: Blue (foundational, likely intentional)

2. **Dependency Visualization**
   - Arrow indicators showing token relationships
   - Expandable tree view for complex chains

3. **Action Buttons**
   - "Copy token path" for each token
   - "View in repository" link (if GitHub URL available)

### Interaction Flow

1. User triggers "Analyze Unused Tokens"
2. System scans all components (reuses cache if available)
3. System builds usage index and dependency graph
4. Results display categorized by usage type
5. User can:
   - Filter by category
   - Expand tokens to see relationships
   - Copy report for documentation/review

### Edge Cases

1. **Circular references**: Detect and handle token A → B → A
2. **Missing referenced tokens**: Handle when alias target doesn't exist
3. **Large token sets**: Paginate/virtualize results for 1000+ tokens
4. **No components scanned**: Prompt user to scan first

---

## Testing Strategy

### Unit Tests

1. `parseTokenReferences()` with various alias syntaxes
2. `buildDependencyGraph()` with complex token relationships
3. `categorizeTokens()` with edge cases (orphaned primitives, circular refs)
4. `getTransitiveUsage()` accuracy

### Integration Tests

1. Full analysis workflow with mock token set
2. Verify categorization matches expected results
3. Test with real-world token structures (W3C, Tokens Studio)

### Manual Testing

1. Test with design systems of varying sizes
2. Verify semantic relationship detection with real tokens
3. Check performance with 500+ tokens
4. Validate accuracy against manual audit

---

## Performance Considerations

1. **Reuse Scan Results**: Don't re-scan components if cache valid
2. **Lazy Graph Construction**: Only build full graph when needed
3. **Memoize Transitive Usage**: Cache results of recursive calculations
4. **Batch UI Updates**: Prevent re-renders during large result processing

---

## Future Enhancements

1. **Token Cleanup Workflow**: Guide users through safe token removal
2. **Deprecation Markers**: Detect `@deprecated` in token metadata
3. **Usage Trends**: Track token usage over time across file versions
4. **Cross-File Analysis**: Analyze unused tokens across multiple Figma files
5. **Integration with Token Repository**: PR suggestions to remove orphaned tokens
