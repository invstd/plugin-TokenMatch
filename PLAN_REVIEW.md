# Plan Review: TokenMatch Advanced Features

## Current Foundation ✅

**What we have:**
- ✅ GitHub API integration (authentication, branch fetching, file retrieval)
- ✅ Restyled UI using Figma components and styles
- ✅ Token fetching from GitHub repositories
- ✅ **Working token parser** - Supports W3C, Token Studio, and plain nested JSON formats
- ✅ **Component scanning service** - Can scan all pages, current page, or selected nodes
- ✅ **Token matching service** - Dedicated `TokenMatchingService` with path-based and value-based matching
- ✅ **Tokens Studio integration** - Reads token references from shared plugin data
- ✅ TypeScript setup with proper types
- ✅ Configuration persistence

---

## Updated Roadmap: Token Matching Features

### **Phase 1: Matching Results UI** ✅ COMPLETE
**Goal:** Build UI to display matching results with a dedicated matching service

**Completed:**
- ✅ Refactored matching logic into `services/token-matching-service.ts`
- ✅ Created `TokenMatchingService` class with path-based and value-based matching
- ✅ Matching results view with component list
- ✅ Component display showing name, page, type, matched properties
- ✅ Navigation button ("View") to jump to and select component in Figma
- ✅ Property badges showing values (px, hex), categories, and directions
- ✅ Token reference extraction from Tokens Studio plugin data
- ✅ Support for spacing, padding, border-radius, border-width, effects
- ✅ Figma Variable binding support
- ✅ Debug logging for discovering actual token keys

---

### **Phase 2: Component Collection & Copying** (Next Priority)
**Goal:** Create a new section in the Figma file containing all matched components

**UI Requirement:** Add "Paste to canvas" button in results area

**Tasks:**
1. **Create collection frame function**
   - Add handler in `main.ts` for `create-component-collection` event
   - Create a new frame on current page to hold matched components
   - Name frame appropriately (e.g., "Token Matches: {token-name}")

2. **Copy matched components**
   - For each matched component ID, get the node using `figma.getNodeByIdAsync()`
   - Clone the component using `node.clone()`
   - Position cloned components in a grid layout
   - Handle component instances vs. component definitions
   - Add labels showing which token property matched

3. **Layout and organization**
   - Arrange components in a grid (auto-layout frame)
   - Add section headers using text nodes
   - Handle large numbers of matches

**Deliverable:** "Paste to canvas" button that creates organized collection of matched components

---

### **Phase 3: Unused Tokens Detection** (New Feature)
**Goal:** Display all tokens from the repository that are NOT used on any component in the file

**UI Requirement:** Checkbox below "Find Token" input: "List only unused tokens"

**Behavior:**
- When checked, disables the token search input field
- Scans all components and compares against all fetched tokens
- Shows results: "Results – {n} unused tokens in {n} components"
- List displays token containers (similar to match results but without component name/View button row)
- Each container shows:
  - Token path
  - Token value/type badges

**Tasks:**
1. **Add checkbox UI**
   - Checkbox: "List only unused tokens"
   - When checked, disable the Find Token input
   - Trigger scan when checkbox is toggled on

2. **Implement unused token detection**
   - Scan all components to collect all used token references
   - Compare against all fetched tokens from repository
   - Return list of tokens that have no matches

3. **Display unused tokens**
   - Results header: "Results – {n} unused tokens in {n} components"
   - Token cards without component row (no name, no View button)
   - Show token path and value/type info

**Deliverable:** Checkbox feature to find and display unused tokens

---

### **Phase 4: Export & Polish** (Future)
**Goal:** Export functionality and final polish

**UI Requirement:** Add "Export JSON" button in results area

**Tasks:**
1. **Export matching results**
   - Add "Export JSON" button
   - Export matched components with their token references
   - Include token path, resolved value, component name, property type
   - Download as JSON file

