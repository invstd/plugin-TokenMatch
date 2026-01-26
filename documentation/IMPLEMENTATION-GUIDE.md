# TokenMatch Implementation Guide

This guide provides comprehensive technical documentation for developers working on the TokenMatch Figma plugin.

## 📚 Documentation Index

### Implementation Documentation

- **[COMPONENT-MATCH-IMPLEMENTATION.md](./COMPONENT-MATCH-IMPLEMENTATION.md)** - Complete guide to the token-component matching system, including algorithms, deduplication, variant preservation, and all supported token types

- **[TOKENS_STUDIO_INTEGRATION_GUIDE.md](./TOKENS_STUDIO_INTEGRATION_GUIDE.md)** - Guide for integrating with Tokens Studio format and token reference systems

### Performance & Architecture

- **[PERFORMANCE_OPTIMIZATION_PLAN.md](./PERFORMANCE_OPTIMIZATION_PLAN.md)** - Detailed plan for optimizing plugin performance with caching, batch processing, and scanning strategies

- **[OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md)** - Comprehensive optimization strategies and implementation details

- **[OPTIMIZATION_STATUS_FINAL.md](./OPTIMIZATION_STATUS_FINAL.md)** - Final status report on optimization efforts and achieved performance improvements

### User Documentation

- **[TOKEN-MATCH.MD](./TOKEN-MATCH.MD)** - Main plugin documentation covering features, usage instructions, and user-facing functionality

---

## 🎯 Quick Navigation

### For New Developers

**Start Here:**
1. Read [TOKEN-MATCH.MD](./TOKEN-MATCH.MD) to understand what the plugin does
2. Review [COMPONENT-MATCH-IMPLEMENTATION.md](./COMPONENT-MATCH-IMPLEMENTATION.md) to understand the core matching system
3. Check [PERFORMANCE_OPTIMIZATION_PLAN.md](./PERFORMANCE_OPTIMIZATION_PLAN.md) for architecture overview

### For Feature Development

**Token Matching:**
- [COMPONENT-MATCH-IMPLEMENTATION.md](./COMPONENT-MATCH-IMPLEMENTATION.md) - All matching algorithms and strategies

**Performance Improvements:**
- [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md) - Optimization techniques
- [OPTIMIZATION_STATUS_FINAL.md](./OPTIMIZATION_STATUS_FINAL.md) - Current optimization state

**Token Format Support:**
- [TOKENS_STUDIO_INTEGRATION_GUIDE.md](./TOKENS_STUDIO_INTEGRATION_GUIDE.md) - Token parsing and formats

### For Bug Fixes

