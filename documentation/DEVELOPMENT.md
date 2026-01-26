# Development Guide

## 🏗️ Project Setup

### Prerequisites

- Node.js 18+ and npm
- Figma desktop app
- GitHub account with a token repository

### Installation

```bash
# Clone the repository
git clone https://github.com/invstd/plugin-tokenmatcher.git
cd plugin-tokenmatcher

# Install dependencies
npm install

# Build the plugin
npm run build

# Watch mode for development
npm run watch
```

### Build Commands

```bash
npm run build       # Build CSS + TypeScript
npm run build:css   # Build Tailwind CSS only
npm run build:js    # Build TypeScript only
npm run watch       # Watch mode (CSS + TypeScript)
```

## 📁 Architecture

### Core Services

#### **FigmaComponentServiceOptimized** (`services/figma-component-service-optimized.ts`)

Scans Figma components and extracts properties with token references.

**Key Features:**
- Persistent caching using `figma.clientStorage`
- Batch processing with progress tracking
- Token-type specific extraction
- Intelligent cache invalidation

**Main Methods:**
```typescript
scanComponents(options: ScanOptions): Promise<ScanResult>
clearCache(): Promise<void>
```

#### **GitHubTokenService** (`services/github-token-service.ts`)

Fetches and parses design tokens from GitHub repositories.

**Key Features:**
- Public and private repository support
- Branch selection
- Multiple format support (JSON, JS, TS)
- Automatic token file detection

**Main Methods:**
```typescript
testConnection(): Promise<ConnectionResult>
getBranches(): Promise<string[]>
fetchTokens(branch: string): Promise<ParsedToken[]>
```

#### **TokenMatchingService** (`services/token-matching-service.ts`)

Matches design tokens against component properties.

**Key Features:**
- Priority-based matching (reference → semantic → value)
- Confidence scoring (0.85-1.0)
- Nested component deduplication
- Support for 6+ token types

**Main Methods:**
```typescript
matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult
```

#### **TokenParser** (`services/token-parser.ts`)

Parses token files into normalized format.

**Supported Formats:**
- Tokens Studio for Figma
- Flat JSON objects
- Nested token groups
- JavaScript/TypeScript exports

## 🎨 UI Architecture

### Component Structure

```
App (ui.tsx)
├── SettingsPanel
│   ├── GitHub Configuration
│   ├── Branch Selection
│   └── Connection Status
├── SearchPanel
│   ├── Token Search
│   ├── Token Dropdown
│   └── Scan Options
└── ResultsPanel
    └── Component Groups
        ├── Component Card
        ├── Variant List
        └── Actions
```

### State Management

- **Storage**: `figma.clientStorage` for settings and cache
- **Communication**: `figma.ui.postMessage()` for UI ↔ Plugin communication
- **In-memory**: Search state, results, UI state

## 🔄 Data Flow

```
User Action (Search Token)
    ↓
GitHub Token Service
    ↓
Token Parser (normalize)
    ↓
Figma Component Service (scan + cache)
    ↓
Token Matching Service (match + filter)
    ↓
UI (display grouped results)
```

## 🚀 Performance Optimizations

### 1. Persistent Caching

Components are cached in `figma.clientStorage` with intelligent invalidation:

```typescript
// Cache key includes token type and pages
const cacheKey = `${tokenType}_${pageNames.join(',')}`;

// Invalidation based on document structure hash
const docHash = calculateDocumentHash(pages);
```

**Impact**: 10-100x faster for subsequent scans

### 2. Batch Processing

Components scanned in batches of 50 with progress updates:

```typescript
const BATCH_SIZE = 50;
for (let i = 0; i < components.length; i += BATCH_SIZE) {
  const batch = components.slice(i, i + BATCH_SIZE);
  processBatch(batch);
  reportProgress(i / components.length);
}
```

**Impact**: Prevents UI freezing during large scans

### 3. Early Exit on High Confidence

When an exact token reference match is found, skip value-based matching:

```typescript
if (referenceMatch && referenceMatch.confidence >= 0.9) {
  return referenceMatch; // Skip expensive value comparisons
}
```

