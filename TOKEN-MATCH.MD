# Token Matching Investigation & Implementation Plan

## Current State (Updated: January 2026)

### What Works ✅
- Fetching design tokens from GitHub repository
- Parsing token files (W3C, Token Studio, nested JSON formats)
- Scanning Figma components and extracting resolved values (hex colors, font properties, spacing values)
- Basic UI for selecting tokens and initiating scans
- **Color token matching** — Works reliably via Tokens Studio token references
- **Token reference extraction** — Successfully extracting token paths from Tokens Studio plugin data
- **Path-based matching** — Matching tokens by their path (e.g., `ids.color.element.primary.default`)
- **Footer/UI** — Fixed footer layout, resize handle, scrollbar behavior all working correctly

### What Works Partially ⚠️
- **Typography token matching** — Token reference extraction added, but needs more testing with real tokenized files
- **Spacing token matching** — Path-based matching added (e.g., `ids.spacing.1x`), but token reference extraction from Figma may not capture all spacing properties
- **Effect/Shadow token matching** — Path-based matching added, but token reference extraction needs verification

### What Doesn't Work ❌
- **Spacing token references** — Tokens Studio may store spacing tokens under different keys than we're checking (e.g., `spacing`, `dimension`, `sizing`)
- **Value-based fallback** — When no token reference exists, value matching has low confidence and may produce false positives
- **Composite tokens** — Typography tokens with multiple properties (fontFamily, fontSize, fontWeight combined) may not match correctly

---

## The Core Problem

When Tokens Studio applies a token to a component, it:
1. **Resolves the token value** and applies it to the Figma property (e.g., fill color becomes `#FF0000`)
2. **Stores the token reference** somewhere in Figma's plugin data system

We need to find WHERE and HOW Tokens Studio stores these references.

---

## Investigation Plan

### Phase 1: Discover Tokens Studio Data Format

#### 1.1 Inspect Plugin Data Keys
Create a diagnostic tool to dump all plugin data from a node:

```typescript
// Diagnostic: List all plugin data on a node
function inspectPluginData(node: SceneNode) {
  const results: any = {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    pluginData: {},
    sharedPluginData: {}
  };

  // Get all plugin data keys (our plugin's namespace)
  const pluginDataKeys = node.getPluginDataKeys();
  for (const key of pluginDataKeys) {
    results.pluginData[key] = node.getPluginData(key);
  }

  // Get shared plugin data from known namespaces
  const namespaces = [
    'tokens',
    'tokens-studio', 
    'tokensStudio',
    'figma-tokens',
    'design-tokens',
    'token-studio',
    'com.tokens.studio',
    'tokens.studio'
  ];

  for (const namespace of namespaces) {
    try {
      const keys = node.getSharedPluginDataKeys(namespace);
      if (keys.length > 0) {
        results.sharedPluginData[namespace] = {};
        for (const key of keys) {
          results.sharedPluginData[namespace][key] = node.getSharedPluginData(namespace, key);
        }
      }
    } catch (e) {
      // Namespace doesn't exist
    }
  }

  return results;
}
```

#### 1.2 Test with Known Tokenized Components
1. Create a simple test file in Figma
2. Use Tokens Studio to apply tokens to components
3. Run the diagnostic tool on those components
4. Document the exact namespace and key format

#### 1.3 Research Tokens Studio Documentation
- Check Tokens Studio GitHub repo for plugin data format
- Look for community discussions about data structure
- Review Tokens Studio plugin source if available

### Phase 2: Document Findings

Once we discover the format, document:
- **Namespace**: What namespace does Tokens Studio use?
- **Key format**: How are keys structured? (e.g., `fill`, `fills[0]`, `typography.fontFamily`)
- **Value format**: How are token references stored? (e.g., `{colors.primary.500}`, `$colors.primary.500`)
- **Data structure**: Is it JSON? Plain string? Nested object?

---

## Discovered Tokens Studio Data Format ✅

**CONFIRMED through testing:**

### Actual Format (Option A was correct!)
```
Namespace: "tokens"
Keys: "fill", "stroke", "fontSize", "fontFamily", etc.
Values: "ids.color.element.primary.default" (plain string, no braces or $)
```

### Example from Console Logs:
```
[TokenRef] Found token reference for fill in namespace tokens: "ids.color.element.primary.default"
[TokenRef] Found token reference for fill in namespace tokens: "ids.color.element.secondary.default"
```

