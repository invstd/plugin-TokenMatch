# Plan Review: TokenMatch Advanced Features

## Current Foundation ✅

**What we have:**
- ✅ GitHub API integration (authentication, branch fetching, file retrieval)
- ✅ Restyled UI using Figma components and styles
- ✅ Token fetching from GitHub repositories
- ✅ **Working token parser** - Supports W3C, Token Studio, and plain nested JSON formats
- ✅ **Component scanning service** - Can scan all pages, current page, or selected nodes
- ⚠️ **Basic matching logic (incomplete)** - Exact value matching exists in `main.ts` but:
  - No UI to display results (results are emitted but never shown)
  - Matching is inline in handler, not a dedicated service
  - Only exact string comparisons (very limited)
- ✅ TypeScript setup with proper types
- ✅ Configuration persistence

**What's missing:**
- ❌ **Matching results UI** - No way to see which components matched
- ❌ **Dedicated matching service** - Logic is scattered in main.ts handler
- ❌ **Function to create component collection** - No way to copy matched components
- ❌ **Improved matching algorithms** - Only exact matches, no color proximity, fuzzy matching, etc.

---

## Updated Roadmap: Token Matching Features

### **Phase 1: Matching Results UI** (Current Priority)
**Goal:** Build the missing UI to display matching results and refactor matching into a proper service

**Tasks:**
1. **Refactor matching logic into a service**
   - Extract matching logic from `main.ts` handler into `services/token-matching-service.ts`
   - Create `TokenMatchingService` class with proper methods
   - Improve matching algorithms (handle color format variations, better typography matching)
   - Return structured match results with confidence scores

2. **Create matching results view**
   - Add event listener in UI for `scan-result` events
   - Add new UI state/view for displaying scan results
   - Show list of matched components with their properties
   - Display match details (which properties matched, match type)
   - Use Figma UI components: `Stack`, `Text`, `Button`, `IconButton`
   - No custom components - only use `@create-figma-plugin/ui` elements

2. **Component list display**
   - Show component name, page, type (COMPONENT/INSTANCE)
   - Display matched properties (e.g., "Color fill: #FF0000", "Font family: Inter")
   - Add navigation button to jump to component in Figma
   - Use Figma's native styling (CSS variables like `var(--figma-color-text)`)

3. **Results filtering and search**
   - Filter by component type
   - Filter by page
   - Search within results
   - Use Figma `Textbox` and `Dropdown` components

**Deliverable:** Complete matching results UI integrated into existing plugin interface

### **Phase 2: Component Collection & Copying** (Next Priority)
**Goal:** Create a new section in the Figma file containing all matched components

**Tasks:**
1. **Create collection frame function**
   - Add handler in `main.ts` for `create-component-collection` event
   - Create a new frame on current page (or new page) to hold matched components
   - Name frame appropriately (e.g., "Token Matches: {token-name}")

2. **Copy matched components**
   - For each matched component ID, get the node using `figma.getNodeById()`
   - Clone the component using `node.clone()`
   - Position cloned components in a grid layout
   - Handle component instances vs. component definitions
   - Add labels showing which token property matched

3. **Layout and organization**
   - Arrange components in a grid (auto-layout frame)
   - Group by page or component type
   - Add section headers using text nodes
   - Handle large numbers of matches (pagination or scrolling frame)

**Deliverable:** Working function to create organized collection of matched components

### **Phase 3: Enhanced Matching Algorithms** (Future)
**Goal:** Improve matching accuracy and handle edge cases

**Tasks:**
1. **Color proximity matching**
   - Implement deltaE color distance calculation
   - Match colors within a tolerance threshold
   - Handle different color formats (hex, rgb, rgba, hsl)

2. **Semantic name matching**
   - Match token names to component names/properties
   - Handle naming conventions (camelCase, kebab-case, etc.)
   - Fuzzy string matching for similar names

3. **Token alias resolution**
   - Resolve token references before matching
   - Handle nested aliases
   - Show original token path vs. resolved value

**Deliverable:** Improved matching with higher accuracy and fewer false negatives

### **Phase 4: Polish & UX Improvements** (Future)
**Tasks:**
- Progress indicators for long scans
- Error handling and user feedback
- Performance optimization for large files
- Export matching results (JSON/CSV)
- Batch operations (scan multiple tokens at once)

**Deliverable:** Production-ready, polished plugin experience

---

## Technical Architecture

### **Current Service Structure**

