# Token Matching in Components

This document explains how TokenMatch matches design tokens against Figma component properties with high accuracy and confidence scoring.

## Table of Contents

- [Overview](#overview)
- [Component Scanning](#component-scanning)
- [Matching Strategies](#matching-strategies)
- [Confidence Scoring](#confidence-scoring)
- [Token Types & Matching](#token-types--matching)
- [Nested Component Handling](#nested-component-handling)
- [Performance & Caching](#performance--caching)
- [Troubleshooting](#troubleshooting)

---

## Overview

TokenMatch uses a sophisticated multi-strategy matching system to find components that use specific design tokens. It scans Figma components, extracts their properties (colors, spacing, typography, etc.), and matches them against token values with confidence scoring.

### Matching Workflow

```
User Selects Token
    ↓
Scan Components (with caching)
    ↓
Extract Properties (colors, spacing, typography, effects)
    ↓
Priority-Based Matching:
  1. Token Reference Match (confidence: 1.0)
  2. Semantic Token Chain (confidence: 0.95)
  3. Partial Path Match (confidence: 0.9)
  4. Value-Based Match (confidence: 0.7)
    ↓
Filter by Confidence (≥0.85)
    ↓
Deduplicate Nested Components
    ↓
Group by Main Component
    ↓
Display Results
```

---

## Component Scanning

### Scan Modes

TokenMatch offers three scan modes to balance speed and coverage:

#### 1. All Pages
Scans every component on every page in the Figma file.

**Use when:**
- Doing comprehensive token audits
- Finding all usages across the entire file
- Initial discovery of token adoption

**Performance:** 
- First scan: 5-15 seconds (cached)
- Subsequent scans: 50-200ms (from cache)

#### 2. Current Page Only
Scans only components on the active page.

**Use when:**
- Working on a specific page
- Iterating quickly during design
- Testing token application

**Performance:** 1-3 seconds

#### 3. Selection Only
Scans only selected nodes and their descendants.

**Use when:**
- Checking specific components
- Verifying token usage on variants
- Quick spot checks

**Performance:** <1 second

### What Gets Scanned

The scanner extracts properties from:

- **Component nodes** (`COMPONENT`)
- **Component sets** (`COMPONENT_SET`)
- **Component instances** (`INSTANCE`)
- **All nested children** within components

### Property Extraction

For each component, TokenMatch extracts:

1. **Colors**
   - Fill colors from all layers
   - Stroke colors from all layers
   - Nested child fill/stroke colors

2. **Spacing**
   - Width and height
   - Padding (all sides)
   - Gap (item spacing, counter-axis spacing)
   - Border radius (uniform and per-corner)
   - Border width (stroke weight)

3. **Typography**
   - Font family
   - Font size
   - Font weight
   - Line height
   - Letter spacing

4. **Effects**
   - Drop shadows
   - Inner shadows
   - Layer blur
   - Background blur

### Token Reference Extraction

TokenMatch reads **Tokens Studio plugin data** stored on each Figma node:

```typescript
// Examples of token references stored in Figma
node.getSharedPluginData('tokens', 'fill')          // "color.primary.500"
node.getSharedPluginData('tokens', 'borderRadius')  // "radius.md"
node.getSharedPluginData('tokens', 'spacing')       // "spacing.lg"
```

This data is automatically added when you apply tokens using the Tokens Studio plugin.

### Recursive Child Scanning

**Critical Feature:** TokenMatch now recursively scans nested children within components.

**Why this matters:**

Many Figma components are structured with nested layers:

```
Button Component
├── Frame (auto-layout)
│   ├── Icon (has stroke color)     ← Token is here
│   └── Text Label                   ← Token is here
└── Background Rectangle (has fill)  ← Token is here
```

**Before (v0.x):** Only scanned the top-level Button node → missed tokens on nested layers  
**Now (v1.0):** Recursively scans ALL nested children → finds tokens everywhere

This is especially important for:
- **Border composite tokens** (stroke often on nested frames/shapes)
- **Icon colors** (inside nested elements)
- **Complex components** with deep nesting

---

## Matching Strategies

TokenMatch uses a **priority-based matching system** that tries multiple strategies in order of confidence.

### Strategy 1: Token Reference Matching (Highest Confidence)

**How it works:** Compares the token name directly against the token reference stored in Figma plugin data.

**Example:**

```typescript
// Token from repository
{
  path: ['color', 'primary', '500'],
  name: 'color.primary.500',
  value: '#3B82F6'
}

// Component property
{
  type: 'fill',
  hex: '#3B82F6',
  tokenReference: 'color.primary.500'  // ← Direct match!
}
```

**Confidence:** `1.0` (100%)

**Matching Logic:**
```typescript
// Normalize both paths
const tokenPath = token.path.join('.').toLowerCase();
const componentRef = component.tokenReference.toLowerCase();

if (tokenPath === componentRef ||
    tokenPath.endsWith('.' + componentRef) ||
    componentRef.endsWith('.' + tokenPath)) {
  return { match: true, confidence: 1.0 };
}
```

---

### Strategy 2: Semantic Token Chain (High Confidence)

**How it works:** Resolves token references through the token system.

**Example:**

```typescript
// Token chain in repository
{
  'color.primary': '#3B82F6'
}
{
  'button.background': '{color.primary}'  // ← References another token
}

// Component property
{
  tokenReference: 'button.background'  // ← Matches the semantic token
}
```

**Confidence:** `0.95` (95%)

This handles semantic/alias tokens that reference other tokens.

---

### Strategy 3: Partial Path Matching (Medium-High Confidence)

**How it works:** Matches on partial token paths.

**Example:**

```typescript
// Token
{
  path: ['kds', 'color', 'primary', '500'],
  name: 'kds.color.primary.500'
}

// Component reference
{
  tokenReference: 'color.primary.500'  // ← Partial match (missing 'kds' prefix)
}
```

**Confidence:** `0.9` (90%)

Useful when token prefixes differ between repository and Figma.

---

### Strategy 4: Value-Based Matching (Fallback)

**How it works:** Compares actual values when token references are missing.

**Example:**

```typescript
// Token
{
  name: 'color.primary.500',
  value: '#3B82F6'
}

// Component (no token reference stored)
{
  type: 'fill',
  hex: '#3B82F6'  // ← Value matches!
}
```

**Confidence:** `0.7` (70%)

**When this happens:**
- Component doesn't have Tokens Studio plugin data
- Token was hard-coded in Figma
- Token was applied manually without the plugin

**Normalization for value matching:**

- **Colors:** Converted to hex format, case-insensitive
  - `#3B82F6` = `#3b82f6`
  - `rgb(59, 130, 246)` → `#3B82F6`
  
- **Dimensions:** Converted to pixels
  - `16px` = `16`
  - `1rem` → `16` (assuming 16px base)
  - `0.5` tolerance for floating point

- **Typography:** Exact match on font names, tolerant on sizes

---

## Confidence Scoring

### Confidence Levels

| Confidence | Strategy | Meaning |
|------------|----------|---------|
| `1.0` | Token reference match | Exact token reference found in plugin data |
| `0.95` | Semantic token chain | Resolved through token reference chain |
| `0.9` | Partial path match | Partial token path matched |
| `0.85` | High-confidence value | Value match with supporting evidence |
| `0.7` | Value-based match | Value matches, but no token reference |

### Filtering Threshold

**Default minimum confidence:** `0.85`

Only matches with confidence ≥ 0.85 are shown in results.

**Why 0.85?**
- Filters out most false positives
- Includes high-confidence value matches
- Balances precision and recall

### Confidence Calculation

For a component with multiple matching properties:

```typescript
// Component has 3 matching properties
matches = [
  { confidence: 1.0 },   // Token reference match
  { confidence: 0.95 },  // Semantic chain
  { confidence: 1.0 }    // Another token reference
];

// Average confidence
componentConfidence = (1.0 + 0.95 + 1.0) / 3 = 0.983;
```

---

## Token Types & Matching

### Color Tokens

**Properties Matched:**
- Fill colors
- Stroke colors (including nested children)

**Matching Process:**

1. **Token reference match** - Check plugin data for color/fill/stroke references
2. **Value match** - Compare hex values (normalized)

**Example Match:**

```typescript
Token: { name: 'color.primary.500', value: '#3B82F6', type: 'color' }

Component Color Property:
{
  type: 'fill',
  hex: '#3B82F6',
  tokenReference: 'color.primary.500',
  nodeName: 'Background',  // Which nested node has this color
  nodeId: '123:456'
}

Match: ✓ (confidence: 1.0)
```

---

### Spacing Tokens

**Properties Matched:**
- Width
- Height
- Padding (top, right, bottom, left)
- Gap (item spacing)
- Border radius
- Border width

**Matching Process:**

1. **Token reference match** - Check for spacing/dimension references
2. **Value match** - Compare numeric values (with 0.5px tolerance)

**Example Match:**

```typescript
Token: { name: 'spacing.md', value: '16px', type: 'spacing' }

Component Spacing Property:
{
  type: 'padding',
  value: 16,
  unit: 'px',
  tokenReference: 'spacing.md',
  nodeName: 'Button Frame'
}

Match: ✓ (confidence: 1.0)
```

---

### Border Composite Tokens

**Special Handling:** Border tokens combine color and width.

**Token Structure:**

```json
{
  "border": {
    "primary": {
      "value": {
        "color": "{color.primary.500}",
        "width": "{border-width.thin}",
        "style": "solid"
      },
      "type": "border"
    }
  }
}
```

**Matching Process:**

1. **Extract inner references** - Get `color` and `width` token references
2. **Match color** - Find stroke color matching the color reference
3. **Match width** - Find border width matching the width reference
4. **Aggregate** - Both must match for the composite token to match

**Example Match:**

```typescript
Token: {
  name: 'border.primary',
  value: {
    color: '{color.primary.500}',
    width: '{border-width.thin}'
  }
}

Component Properties:
[
  {
    type: 'stroke',
    hex: '#3B82F6',
    tokenReference: 'color.primary.500',
    nodeName: 'Inner Frame'  // ← Nested child
  },
  {
    type: 'borderWidth',
    value: 1,
    tokenReference: 'border-width.thin',
    nodeName: 'Inner Frame'  // ← Same nested child
  }
]

Match: ✓ (confidence: 0.95) - via border composite
```

---

### Typography Tokens

**Properties Matched:**
- Font family
- Font size
- Font weight
- Line height
- Letter spacing

**Matching Process:**

1. **Composite typography token** - Check for full typography token reference
2. **Individual properties** - Match font family, size, weight separately
3. **Value match** - Compare font names and numeric values

**Example Match:**

```typescript
Token: {
  name: 'typography.heading1',
  value: {
    fontFamily: 'Inter',
    fontSize: '32px',
    fontWeight: '700',
    lineHeight: '1.2'
  }
}

Component Typography Property:
{
  fontFamily: 'Inter',
  fontSize: 32,
  fontWeight: 700,
  tokenReference: 'typography.heading1'
}

Match: ✓ (confidence: 1.0)
```

---

### Effect Tokens (Shadows)

**Properties Matched:**
- Drop shadows
- Inner shadows
- Layer blur
- Background blur

**Matching Process:**

1. **Token reference match** - Check for boxShadow/shadow references
2. **Value match** - Compare shadow properties (offset, blur, spread, color)

**Example Match:**

```typescript
Token: {
  name: 'shadow.card',
  value: '0 4px 12px rgba(0, 0, 0, 0.1)'
}

Component Effect:
{
  type: 'drop-shadow',
  offset: { x: 0, y: 4 },
  blur: 12,
  color: { r: 0, g: 0, b: 0, a: 0.1 },
  tokenReference: 'shadow.card'
}

Match: ✓ (confidence: 1.0)
```

---

## Nested Component Handling

### The Problem

When a component contains instances of other components, we get cascading matches:

```
Button Component (parent)
├── Icon Instance  ← Uses color.primary
└── Text Instance  ← Uses typography.body

Match results WITHOUT deduplication:
- Button (matched via nested children) ← False positive
- Icon (direct match) ✓
- Text (direct match) ✓
```

### Deduplication Logic

TokenMatch filters out "indirect" matches where a parent only matches because of its children:

```typescript
// A match is kept if:
1. It has a direct match (property on the component itself)
   OR
2. It's a nested component with a direct match

// A match is filtered out if:
- It only matches via nested children
- AND it's a parent component/component set
```

### Result Grouping

Matches are grouped by main component:

```typescript
{
  mainComponentName: "Button",
  mainComponentId: "123:0",
  variants: [
    { name: "Size=Small, State=Default", matches: [...] },
    { name: "Size=Medium, State=Default", matches: [...] },
    { name: "Size=Large, State=Default", matches: [...] }
  ]
}
```

This provides a clean, organized view of which component variants use the token.

---

## Performance & Caching

### Scan Performance

**Without cache:**
- 1000 components: ~5-10 seconds
- 5000 components: ~20-30 seconds

**With persistent cache:**
- Subsequent scans: ~50-200ms (100-200x faster)

### Caching Strategy

#### Memory Cache
- Lives for the plugin session
- Cleared on plugin restart

#### Persistent Cache
- Stored in `figma.clientStorage`
- Survives plugin restarts
- Invalidated when document structure changes

**Cache Key Structure:**

```typescript
{
  key: 'component_cache_v1',
  value: {
    'all_pages_color': {
      components: [...],
      timestamp: 1234567890,
      documentHash: 'abc123'
    },
    'Components_spacing': { ... }
  }
}
```

**Cache Invalidation:**

Cache is invalidated when:
- Document structure hash changes (components added/removed/renamed)
- Manual "Clear Cache" action
- Cache is older than 5 minutes (for "All Pages" mode)

### Progress Tracking

For long scans, progress updates are emitted:

```typescript
onProgress: (progress) => {
  console.log(`Scanning: ${progress.percentage}%`);
  console.log(`Scanned: ${progress.scannedComponents}/${progress.totalComponents}`);
}
```

---

## Troubleshooting

### Issue: "No matches found"

**Possible causes:**
1. Components don't have token references applied
2. Wrong scan scope selected
3. Token value doesn't match component value

**Solutions:**

1. **Check token references:**
   - Select a component in Figma
   - Open Tokens Studio plugin
   - Verify tokens are applied

2. **Try different scan modes:**
   - Start with "All Pages" for comprehensive search
   - If found, narrow down to specific pages

3. **Check token values:**
   - Verify token value matches what's in Figma
   - Try a different token that you know is used

---

### Issue: "Too many false positives"

**Cause:** Value-based matching finding color coincidences

**Solutions:**

1. Apply tokens using Tokens Studio plugin (adds token references)
2. Use more specific tokens (less likely to have value collisions)
3. Confidence threshold is already at 0.85 (can't go higher without custom build)

---

### Issue: "Border tokens not matching"

**Cause:** Border strokes are often on nested children, not the top-level component

**Solution:**

✅ **Already Fixed in v1.0!**

The scanner now recursively scans nested children, so border composite tokens should match correctly.

**Verify it's working:**
1. Check console output for:
   ```
   Component stroke colors: [{...}]  ← Should NOT be empty
   Component borderWidths: [{...}]   ← Should NOT be empty
   ```

2. If still empty, the component might not have any strokes applied at all

---

### Issue: "Variant matches missing"

**Cause:** Variants are hidden or on different pages

**Solutions:**

1. Ensure all variants are on the same page as the main component
2. Use "All Pages" mode to scan across the entire file
3. Check if variants are actually using the token (select and verify in Tokens Studio)

---

## Best Practices

### 1. Use Tokens Studio Plugin

**Why:** Adds token references to Figma plugin data, enabling high-confidence matching.

**How:**
1. Install Tokens Studio plugin
2. Load your token JSON
3. Apply tokens to components using the plugin UI

### 2. Apply Tokens at the Component Level

When possible, apply tokens to the main component, not instances:

✅ **Good:** Apply token to `Button` component  
❌ **Avoid:** Apply token to individual button instances

### 3. Use Semantic Tokens

Create semantic tokens that reference core tokens:

```json
{
  "color": {
    "blue-500": "#3B82F6"
  },
  "button": {
    "primary": {
      "background": "{color.blue-500}"
    }
  }
}
```

Benefits:
- Clearer intent
- Easier to update
- Better matching

### 4. Consistent Naming

Use consistent naming between your token repository and Figma:

**Token name in repo:** `color.primary.500`  
**Token reference in Figma:** `color.primary.500`

Avoid:
- Different separators (`.` vs `-`)
- Different casing (`camelCase` vs `kebab-case`)
- Different prefixes (`kds.color` vs `color`)

### 5. Clear Cache When Debugging

If results seem stale:

1. Click "Clear Cache" in settings
2. Re-run the scan
3. Verify results

---

## API Reference

### TokenMatchingService

```typescript
class TokenMatchingService {
  // Match a token against scanned components
  matchTokenToComponents(
    token: ParsedToken,
    components: ComponentProperties[]
  ): MatchingResult;
  
  // Filter out nested component false positives
  deduplicateMatches(matches: ComponentMatch[]): ComponentMatch[];
  
  // Group matches by main component
  groupByMainComponent(matches: ComponentMatch[]): GroupedMatch[];
}
```

### Match Result Types

```typescript
interface MatchingResult {
  token: ParsedToken;
  matchingComponents: ComponentMatch[];
  totalMatches: number;
}

interface ComponentMatch {
  component: ComponentProperties;
  matches: MatchDetail[];
  confidence: number;  // Average of all match confidences
}

interface MatchDetail {
  property: string;              // "fill color", "border-width", etc.
  propertyType: 'color' | 'typography' | 'spacing' | 'effect';
  matchedValue: string;          // "#3B82F6 ← color.primary.500"
  tokenValue: string;            // "color.primary.500"
  confidence: number;            // 0.7 - 1.0
}
```

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Related Docs**: [Token Fetching](./TOKEN-FETCHING.md), [Component Pasting](./COMPONENT-PASTING.md)