### Key Findings:
1. **Namespace**: `tokens` (standard)
2. **Key format**: Property names like `fill`, `stroke` (not indexed like `fills[0]`)
3. **Value format**: Direct token path as string (e.g., `"ids.color.element.primary.default"`)
4. **No special prefixes**: Values don't use `{}` braces or `$` prefix - just plain path strings

---

## How Token Reference Discovery Works

### Overview

When Tokens Studio applies a design token to a Figma element, it does two things:
1. **Resolves the token value** and applies it to the Figma property (e.g., sets fill color to `#267853`)
2. **Stores a reference** to the original token path in Figma's plugin data system

We read this stored reference to determine which token was applied to which property.

### Figma Plugin Data API

Figma provides two types of plugin data storage:

1. **Plugin Data** (`node.getPluginData(key)`)
   - Private to each plugin
   - Only accessible by the plugin that wrote it
   - We cannot read other plugins' private data

2. **Shared Plugin Data** (`node.getSharedPluginData(namespace, key)`)
   - Accessible by any plugin that knows the namespace
   - Tokens Studio uses this for interoperability
   - **This is what we use to read token references**

### The Token Reference Extraction Process

```
┌─────────────────────────────────────────────────────────────────┐
│                     Figma Node (e.g., Rectangle)                │
├─────────────────────────────────────────────────────────────────┤
│  Visual Properties:                                             │
│    fills[0].color = { r: 0.15, g: 0.47, b: 0.33 }  (#267853)   │
│    strokes[0].color = { r: 0, g: 0, b: 0 }                     │
│                                                                 │
│  Shared Plugin Data (namespace: "tokens"):                      │
│    "fill" → "ids.color.element.primary.default"                │
│    "stroke" → "ids.color.border.default"                       │
└─────────────────────────────────────────────────────────────────┘
```

**Step 1: Get Shared Plugin Data Keys**
```typescript
const keys = node.getSharedPluginDataKeys('tokens');
// Returns: ['fill', 'stroke', 'fontSize', ...]
```

**Step 2: Read Token Reference for Each Key**
```typescript
const tokenPath = node.getSharedPluginData('tokens', 'fill');
// Returns: "ids.color.element.primary.default"
```

**Step 3: Associate with Visual Property**
```typescript
// We now know:
// - The node's fill color is #267853
// - That color came from token "ids.color.element.primary.default"
```

### Property Key Mapping

Tokens Studio uses these keys in the `tokens` namespace:

| Figma Property | Plugin Data Key(s) |
|----------------|-------------------|
| Fill color | `fill`, `fills`, `fillColor` |
| Stroke color | `stroke`, `strokes`, `strokeColor`, `borderColor` |
| Font family | `fontFamily`, `fontFamilies` |
| Font size | `fontSize`, `fontSizes` |
| Font weight | `fontWeight`, `fontWeights` |
| Line height | `lineHeight`, `lineHeights` |
| Letter spacing | `letterSpacing` |
| Padding | `padding`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` |
| Gap/Spacing | `itemSpacing`, `gap`, `spacing` |
| Border radius | `borderRadius`, `cornerRadius`, `radius` |
| Box shadow | `boxShadow`, `shadow`, `effects` |
| Width/Height | `width`, `height`, `sizing` |

### Namespaces We Check

While `tokens` is the primary namespace, we also check alternatives for compatibility:

```typescript
const namespaces = [
  'tokens',           // Primary - Tokens Studio standard
  'tokens-studio',    // Alternative
  'tokensStudio',     // CamelCase variant
  'figma-tokens',     // Legacy
  'design-tokens',    // Generic
];
```

### Code Implementation

**In `FigmaComponentService.ts`:**

```typescript
private getTokenReference(node: SceneNode, key: string): string | undefined {
  const namespaces = ['tokens', 'tokens-studio', 'tokensStudio', 'design-tokens'];
  
  for (const namespace of namespaces) {
    try {
      const sharedData = node.getSharedPluginData(namespace, key);
      if (sharedData && sharedData.trim()) {
        return sharedData;  // e.g., "ids.color.element.primary.default"
      }
    } catch (e) {
      // Namespace might not exist, continue
    }
  }
  return undefined;
}
```

**Property-specific extractors try multiple key variations:**

```typescript
private getFillTokenReferences(node: SceneNode, fillIndex: number): string | undefined {
  const keys = [
    `fills[${fillIndex}]`,
    `fill[${fillIndex}]`,
    'fill',
    'fills',
    'fillColor'
  ];
  
  for (const key of keys) {
    const ref = this.getTokenReference(node, key);
    if (ref) return ref;
  }
  return undefined;
}
```

### Matching Process

Once we have token references, matching is straightforward:

```
User searches for: "ids.color.element.primary.default"
                            ↓