```typescript
// services/github-token-service.ts ✅
class GitHubTokenService {
  async fetchBranches(owner, repo, token): Promise<string[]>
  async fetchFileContents(owner, repo, branch, token, path): Promise<FileContent>
  async detectTokenFiles(owner, repo, branch, token, directoryPath): Promise<string[]>
  decodeBase64Content(content: string): string
  parseGitHubUrl(url: string): { owner: string; repo: string } | null
}

// services/token-parser.ts ✅
class TokenParser {
  parse(tokenFile: TokenFile, filePath: string): ParsedTokens
  getTokensByType(type: TokenType): ParsedToken[]
  getTokenByPath(path: string[]): ParsedToken | undefined
}

// services/figma-component-service.ts ✅
class FigmaComponentService {
  scanAllComponents(): ScanResult
  scanCurrentPage(): ScanResult
  scanNodes(nodes: readonly SceneNode[]): ScanResult
  extractComponentProperties(node: SceneNode, pageName: string): ComponentProperties | null
  getComponentUsageStats(componentId: string): ComponentUsageStats
}

// services/token-matching-service.ts ❌ MISSING
// Currently: Matching logic is inline in main.ts handler (lines 514-588)
// Needs: Dedicated service class with proper matching methods
```

### **Current Matching Implementation (Needs Refactoring)**

The matching logic currently exists inline in `main.ts` in the `scan-components-for-token` handler:
- **Colors**: Exact hex/rgba string comparison (very limited)
- **Typography**: Exact fontFamily/fontWeight string comparison
- **Spacing**: Exact dimension value comparison (strips units)
- **Effects**: Basic radius comparison for shadows

**Issues:**
- No handling of color format variations (rgb vs rgba, different hex formats)
- No color proximity matching (deltaE)
- No fuzzy string matching
- Results are emitted but UI doesn't listen for them
- No confidence scoring
- Logic should be in a dedicated service class

### **New Functions Needed**

```typescript
// In src/main.ts - New event handlers
on('create-component-collection', async (msg: { 
  token: ParsedToken, 
  componentIds: string[] 
}) => {
  // Create frame and copy matched components
})

// In src/ui.tsx - New UI state and components
const [matchingResults, setMatchingResults] = useState<MatchResult | null>(null);
const [showResults, setShowResults] = useState(false);

// Results view using Figma UI components
<Stack space="medium">
  <Text>Matched Components ({results.totalMatches})</Text>
  {results.matchingComponents.map(comp => (
    <div> {/* Use Figma styling */}
      <Text>{comp.name}</Text>
      <Button onClick={() => navigateToComponent(comp.id)}>View</Button>
    </div>
  ))}
  <Button onClick={() => createCollection(token, componentIds)}>
    Create Collection
  </Button>
</Stack>
```

### **Data Structures (Already Defined)**

```typescript
// types/tokens.ts ✅
interface ParsedToken {
  name: string;
  value: any;
  type: TokenType;
  path: string[];
  description?: string;
  aliases?: string[];
}

// types/components.ts ✅
interface ComponentProperties {
  id: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE';
  colors: ColorProperty[];
  typography: TypographyProperty[];
  spacing: SpacingProperty[];
  effects: EffectProperty[];
}

// New: Match result structure (already used in main.ts)
interface MatchResult {
  token: ParsedToken;
  matchingComponents: Array<{
    id: string;
    name: string;
    page: string;
    type: string;
    matches: string[];
  }>;
  totalMatches: number;
  totalComponentsScanned: number;
}
```

---

## Implementation Guidelines

### **UI Component Requirements**
- ✅ **Always use Figma UI components** from `@create-figma-plugin/ui`
- ✅ **Use Figma CSS variables** for styling (e.g., `var(--figma-color-text)`)
- ✅ **No custom components** - only use provided Figma components
- ✅ **Follow Figma design patterns** - use `Stack`, `Container`, `Inline` for layout

### **Figma API Patterns**
- Use `figma.getNodeById()` to retrieve nodes
- Use `node.clone()` to copy components
- Use `figma.currentPage.appendChild()` to add to page
- Use auto-layout frames for organized layouts
- Use `figma.notify()` for user feedback

---

## Immediate Next Steps

1. **Add matching results UI** - Display scan results in plugin UI using Figma components
2. **Implement component collection** - Create function to copy matched components to a new frame
3. **Add navigation** - Allow users to jump to matched components in Figma
4. **Test with real data** - Verify with actual token files and component libraries

---

## Key Decisions Made

1. **Component scanning scope:** ✅ Supports all pages, current page, or selection (already implemented)
2. **Token formats:** ✅ Supports W3C, Token Studio, and plain nested JSON (already implemented)
3. **Matching granularity:** ✅ Matches at property level (colors, typography, spacing, effects)
4. **UI framework:** ✅ Use only Figma UI components, no custom styling
5. **Collection strategy:** ⏳ Create new frame with auto-layout grid of matched components

---

## Conclusion

The foundation is solid with token parsing and component scanning complete. The next phase focuses on:

1. **User-facing results** - Show what was found in a clear, navigable interface
2. **Actionable outcomes** - Allow users to collect matched components in one place
3. **Figma-native experience** - Use only Figma UI components and patterns

**Ready to implement Phase 1: Matching Results UI!**

