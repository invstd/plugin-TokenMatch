# Token Matching Investigation & Implementation Plan

## Current State

### What Works ✅
- Fetching design tokens from GitHub repository
- Parsing token files (W3C, Token Studio, nested JSON formats)
- Scanning Figma components and extracting resolved values (hex colors, font properties, spacing values)
- Basic UI for selecting tokens and initiating scans

### What Doesn't Work ❌
- **Cannot access Tokens Studio metadata** — We don't know how/where Tokens Studio stores token references in Figma
- **No token reference extraction** — Components only show resolved values (e.g., `#FF0000`), not token names (e.g., `colors.primary.500`)
- **Matching fails** — Without token references, we can only match by value, which is unreliable and produces false positives

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
- [x] Phase 3: Update component scanner — COMPLETE (already extracting token refs)
- [x] Phase 4: Update matching service — COMPLETE (now matches by path first!)
- [ ] Phase 5: Implement fallback — IN PROGRESS (value matching as fallback)

### Implementation Notes (Phase 1.1)

**Diagnostic Tool Added:**

The plugin now includes a "Token Data Inspector" in the Settings view that:

1. **Inspects selected nodes** and up to 3 levels of children
2. **Checks multiple namespaces** including:
   - `tokens`, `tokens-studio`, `tokensStudio`, `figma-tokens`
   - `design-tokens`, `token-studio`, `com.tokens.studio`, `tokens.studio`
   - `io.tokens.studio`, `figmatokens`, `style-dictionary`
   - Generic: `ds`, `design-system`, `theme`, `variables`

3. **Checks for Figma Variables** bindings (modern approach where Tokens Studio may sync to Variables)

4. **Reports:**
   - Total nodes inspected
   - Nodes with plugin data
   - Namespaces found
   - Plugin data keys found
   - Whether any Figma Variable bindings exist

**To Use:**
1. Open the plugin
2. Go to Settings (gear icon)
3. Scroll down to "Token Data Inspector (Debug)"
4. Select a node in Figma that has Tokens Studio tokens applied
5. Click "Inspect Selection"
6. Review the results to see what namespaces and keys Tokens Studio uses