We scan all components and their children
                            ↓
For each node with fills/strokes:
  - Extract token reference from plugin data
  - Compare with search token path
                            ↓
Match found when paths match (exact or partial)
```

### Fallback: Value-Based Matching

If no token reference exists (component wasn't tokenized via Tokens Studio):

1. We extract the resolved value (e.g., `#267853`)
2. We compare against the token's resolved value
3. Match with lower confidence (0.7 vs 1.0 for reference match)

This is less reliable because:
- Multiple tokens might resolve to the same color
- Colors might be manually set to match a token value
- Rounding differences in color values

---

## Implementation Plan

### Phase 3: Update Component Scanner

Once we know the format, update `FigmaComponentService`:

```typescript
interface TokenBinding {
  property: string;      // e.g., "fill", "fontSize"
  tokenPath: string;     // e.g., "colors.primary.500"
  resolvedValue: any;    // e.g., "#FF0000"
}

interface ComponentWithTokens extends ComponentProperties {
  tokenBindings: TokenBinding[];
}

// Extract token bindings from Tokens Studio data
extractTokenBindings(node: SceneNode): TokenBinding[] {
  const bindings: TokenBinding[] = [];
  
  // Use discovered namespace and key format
  const NAMESPACE = 'tokens'; // Update after discovery
  
  try {
    const keys = node.getSharedPluginDataKeys(NAMESPACE);
    for (const key of keys) {
      const value = node.getSharedPluginData(NAMESPACE, key);
      if (value) {
        bindings.push({
          property: key,
          tokenPath: this.parseTokenReference(value),
          resolvedValue: this.getResolvedValue(node, key)
        });
      }
    }
  } catch (e) {
    // Handle gracefully
  }
  
  return bindings;
}

// Parse token reference format
parseTokenReference(value: string): string {
  // Handle different formats: {token.path}, $token.path, token.path
  return value
    .replace(/^\{|\}$/g, '')  // Remove braces
    .replace(/^\$/, '')        // Remove $ prefix
    .trim();
}
```

### Phase 4: Update Matching Service

```typescript
// Match by token path (primary) instead of value
matchByTokenPath(
  searchToken: ParsedToken,
  componentBindings: TokenBinding[]
): MatchResult[] {
  const searchPath = searchToken.path.join('.');
  
  return componentBindings
    .filter(binding => {
      const bindingPath = binding.tokenPath.toLowerCase();
      const normalizedSearch = searchPath.toLowerCase();
      
      // Exact match
      if (bindingPath === normalizedSearch) return true;
      
      // Partial match (for nested tokens)
      if (bindingPath.includes(normalizedSearch)) return true;
      if (normalizedSearch.includes(bindingPath)) return true;
      
      return false;
    })
    .map(binding => ({
      property: binding.property,
      tokenPath: binding.tokenPath,
      confidence: binding.tokenPath.toLowerCase() === searchPath.toLowerCase() ? 1.0 : 0.8
    }));
}
```

### Phase 5: Fallback Strategy

If Tokens Studio data is not available (components not tokenized via Tokens Studio):
1. Fall back to value matching (current approach)
2. Mark matches as "value-based" with lower confidence
3. Show user which matches are definitive (token ref) vs. probable (value-based)

---

## Alternative Approaches

If we cannot access Tokens Studio data directly:

### Alternative A: Export Tokens Studio Data
- Ask user to export token assignments from Tokens Studio
- Parse the export file to build a mapping
- Match based on that mapping

### Alternative B: Figma Variables API
- If tokens are applied as Figma Variables (modern approach)
- Use `figma.variables.getVariableById()` to get variable metadata
- Variables may contain token path information

### Alternative C: Manual Annotation
- Allow users to manually annotate which components use which tokens
- Store annotations in our plugin's data
- Use for matching

---

## Next Steps

1. **Create diagnostic command** — Add a "Inspect Selection" button that dumps all plugin data
2. **Test with tokenized file** — Apply tokens with Tokens Studio and run diagnostic
3. **Document findings** — Update this document with discovered format
4. **Implement extraction** — Build the token binding extractor
5. **Update matching** — Use token paths instead of values
6. **Test end-to-end** — Verify matching works correctly

