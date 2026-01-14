# Component Matching & Paste-to-Canvas Improvements

## Overview

This document outlines improvements to the token-component matching system to address three key issues:
1. **Nested Component Deduplication** - Filter out container components that only match via nested children
2. **Paste-to-Canvas Variant Preservation** - Show affected variants, not default variants
3. **Layout Improvements** - Better spacing for absolute positioned elements

---

## Problem Analysis

### Issue 1: Nested Component Deduplication

**Current Behavior:** When AbcButton uses a token and AbcCard contains AbcButton, both appear in results.

**Root Cause:** The current deduplication (main.ts:886-929) extracts component names from property paths (e.g., `"KdsCard → KdsButton → fill"`) and checks against `mainComponentName`. However:
- Property paths use Figma layer names, not `mainComponentName`
- An instance of "KdsButton" might be named "Button" or "CTA" in the design
- String matching fails because names don't match

**Solution:** Track actual `mainComponentId` values through the matching process for reliable deduplication.

### Issue 2: Paste Shows Default Variant Instead of Affected Variant

**Current Behavior:** Search results correctly identify affected variants, but paste shows default variant.

**Root Cause:** The paste handler (main.ts:1278-1312) looks for `variant.name.includes('=')` to find the specific variant. This fails because:
- For INSTANCE nodes, `name` is the instance name, not the variant specifier
- Only COMPONENT nodes have names like `"State=Active, Size=Large"`
- The actual variant identifier isn't captured during scanning

**Solution:** Capture `variantName` (the actual variant component name) during scanning and pass it through to the paste handler.

### Issue 3: Layout Clipping

**Current Behavior:** Components with absolute positioned children may clip or overlap.

**Root Cause:** Fixed 150px max size and 40px padding may be insufficient for complex components.

**Solution:** Increase padding and max size values for better presentation.

---

## Implementation Plan

### Phase 1: Improved Deduplication

#### 1.1 Update MatchDetail Interface
**File:** `services/token-matching-service.ts` (line 14)

Add fields to track nested component IDs:
```typescript
export interface MatchDetail {
  property: string;
  propertyType: 'color' | 'typography' | 'spacing' | 'effect';
  matchedValue: string;
  tokenValue: string;
  confidence: number;
  nestedMainComponentId?: string;  // NEW: mainComponentId of nested component
}
```

#### 1.2 Capture Component IDs in Recursive Matching
**File:** `services/token-matching-service.ts` (lines 125-137)

When building property paths for child matches, also capture the `mainComponentId`:
```typescript
for (const match of childMatches) {
  matchDetails.push({
    ...match,
    property: `${child.name} → ${match.property}`,
    nestedMainComponentId: child.mainComponentId  // Capture the main component ID
  });
}
```

#### 1.3 Replace Deduplication Logic
**File:** `src/main.ts` (lines 883-929)

New algorithm:
1. Build map of `mainComponentId → components` that have direct matches (no `→` in property)
2. Filter out components where ALL matches have `nestedMainComponentId` that exists in the direct matches map
3. Keep components that have at least one direct match OR at least one nested match pointing to a non-direct-match component

```typescript
// Build map of mainComponentIds with direct matches
const directMatchIds = new Set<string>();
for (const match of matchingResult.matchingComponents) {
  const hasDirectMatch = match.matches.some(m => !m.property.includes(' → '));
  if (hasDirectMatch && match.component.mainComponentId) {
    directMatchIds.add(match.component.mainComponentId);
  }
}

// Filter out containers that only match via already-matched nested components
const filteredComponents = matchingResult.matchingComponents.filter(match => {
  const hasDirectMatch = match.matches.some(m => !m.property.includes(' → '));
  if (hasDirectMatch) return true;

  // Keep if any nested match points to a component NOT in directMatchIds
  return match.matches.some(m => {
    if (!m.property.includes(' → ')) return false;
    return !m.nestedMainComponentId || !directMatchIds.has(m.nestedMainComponentId);
  });
});
```

---

### Phase 2: Variant Preservation

#### 2.1 Add variantName to ComponentProperties
**File:** `types/components.ts` (line 58)

```typescript
export interface ComponentProperties {
  // ... existing fields ...
  mainComponentId?: string;
  variantName?: string;  // NEW: Actual variant string (e.g., "State=Active, Size=Large")
  // ...
}
```