2. **Polish & UX**
   - Progress indicators for long scans
   - Error handling and user feedback
   - Performance optimization for large files

**Deliverable:** Export functionality and production-ready experience

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

// services/figma-component-service.ts ✅
class FigmaComponentService {
  scanAllComponents(): ScanResult
  scanCurrentPage(): ScanResult
  scanNodes(nodes: readonly SceneNode[]): ScanResult
  extractComponentProperties(node: SceneNode, pageName: string): ComponentProperties | null
  getComponentUsageStats(componentId: string): ComponentUsageStats
  // Token reference extraction from Tokens Studio plugin data
  private getTokenReference(node, key): string | undefined
  private getFillTokenReferences(node, fillIndex): string | undefined
  private getSpacingTokenReference(node, property): string | undefined
  private getBorderRadiusTokenReference(node): string | undefined
  private getEffectTokenReference(node, effectIndex): string | undefined
  private getVariableBinding(node, property): string | undefined
}

// services/token-matching-service.ts ✅
class TokenMatchingService {
  matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult
  private matchColor(token, component): MatchDetail[]
  private matchTypography(token, component): MatchDetail[]
  private matchSpacing(token, component, filterType?): MatchDetail[]
  private matchEffects(token, component): MatchDetail[]
  // Path-based inference helpers
  private looksLikeSpacingToken(token): boolean
  private looksLikeBorderRadiusToken(token): boolean
  private looksLikeEffectToken(token): boolean
}
```

### **Functions Needed for Next Phases**

```typescript
// Phase 2: Paste to canvas
on('create-component-collection', async (msg: { 
  token: ParsedToken, 
  componentIds: string[] 
}) => {
  // Create auto-layout frame
  // Clone matched components
  // Add labels with token info
})

// Phase 3: Unused tokens detection
on('find-unused-tokens', async (msg: { scanAll: boolean }) => {
  // Scan all components to collect used token references
  // Compare against all fetched tokens
  // Return tokens with no matches
})

// Phase 4: Export JSON
on('export-results', async (msg: { results: MatchingResult }) => {
  // Format results as JSON
  // Trigger download
})
```

---

## Implementation Guidelines

### **UI Component Requirements**
- ✅ **Always use Figma UI components** from `@create-figma-plugin/ui`
- ✅ **Use Figma CSS variables** for styling (e.g., `var(--figma-color-text)`)
- ✅ **No custom components** - only use provided Figma components
- ✅ **Follow Figma design patterns** - use `Stack`, `Container`, `Inline` for layout

### **Figma API Patterns**
- Use `figma.getNodeByIdAsync()` to retrieve nodes (required for dynamic-page access)
- Use `node.clone()` to copy components
- Use `figma.currentPage.appendChild()` to add to page
- Use auto-layout frames for organized layouts
- Use `figma.notify()` for user feedback

---

## Immediate Next Steps

1. **Phase 2:** Add "Paste to canvas" button and implement component collection
2. **Phase 3:** Add "List only unused tokens" checkbox and unused token detection
3. **Phase 4:** Add "Export JSON" button

---

## Key Decisions Made

1. **Component scanning scope:** ✅ Supports all pages, current page, or selection
2. **Token formats:** ✅ Supports W3C, Token Studio, and plain nested JSON
3. **Matching approach:** ✅ Path-based matching (Tokens Studio references) with value fallback
4. **UI framework:** ✅ Use only Figma UI components, no custom styling
5. **No fuzzy matching:** Precise token selection required, no proximity matching needed
6. **No batch operations:** Single token matching at a time

---

## Conclusion

Phase 1 is complete with full token matching UI. The plugin now:
- Fetches tokens from GitHub repositories
- Scans components and extracts Tokens Studio token references
- Matches tokens by path (primary) or value (fallback)
- Displays results with badges showing values and property types
- Navigates to matched components on canvas

**Next:** Phase 2 - "Paste to canvas" functionality