**Common Issues:**
- Component matching problems → [COMPONENT-MATCH-IMPLEMENTATION.md](./COMPONENT-MATCH-IMPLEMENTATION.md#troubleshooting)
- Performance issues → [OPTIMIZATION_STATUS_FINAL.md](./OPTIMIZATION_STATUS_FINAL.md)
- Token parsing errors → [TOKENS_STUDIO_INTEGRATION_GUIDE.md](./TOKENS_STUDIO_INTEGRATION_GUIDE.md)

---

## 📁 Project Structure

```
/Users/mschultz/FigmaTokensChecker/v1/
├── documentation/              # You are here
│   ├── IMPLEMENTATION-GUIDE.md            # This file
│   ├── COMPONENT-MATCH-IMPLEMENTATION.md  # Matching system details
│   ├── TOKEN-MATCH.MD                     # User documentation
│   ├── PERFORMANCE_OPTIMIZATION_PLAN.md   # Performance architecture
│   ├── OPTIMIZATION_GUIDE.md              # Optimization techniques
│   ├── OPTIMIZATION_STATUS_FINAL.md       # Current status
│   └── TOKENS_STUDIO_INTEGRATION_GUIDE.md # Token format guide
│
├── src/                       # UI source code
│   ├── ui.tsx                # Preact UI components
│   ├── main.ts               # Plugin main thread logic
│   ├── input.css             # Tailwind input
│   └── output.css            # Generated CSS
│
├── services/                  # Core business logic
│   ├── figma-component-service.ts          # Basic component scanning
│   ├── figma-component-service-optimized.ts # Optimized scanning with cache
│   ├── github-token-service.ts             # GitHub integration
│   ├── token-matching-service.ts           # Token matching algorithms
│   └── token-parser.ts                     # Token file parsing
│
├── types/                    # TypeScript type definitions
│   ├── components.ts         # Component-related types
│   └── tokens.ts            # Token-related types
│
├── build/                   # Compiled output
│   ├── main.js             # Compiled plugin code
│   └── ui.js               # Compiled UI code
│
├── roadmap/                # Feature roadmap
│   ├── 01-missing-token-detector.md
│   ├── 02-unused-token-finder.md
│   ├── 03-token-statistics.md
│   └── ...
│
├── manifest.json           # Figma plugin manifest
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.js     # Tailwind CSS config
└── README.md             # Main project README
```

---

## 🔧 Technical Architecture

### Core Services

#### 1. Token Matching Service (`services/token-matching-service.ts`)

**Purpose:** Match design tokens against Figma component properties

**Key Features:**
- Priority-based matching (token reference → semantic → value)
- Support for 6+ token types (color, typography, spacing, effects, etc.)
- Confidence scoring (0.7 - 1.0)
- Nested component deduplication
- Variant preservation

**Entry Point:**
```typescript
matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult
```

**See:** [COMPONENT-MATCH-IMPLEMENTATION.md](./COMPONENT-MATCH-IMPLEMENTATION.md) for complete details

---

#### 2. Figma Component Service (`services/figma-component-service-optimized.ts`)

**Purpose:** Scan Figma components and extract properties

**Key Features:**
- Persistent caching using `figma.clientStorage`
- Batch processing with progress tracking
- Intelligent cache invalidation based on document structure
- Token-type and page-specific caching

**Entry Points:**
```typescript
scanComponents(scope: ScanScope, tokenTypes: string[]): Promise<ScanResult>
clearCache(): Promise<void>
invalidatePagesCache(pageNames: string[]): Promise<void>
```

**Performance:**
- First scan: ~5-10s for 1000 components
- Cached scan: ~50-200ms (10-100x faster)

**See:** [PERFORMANCE_OPTIMIZATION_PLAN.md](./PERFORMANCE_OPTIMIZATION_PLAN.md#persistent-component-cache)

---

#### 3. GitHub Token Service (`services/github-token-service.ts`)

**Purpose:** Fetch and parse design tokens from GitHub repositories

**Key Features:**
- Public and private repository support
- Branch selection
- Directory path configuration
- Automatic token file detection
- Multiple format support (JSON, JS, TS)

**Entry Points:**
```typescript
testConnection(): Promise<ConnectionResult>
getBranches(): Promise<string[]>
fetchTokens(branch: string): Promise<ParsedToken[]>
```

**See:** [TOKENS_STUDIO_INTEGRATION_GUIDE.md](./TOKENS_STUDIO_INTEGRATION_GUIDE.md)

---

#### 4. Token Parser (`services/token-parser.ts`)

**Purpose:** Parse token files into normalized format

**Supported Formats:**
- Tokens Studio for Figma (with `$type` and nested references)
- Flat JSON objects
- Nested token groups
- JavaScript/TypeScript exports

**Entry Point:**
```typescript
parseTokenFile(content: string, filename: string): ParsedToken[]
```

---

### Data Flow

```
┌─────────────────┐
│  User selects   │
│  token & scope  │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  GitHub Token       │
│  Service fetches    │
│  tokens from repo   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Token Parser       │
│  normalizes format  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────┐
│  Figma Component        │
│  Service scans          │
│  components (cached)    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Token Matching         │
│  Service finds matches  │
│  with confidence scores │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────┐
│  UI displays        │
│  grouped results    │
│  with actions       │
└─────────────────────┘
```

---

## 🎨 UI Architecture

### Component Hierarchy

```
App (ui.tsx)
├── SettingsPanel
│   ├── GitHub Configuration
│   ├── Branch Selection
│   └── Connection Status
│
├── SearchPanel
│   ├── Token Search
│   ├── Token Dropdown
│   └── Scan Options (All Pages, Current Page, Selection)
│
└── ResultsPanel
    ├── Match Statistics
    ├── Component Groups
    │   ├── Component Card
    │   │   ├── Variant List
    │   │   ├── Match Details
    │   │   └── Actions (View, Paste)
    │   └── ...
    └── Empty State
```

### State Management

**Storage:**
- User settings: `figma.clientStorage` (GitHub config, last token, etc.)
- Component cache: `figma.clientStorage` with versioning
- In-memory: Search filters, results, UI state

**Communication:**
- UI → Plugin: `figma.ui.postMessage()`
- Plugin → UI: `figma.ui.postMessage()` with event handlers

---

## 🚀 Build System

### Commands

```bash
# Build everything (CSS + JS)
npm run build

# Watch mode for development
npm run watch

# Individual builds
npm run build:css    # Tailwind CSS compilation
npm run build:js     # TypeScript compilation with minification
```

### Configuration Files

- **`tsconfig.json`**: TypeScript configuration extending `@create-figma-plugin/tsconfig`
- **`tailwind.config.js`**: Tailwind CSS v4 configuration
- **`package.json`**: Build scripts and plugin configuration
- **`manifest.json`**: Figma plugin manifest (auto-generated)

### Build Process

1. **CSS**: Tailwind CLI processes `src/input.css` → `src/output.css`
2. **TypeScript**: `build-figma-plugin` compiles and bundles:
   - `src/main.ts` → `build/main.js` (plugin sandbox)
   - `src/ui.tsx` → `build/ui.js` (UI iframe)
3. **Manifest**: Auto-generated from `package.json` figma-plugin config

---

## 🧪 Testing Strategy

### Manual Testing Checklist

**Token Matching:**
- [ ] Exact token reference match (confidence: 1.0)
- [ ] Semantic token chain match (confidence: 0.95)
- [ ] Partial path match (confidence: 0.9)
- [ ] Value-based match (confidence: 0.7)
- [ ] No false positives below 0.85 threshold

**Component Scanning:**
- [ ] All pages scan completes successfully
- [ ] Current page scan works
- [ ] Selection only scan works
- [ ] Cache invalidation on document changes
- [ ] Progress tracking updates smoothly

**Nested Components:**
- [ ] Parent components excluded when only child matches
- [ ] Direct matches included even if component is nested elsewhere
- [ ] Deduplication works across multiple levels

**Variants:**
- [ ] Correct variant shown in results
- [ ] Paste creates correct variant instance
- [ ] Multiple variants from same component handled correctly

**GitHub Integration:**
- [ ] Public repository connection works
- [ ] Private repository with token works
- [ ] Branch switching reloads tokens
- [ ] Directory path configuration works
- [ ] Error handling for invalid credentials

### Test Files

Create test files with:
- 10-100 components
- Nested component structures (3+ levels)
- Multiple component variants
- Mix of token-referenced and hardcoded values
- Different token types (color, spacing, typography, effects)

---

## 💡 Development Tips

### Performance Best Practices

1. **Always use the optimized component service** (`figma-component-service-optimized.ts`)
2. **Batch Figma API calls** - Never call in a loop
3. **Use persistent cache** - Dramatically speeds up subsequent scans
4. **Implement progress tracking** - Keep UI responsive during long operations
5. **Filter early** - Apply confidence threshold before passing results to UI

### Common Pitfalls

❌ **Don't:** Call `figma.getNodeById()` in a loop  
✅ **Do:** Batch component extraction with proper traversal

❌ **Don't:** Match by value first  
✅ **Do:** Prioritize token reference matching

❌ **Don't:** Return all nested matches  
✅ **Do:** Deduplicate using `nestedMainComponentId`

❌ **Don't:** Scan without caching  
✅ **Do:** Use persistent cache with proper invalidation

### Debugging

**Enable verbose logging:**
```typescript
const DEBUG = true;
if (DEBUG) {
  console.log('[TokenMatch] Detailed debug info...');
}
```

**Inspect cache:**
```typescript
const cache = await figma.clientStorage.getAsync('component_cache_v1');
console.log('Cache contents:', cache);
```

**Test specific components:**
```typescript
// In Figma, select a component and run:
const selected = figma.currentPage.selection[0];
const props = await componentService.extractComponentProperties(selected);
console.log('Component properties:', props);
```

---

## 📊 Performance Metrics

### Target Performance

- **Initial scan (1000 components)**: < 10 seconds
- **Cached scan**: < 200ms
- **Token matching (1 token, 100 components)**: < 100ms
- **UI render (100 results)**: < 50ms
- **Paste to canvas (10 variants)**: < 500ms

### Optimization Priorities

1. **Caching** - Biggest impact (10-100x improvement)
2. **Batch processing** - Prevents UI freezing
3. **Early filtering** - Reduces data processing
4. **Lazy loading** - Deferred rendering for large result sets

See [OPTIMIZATION_STATUS_FINAL.md](./OPTIMIZATION_STATUS_FINAL.md) for achieved metrics.

---

## 🔒 Security Considerations

### GitHub Token Storage

- Stored in `figma.clientStorage` (local to user)
- Never sent to third parties
- Only used for GitHub API requests
- Users can revoke tokens anytime in GitHub settings

### Network Access

- Only allowed domain: `api.github.com`
- Configured in `manifest.json`
- No other external requests permitted

### Data Privacy

- No telemetry or analytics
- No data sent to external servers
- All processing happens locally in Figma

---

## 🗺️ Future Roadmap

See `/roadmap` directory for detailed feature plans:

1. **Missing Token Detector** - Find hardcoded values that should use tokens
2. **Unused Token Finder** - Identify tokens not used in any component
3. **Token Statistics** - Usage analytics and insights
4. **JSON/CSV Export** - Export matching results
5. **Airtable Integration** - Sync token usage data
6. **JSON Folder Upload** - Upload token files directly
7. **Multiple Repository Providers** - GitLab, Bitbucket support
8. **Pre-scan Components** - Cache all components on file open
9. **Exclude Token Paths** - Filter out internal/private tokens

---

## 📖 Additional Resources

### External Documentation

- [Figma Plugin API](https://www.figma.com/plugin-docs/)
- [Create Figma Plugin](https://github.com/yuanqing/create-figma-plugin)
- [Tokens Studio Documentation](https://docs.tokens.studio/)
- [Preact Documentation](https://preactjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)

### Internal References

- Main README: `/README.md`
- Roadmap: `/ROADMAP.md`
- Package config: `/package.json`

---

## 🤝 Contributing

### Adding New Features

1. **Plan**: Create a document in `/roadmap` describing the feature
2. **Implement**: Follow existing patterns in services and UI
3. **Test**: Manually test all scenarios
4. **Document**: Update this guide and relevant docs
5. **Build**: Ensure `npm run build` succeeds

### Updating Documentation

1. Place new docs in `/documentation`
2. Update this guide's index
3. Cross-reference related documents
4. Follow existing markdown formatting
5. Include code examples where helpful

### Code Style

- **TypeScript**: Strict mode enabled
- **Naming**: Descriptive names, camelCase for functions/variables
- **Comments**: Explain "why", not "what"
- **Organization**: Group related functionality
- **Imports**: Organize by external → internal → types

---

## 📞 Support

### Getting Help

1. **Check documentation** - Most questions answered here
2. **Review code comments** - Inline explanations in services
3. **Test in isolation** - Use console logging for debugging
4. **Check Figma console** - `Plugins > Development > Open Console`

### Reporting Issues

Include:
- Steps to reproduce
- Expected vs. actual behavior
- Console errors (if any)
- Figma file structure (component count, nesting levels)
- Token format and structure
- Plugin version

---

**Last Updated:** January 2026  
**Version:** 1.0.0  
**Status:** Production Ready

---

**Made with ❤️ for design systems teams**