---

## Resources

- [Tokens Studio GitHub](https://github.com/tokens-studio/figma-plugin)
- [Figma Plugin API - Plugin Data](https://www.figma.com/plugin-docs/api/properties/nodes-getsharedplugindata/)
- [Figma Variables API](https://www.figma.com/plugin-docs/api/figma-variables/)

---

## Status

- [x] Phase 1.1: Create diagnostic tool — COMPLETE
- [x] Phase 1.2: Test with tokenized components — COMPLETE (format discovered!)
- [x] Phase 2: Document findings — COMPLETE (see above)
- [x] Phase 3: Update component scanner — COMPLETE (extracting token refs for colors, typography, spacing, effects)
- [x] Phase 4: Update matching service — COMPLETE (matches by path first, value fallback)
- [x] Phase 5: Implement fallback — COMPLETE (value matching with lower confidence)

---

## Recent Implementation (January 2026)

### Token Reference Extraction

**FigmaComponentService** now extracts token references for:

1. **Colors** (`getFillTokenReferences`, `getStrokeTokenReferences`)
   - Keys checked: `fill`, `fills`, `fillColor`, `stroke`, `strokes`, `strokeColor`, `borderColor`
   - ✅ Working well

2. **Typography** (`getTypographyTokenReference`)
   - Keys checked: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `typography`, `text`, `textStyle`
   - ⚠️ Needs more testing

3. **Spacing** (`getSpacingTokenReference`)
   - Keys checked: `width`, `height`, `padding`, `paddingTop/Right/Bottom/Left`, `gap`, `itemSpacing`, `spacing`, `borderRadius`, `borderWidth`
   - ⚠️ May not capture all Tokens Studio keys

4. **Effects** (`getEffectTokenReference`)
   - Keys checked: `boxShadow`, `shadow`, `effects`, `effect`, `dropShadow`, `innerShadow`
   - ⚠️ Needs verification

### Token Matching Service

**TokenMatchingService** now:

1. **Prioritizes token reference matching** — If a component has a token reference, match by path first
2. **Falls back to value matching** — Only if no reference match, try matching by resolved value
3. **Uses path-based inference** — For tokens with paths like `ids.spacing.1x`, tries spacing matching even if type is unknown
4. **Supports partial path matching** — Matches if token path contains or is contained by component's token reference

### Path-Based Matching Helpers

Added helper methods to infer token type from path:
- `looksLikeSpacingToken()` — Checks for keywords: spacing, space, size, sizing, dimension, width, height, padding, margin, gap, radius, border, inset, offset
- `looksLikeEffectToken()` — Checks for keywords: shadow, effect, blur, elevation, drop

---

## Known Issues & Next Steps

### Issues to Investigate

1. **Spacing tokens not matching** — Need to verify what keys Tokens Studio actually uses for spacing properties. May need to run diagnostic tool on spacing-tokenized components.

2. **Typography composite tokens** — When Tokens Studio applies a typography token (with fontFamily + fontSize + fontWeight), need to verify if it stores as one key or multiple.

3. **Figma Variables** — If Tokens Studio syncs to Figma Variables, we may need to check `boundVariables` on nodes instead of/in addition to plugin data.

### Next Steps

1. [ ] Run diagnostic tool on components with spacing/dimension tokens applied
2. [ ] Document actual keys used by Tokens Studio for spacing
3. [ ] Add support for Figma Variables if Tokens Studio uses them
4. [ ] Improve UI feedback when no matches found (show why)
5. [ ] Add confidence indicators to match results

---

## Diagnostic Tool (Removed from UI)

The diagnostic "Token Data Inspector" was removed from the Settings UI for cleaner UX, but the functionality remains in the codebase (`main.ts` has the `inspect-selection` handler). To re-enable:

1. Add the UI back to Settings view in `ui.tsx`
2. The handler checks these namespaces:
   - `tokens`, `tokens-studio`, `tokensStudio`, `figma-tokens`
   - `design-tokens`, `token-studio`, `com.tokens.studio`, `tokens.studio`
   - `io.tokens.studio`, `figmatokens`, `style-dictionary`
   - Generic: `ds`, `design-system`, `theme`, `variables`

3. Also checks for Figma Variable bindings via `boundVariables` property