#### 2.2 Capture variantName During Scanning
**File:** `services/figma-component-service-optimized.ts` (lines 578-612)

For COMPONENT nodes in a COMPONENT_SET:
```typescript
if (node.type === 'COMPONENT') {
  const component = node as ComponentNode;
  if (component.parent?.type === 'COMPONENT_SET') {
    properties.mainComponentName = component.parent.name;
    properties.mainComponentId = component.parent.id;
    properties.variantName = component.name;  // "State=Active, Size=Large"
  }
}
```

For INSTANCE nodes:
```typescript
if (node.type === 'INSTANCE') {
  const instance = node as InstanceNode;
  const mainComp = instance.mainComponent;
  if (mainComp?.parent?.type === 'COMPONENT_SET') {
    properties.mainComponentName = mainComp.parent.name;
    properties.mainComponentId = mainComp.parent.id;
    properties.variantName = mainComp.name;  // Capture from main component
  }
}
```

#### 2.3 Update MatchingComponent Interface
**File:** `src/main.ts` (line 1040)

```typescript
interface MatchingComponent {
  // ... existing fields ...
  variantName?: string;  // NEW
}
```

#### 2.4 Pass variantName in Formatted Results
**File:** `src/main.ts` (line 946)

```typescript
matchingComponents: filteredComponents.map(match => ({
  // ... existing fields ...
  variantName: match.component.variantName,  // NEW
})),
```

#### 2.5 Update Paste Handler to Use variantName
**File:** `src/main.ts` (lines 1278-1312)

```typescript
} else if (node.type === 'COMPONENT_SET') {
  const componentSet = node as ComponentSetNode;
  let targetVariant: ComponentNode | null = null;

  // Priority 1: Use variantName (most reliable)
  if (variant.variantName) {
    for (const child of componentSet.children) {
      if (child.type === 'COMPONENT' && child.name === variant.variantName) {
        targetVariant = child as ComponentNode;
        break;
      }
    }
  }

  // Priority 2: Try node name if it has variant syntax
  if (!targetVariant && variant.name.includes('=')) {
    for (const child of componentSet.children) {
      if (child.type === 'COMPONENT' && child.name === variant.name) {
        targetVariant = child as ComponentNode;
        break;
      }
    }
  }

  // Fallback: default variant
  if (!targetVariant) {
    targetVariant = componentSet.defaultVariant || componentSet.children[0];
  }
  // ... rest of handling
}
```

---

### Phase 3: Layout Improvements

#### 3.1 Increase Container Padding
**File:** `src/main.ts` (lines 1228-1233)

```typescript
instancesContainer.paddingTop = 60;     // Was 40
instancesContainer.paddingBottom = 60;  // Was 40
instancesContainer.paddingLeft = 60;    // Was 40
instancesContainer.paddingRight = 60;   // Was 40
instancesContainer.itemSpacing = 20;    // Was 12
instancesContainer.counterAxisSpacing = 20;  // Was 12
```

#### 3.2 Increase Max Size
**File:** `src/main.ts` (line 1326)

```typescript
const maxSize = 200;  // Was 150
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `types/components.ts` | Add `variantName` field to `ComponentProperties` |
| `services/token-matching-service.ts` | Add `nestedMainComponentId` to `MatchDetail`, update child match handling |
| `services/figma-component-service-optimized.ts` | Capture `variantName` during scanning |
| `src/main.ts` | Update deduplication logic, `MatchingComponent` interface, formatted results, paste handler, and layout values |

---

## Testing Scenarios

### Deduplication
1. Create `AbcButton` with token reference
2. Create `AbcCard` containing `AbcButton` instance
3. Search for token → Only `AbcButton` should appear
4. Add direct token usage to `AbcCard` → Both should appear

### Variant Preservation
1. Create component set with variants (State=Active, State=Disabled)
2. Add token to only `State=Active` variant
3. Search for token
4. Paste to canvas → `State=Active` variant should appear (not default)

### Layout
1. Paste component with absolute positioned tooltip/dropdown
2. Verify no clipping
3. Verify adequate spacing between components

---

## Implementation Sequence

1. **Phase 1** - Deduplication improvements (affects search results)
2. **Phase 2** - Variant preservation (affects paste behavior)
3. **Phase 3** - Layout improvements (cosmetic)

Each phase can be tested independently before proceeding to the next.