### 4. Confidence Threshold Filtering

Only show matches with confidence >= 0.85:

```typescript
const MIN_CONFIDENCE_THRESHOLD = 0.85;
matches = matches.filter(m => m.confidence >= MIN_CONFIDENCE_THRESHOLD);
```

## 🧪 Testing Strategy

### Manual Testing Checklist

**Token Matching:**
- [ ] Exact token reference match (confidence: 1.0)
- [ ] Semantic token chain (confidence: 0.95)
- [ ] Partial path match (confidence: 0.9)
- [ ] Value-based match (confidence: 0.7)

**Component Scanning:**
- [ ] All pages scan completes
- [ ] Current page scan works
- [ ] Selection only scan works
- [ ] Cache invalidation on document changes

**GitHub Integration:**
- [ ] Public repository connection
- [ ] Private repository with token
- [ ] Branch switching
- [ ] Directory path configuration

## 🐛 Debugging

### Enable Debug Logging

In `figma-component-service-optimized.ts`:

```typescript
const service = new FigmaComponentServiceOptimized();
service.setDebugLogging(true);
```

### Console Output

```javascript
[TokenMatch] Scanning 1000 components...
[TokenMatch] Found 25 matches for token: button.primary.bg
[TokenMatch] Cache hit! Loaded from persistent storage
```

### Inspect Cache

```typescript
const cache = await figma.clientStorage.getAsync('component_cache_v1');
console.log('Cache contents:', cache);
```

## 📝 Code Style

- **TypeScript**: Strict mode enabled
- **Naming**: camelCase for functions/variables, PascalCase for classes/interfaces
- **Comments**: Explain "why", not "what"
- **Imports**: External → Internal → Types
- **Line Length**: Max 120 characters

### Example

```typescript
/**
 * Match color tokens using priority-based approach
 * Priority: Token reference > Semantic > Value
 */
private matchColor(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
  // Token reference matching (highest confidence)
  const referenceMatch = this.matchByTokenReference(token, component);
  if (referenceMatch) return referenceMatch;
  
  // Value-based fallback
  return this.matchByValue(token, component);
}
```

## 🔧 Common Tasks

### Adding a New Token Type

1. Update `TokenType` in `types/tokens.ts`
2. Add parsing logic in `token-parser.ts`
3. Add extraction in `figma-component-service-optimized.ts`
4. Add matching logic in `token-matching-service.ts`
5. Update UI display in `ui.tsx`

### Modifying Cache Strategy

Edit `figma-component-service-optimized.ts`:

```typescript
// Change cache duration
private cacheMaxAge = 10 * 60 * 1000; // 10 minutes

// Or disable persistent cache
const options: ScanOptions = {
  usePersistentCache: false
};
```

### Adding a New Scan Mode

1. Add mode to UI in `ui.tsx`
2. Handle in `main.ts` match handler
3. Pass to `FigmaComponentServiceOptimized.scanComponents()`
4. Add filtering logic in component service

## 📦 Build Output

```
build/
├── main.js      # Plugin sandbox code (~500KB minified)
└── ui.js        # UI iframe code (~300KB minified)
```

Generated manifest:

```json
{
  "name": "TokenMatch",
  "id": "...",
  "api": "1.0.0",
  "main": "build/main.js",
  "ui": "build/ui.js",
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["https://api.github.com"]
  }
}
```

## 🚨 Common Issues

### Issue: Build fails with EPERM error

**Solution**: Run with elevated permissions or fix npm cache:
```bash
npm cache clean --force
npm install
```

### Issue: Plugin doesn't find token references

**Cause**: Components don't have Tokens Studio plugin data

**Solution**: Apply tokens using Tokens Studio plugin first

### Issue: Slow scanning on large files

**Solution**: 
- Enable persistent cache (default)
- Use "Current page" mode
- Reduce batch size in options

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

MIT License - See LICENSE file for details

---

**Need Help?** Open an issue on GitHub or check the legacy documentation in `documentation-legacy/` for historical context.
