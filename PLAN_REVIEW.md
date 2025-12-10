# Plan Review: TokenMatch Advanced Features

## Current Foundation ✅

**What we have:**
- ✅ GitHub API integration (authentication, branch fetching, file retrieval)
- ✅ Basic UI with configuration persistence
- ✅ Token fetching from GitHub repositories
- ✅ TypeScript setup with proper types

**What's missing:**
- ❌ Token parsing (currently just displays raw JSON)
- ❌ Figma component scanning
- ❌ Matching engine
- ❌ Results visualization

---

## Plan Review & Feedback

### ✅ **Strengths of the Plan**

1. **Well-structured phases** - Logical progression from foundation to advanced features
2. **Clear separation of concerns** - Three main services (GitHub, Figma, Matching)
3. **Realistic timeline** - 8 weeks is reasonable for the scope
4. **Security considerations** - Addresses token storage and privacy

### ⚠️ **Potential Challenges & Recommendations**

#### 1. **Figma API Limitations**

**Challenge:** Figma's plugin API has some limitations:
- `figma.getLocalComponent()` doesn't exist - need to use `figma.root.findAll()` and filter
- Component properties are accessed differently than described
- No direct access to component instances in other files

**Recommendation:**
```typescript
// Correct approach for component scanning
function scanComponents() {
  const components = figma.root.findAll(node => 
    node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
  );
  return components;
}
```

#### 2. **Token Format Support**

**Challenge:** Multiple token formats (JSON, YAML, CSS) require different parsers

**Recommendation:** Start with JSON (W3C Design Tokens format), then expand:
- Phase 1: JSON only (W3C standard)
- Phase 2: Add YAML support
- Phase 3: Add CSS variable extraction

#### 3. **Matching Algorithm Complexity**

**Challenge:** Fuzzy matching for colors/typography is non-trivial

**Recommendation:** Start simple, iterate:
- **Phase 1:** Exact value matching
- **Phase 2:** Color proximity (deltaE calculation)
- **Phase 3:** Semantic name matching
- **Phase 4:** ML-based matching (if needed)

#### 4. **Performance Considerations**

**Challenge:** Large component libraries can be slow to scan

**Recommendation:**
- Implement progress reporting (already have UI for this)
- Use `figma.notify()` for user feedback
- Consider pagination/chunking for large scans
- Cache component analysis results

#### 5. **GitHub OAuth vs Personal Access Token**

**Note:** The plan mentions "GitHub OAuth app" but current implementation uses PATs.

**Recommendation:** 
- **Phase 1:** Keep PATs (simpler, already working)
- **Phase 2:** Add OAuth option for better UX (optional)
- OAuth requires a backend server, which adds complexity

---

## Revised Implementation Strategy

### **Phase 1: Enhanced Token Parsing** (Week 1-2)
**Build on existing foundation:**
- ✅ Extend `fetchRepoContents` to handle token file decoding
- ✅ Create `TokenParser` class for W3C Design Tokens format
- ✅ Parse nested token structures and aliases
- ✅ Validate token syntax

**Deliverable:** Parsed token objects ready for matching

### **Phase 2: Component Scanning** (Week 2-3)
**New functionality:**
- ✅ Create `FigmaComponentService` class
- ✅ Implement component discovery (all pages, all components)
- ✅ Extract component properties:
  - Color fills/strokes
  - Text styles
  - Effects (shadows, blurs)
  - Spacing (padding, gaps)
- ✅ Create component property mapping structure

**Deliverable:** Component database with extracted properties

### **Phase 3: Basic Matching Engine** (Week 3-4)
**Core matching logic:**
- ✅ Create `TokenMatchingEngine` class
- ✅ Implement exact value matching
- ✅ Simple color matching (hex/rgb comparison)
- ✅ Typography matching (font family, size, weight)
- ✅ Generate match confidence scores

**Deliverable:** Working matching algorithm with results

### **Phase 4: Results UI** (Week 4-5)
**User interface:**
- ✅ Expand UI to show matching results
- ✅ Component list with match indicators
- ✅ Token-to-component mapping visualization
- ✅ Filtering and search capabilities
- ✅ Export functionality (JSON/CSV)

**Deliverable:** Complete user-facing matching interface

### **Phase 5: Advanced Matching** (Week 5-6)
**Enhanced algorithms:**
- ✅ Color proximity matching (deltaE)
- ✅ Semantic name matching
- ✅ Handle token aliases and references
- ✅ Pattern recognition for complex structures

**Deliverable:** Improved matching accuracy

### **Phase 6: Polish & Optimization** (Week 7-8)
**Refinement:**
- ✅ Performance optimization
- ✅ Error handling improvements
- ✅ User experience enhancements
- ✅ Documentation and testing

**Deliverable:** Production-ready plugin

---

## Technical Architecture Proposal

### **Service Structure**

```typescript
// services/github-token-service.ts
class GitHubTokenService {
  async fetchTokens(repoUrl, branch, filePath): Promise<TokenFile>
  async parseTokens(rawContent, format): Promise<ParsedTokens>
  validateTokenStructure(tokens): ValidationResult
}

// services/figma-component-service.ts
class FigmaComponentService {
  scanAllComponents(): Component[]
  extractComponentProperties(component): ComponentProperties
  getComponentUsageStats(component): UsageStats
}

// services/token-matching-engine.ts
class TokenMatchingEngine {
  matchTokensToComponents(tokens, components): MatchResult[]
  calculateMatchConfidence(token, component): number
  findBestMatches(token, components): MatchResult[]
}
```

### **Data Structures**

```typescript
interface ParsedToken {
  name: string;
  value: any;
  type: 'color' | 'typography' | 'spacing' | 'effect';
  path: string[];
  aliases?: string[];
}

interface ComponentProperties {
  id: string;
  name: string;
  colors: ColorProperty[];
  typography: TypographyProperty[];
  spacing: SpacingProperty[];
  effects: EffectProperty[];
}

interface MatchResult {
  token: ParsedToken;
  component: ComponentProperties;
  confidence: number;
  matchedProperties: string[];
}
```

---

## Immediate Next Steps

1. **Enhance token parsing** - Build on existing fetch functionality
2. **Create component scanner** - Start with simple property extraction
3. **Implement basic matching** - Exact value matching first
4. **Build results UI** - Expand current UI with results panel

---

## Questions to Consider

1. **Scope:** Should we match tokens to component instances or just component definitions?
2. **Multiple files:** Should we scan all pages or just current page?
3. **Token formats:** Which formats are priority? (W3C, Style Dictionary, custom?)
4. **Matching granularity:** Match at property level or component level?
5. **Update strategy:** Should plugin update components when tokens change?

---

## Conclusion

The plan is solid and achievable. The current foundation provides a good starting point. The main recommendations are:

1. Start with simpler matching algorithms and iterate
2. Focus on W3C Design Tokens format first
3. Use existing Figma API patterns (not the non-existent ones)
4. Build incrementally - each phase should produce working functionality
5. Consider performance from the start (large libraries)

**Ready to begin Phase 1 when you are!**

