# Component Pasting to Canvas

This document explains how TokenMatch allows you to paste matching component variants directly to the Figma canvas for quick review and iteration.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Pasting Modes](#pasting-modes)
- [Layout Strategies](#layout-strategies)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

After finding components that use a specific token, TokenMatch provides a "Paste to Canvas" feature that lets you quickly place all matching component variants onto your current page for visual inspection and testing.

This is especially useful for:
- **Token updates** - See all affected components in one view
- **Design reviews** - Present all variants using a token
- **Documentation** - Create visual references of token usage
- **QA testing** - Verify token application across variants

---

## How It Works

### Basic Workflow

```
User matches a token
    ↓
Match results displayed (grouped by component)
    ↓
User clicks "Paste to Canvas" on a component group
    ↓
TokenMatch creates instances of all variants
    ↓
Variants arranged in a grid on the canvas
    ↓
User can inspect, annotate, or export
```

### What Gets Pasted

When you click "Paste to Canvas":

1. **Creates instances** of each matching variant
2. **Arranges in a grid** with consistent spacing
3. **Adds to current page** at the viewport center
4. **Selects all pasted instances** for easy manipulation

### Instance vs Component

**Important:** TokenMatch pastes **instances** (not component copies), so:

✅ **Instances remain linked** to the main component  
✅ **Updates to the component** automatically reflect in instances  
✅ **Maintains design system integrity**  

---

## Pasting Modes

### 1. Paste Single Component Group

**When:** Clicking "Paste to Canvas" on a specific component group in results

**Result:** Pastes all variants of that component only

**Example:**

```
Button Component (24 variants)
├── Size=Small, State=Default
├── Size=Small, State=Hover
├── Size=Small, State=Active
├── Size=Medium, State=Default
... (20 more variants)

[Paste to Canvas] ← Pastes all 24 button variants
```

### 2. Paste All Results

**When:** Clicking "Paste All to Canvas" (if available)

**Result:** Pastes all matching components and their variants

**Example:**

```
Match results for "color.primary.500":
- Button (24 variants)
- Input (16 variants)
- Checkbox (8 variants)

[Paste All] ← Pastes 48 total variants across 3 components
```

---

## Layout Strategies

### Grid Layout

**Default layout:** Variants are arranged in a grid with consistent spacing.

**Layout Algorithm:**

```typescript
// Calculate grid dimensions
const columns = Math.ceil(Math.sqrt(variantCount));
const rows = Math.ceil(variantCount / columns);

// Spacing
const horizontalGap = 100;  // px between variants
const verticalGap = 100;    // px between rows

// Position each variant
for (let i = 0; i < variants.length; i++) {
  const col = i % columns;
  const row = Math.floor(i / columns);
  
  const x = startX + (col * (maxWidth + horizontalGap));
  const y = startY + (row * (maxHeight + verticalGap));
  
  placeVariant(variant, x, y);
}
```

**Visual Example:**

```
Viewport Center
    ↓
    [Variant 1]  [Variant 2]  [Variant 3]  [Variant 4]
    
    [Variant 5]  [Variant 6]  [Variant 7]  [Variant 8]
    
    [Variant 9]  [Variant 10] [Variant 11] [Variant 12]
    
    ← 100px gap →
```

### Adaptive Spacing

Spacing adjusts based on variant size:

**Small components (<100px):**
- Horizontal gap: 80px
- Vertical gap: 80px

**Medium components (100-300px):**
- Horizontal gap: 100px
- Vertical gap: 100px

**Large components (>300px):**
- Horizontal gap: 150px
- Vertical gap: 150px

### Alignment

Variants are aligned to their **top-left corner**, ensuring:
- Consistent starting point
- Predictable layout
- Easy to scan visually

---

## Use Cases

### Use Case 1: Token Update Impact Analysis

**Scenario:** You're updating `color.primary.500` from blue to green.

**Workflow:**

1. Search for token: `color.primary.500`
2. Click "Match" → See all affected components
3. Click "Paste to Canvas" on each component group
4. **Result:** All affected variants laid out on canvas
5. Update the token in your system
6. Apply the updated token in Figma
7. **Review:** See the color change across all pasted instances

**Benefit:** Instant visual impact assessment before committing changes

---

### Use Case 2: Design Review Preparation

**Scenario:** Present button token usage to stakeholders.

**Workflow:**

1. Search for token: `button.primary.background`
2. Match → Find 24 button variants
3. Paste to Canvas → Create visual overview
4. Add annotations/labels
5. Export as PNG or present in Figma

**Benefit:** Quick visual documentation for design reviews

---

### Use Case 3: QA Testing

**Scenario:** Verify spacing token application across form components.

**Workflow:**

1. Search for token: `spacing.md`
2. Match → Find input, select, textarea components
3. Paste all to canvas
4. Measure spacing visually or with plugins
5. Verify consistency

**Benefit:** Catch inconsistencies in token application

---

### Use Case 4: Design System Documentation

**Scenario:** Create a page showing all components using semantic tokens.

**Workflow:**

1. Create a new page: "Token Usage - Primary Color"
2. Search: `color.primary.500`
3. Paste all matching components
4. Organize into sections
5. Add labels and descriptions
6. Share link with team

**Benefit:** Living documentation of token adoption

---

### Use Case 5: Variant Coverage Testing

**Scenario:** Ensure all button states use the correct hover color.

**Workflow:**

1. Search: `button.primary.hover`
2. Match → Should find hover state variants only
3. Paste to canvas
4. Visual inspection: Are all hover states included?
5. Identify missing variants

**Benefit:** Spot gaps in token application

---

## Best Practices

### 1. Create a Dedicated Testing Page

Create a page like "Token Testing" or "Component Review" before pasting:

```
Pages:
├── 🎨 Components
├── 📐 Patterns
└── 🧪 Token Testing  ← Paste here
```

**Why:** Keeps your main pages clean and organized.

### 2. Paste in Batches

For large result sets (50+ variants), paste component groups one at a time:

✅ **Good:** Paste buttons, review, then paste inputs  
❌ **Avoid:** Pasting 200 variants at once (performance impact)

### 3. Add Labels

After pasting, add text labels to annotate:

```
[Button Instance]
↓
"Using: color.primary.500"
"Confidence: 100%"
```

**How:**
1. Use the Text tool (T)
2. Add labels above/below pasted instances
3. Group labels with instances

### 4. Use Frames for Organization

Group pasted variants in frames by component:

```
Frame: "Buttons using color.primary"
├── [Button variant 1]
├── [Button variant 2]
└── [Button variant 3]

Frame: "Inputs using color.primary"
├── [Input variant 1]
└── [Input variant 2]
```

### 5. Clean Up After Review

After reviewing:

1. **Delete temporary instances** (they're just instances, not components)
2. **Archive the testing page** if no longer needed
3. **Clear cache** to free memory

### 6. Export for External Review

For stakeholders without Figma access:

1. Paste variants to canvas
2. Select all pasted instances
3. Right-click → "Copy as PNG"
4. Paste into presentation or document

---

## Troubleshooting

### Issue: "Variants pasted outside viewport"

**Cause:** Too many variants or viewport too small

**Solutions:**

1. **Zoom out** to see all pasted instances
2. Use "Zoom to Fit" (Shift + 1)
3. Select all pasted instances and reposition manually

### Fix: Auto-zoom after paste

```typescript
// After pasting
const pastedNodes = figma.currentPage.selection;
figma.viewport.scrollAndZoomIntoView(pastedNodes);
```

---

### Issue: "Pasted instances overlap"

**Cause:** Components are larger than the spacing algorithm expects

**Solutions:**

1. **Manual adjustment:** Select and drag to reposition
2. **Use auto-layout frame:** 
   - Select all pasted instances
   - Frame selection (Ctrl/Cmd + Alt + G)
   - Set auto-layout (Shift + A)
   - Adjust spacing in properties

---

### Issue: "Can't paste components"

**Cause:** Main component is not accessible or on a different page

**Solutions:**

1. Ensure the main component is published or accessible
2. Navigate to the page containing the component
3. Try "Paste to Canvas" again

**Error message example:**
```
Cannot paste: Main component not found
```

---

### Issue: "Pasted instances don't reflect token changes"

**Cause:** Instances are static snapshots at paste time

**Solutions:**

1. The instances ARE linked to the main component
2. Update the main component, not the instances
3. Changes will automatically reflect in pasted instances

**To update a pasted instance:**
- Don't edit the instance directly
- Go to the main component and edit there
- All instances (pasted or not) will update

---

### Issue: "Performance slow when pasting many variants"

**Cause:** Creating 50+ instances at once

**Solutions:**

1. **Paste in smaller batches** (10-20 variants at a time)
2. Close other files to free memory
3. Wait for each batch to finish before pasting the next

**Performance tips:**
- <10 variants: Instant
- 10-30 variants: <1 second
- 30-50 variants: 1-2 seconds
- 50+ variants: 2-5 seconds

---

## Advanced Techniques

### Technique 1: Custom Annotations

Add custom data to pasted instances:

```typescript
// After pasting
pastedInstances.forEach(instance => {
  instance.setPluginData('token_used', tokenName);
  instance.setPluginData('confidence', confidence.toString());
  instance.setPluginData('pasted_at', Date.now().toString());
});
```

**Use case:** Track which instances came from which token search

---

### Technique 2: Organized Layout with Sections

Create a more structured layout:

```typescript
// Group variants by property
const byState = groupBy(variants, v => v.state);

let yOffset = 0;
for (const [state, stateVariants] of Object.entries(byState)) {
  // Add section label
  addLabel(state, 0, yOffset);
  
  // Paste variants in row
  pasteRow(stateVariants, 0, yOffset + 50);
  
  yOffset += maxHeight + 150;
}
```

**Result:**

```
Default State:
[Variant 1] [Variant 2] [Variant 3]

Hover State:
[Variant 4] [Variant 5] [Variant 6]

Active State:
[Variant 7] [Variant 8] [Variant 9]
```

---

### Technique 3: Comparison Grid

Paste two token searches side-by-side:

```typescript
// Search 1: Old token
const oldResults = searchToken('color.primary.old');
pasteToCanvas(oldResults, x: 0, y: 0);

// Search 2: New token
const newResults = searchToken('color.primary.new');
pasteToCanvas(newResults, x: 0, y: 500);

// Add labels
addLabel('Before', 0, -50);
addLabel('After', 0, 450);
```

**Use case:** Before/after comparison for token migrations

---

## Plugin Messaging API

### Request Paste Action

```typescript
// UI → Plugin
emit('paste-to-canvas', {
  componentId: string,
  variantIds: string[],
  layout: 'grid' | 'row' | 'column'
});
```

### Paste Confirmation

```typescript
// Plugin → UI
emit('paste-complete', {
  success: boolean,
  pastedCount: number,
  error?: string
});
```

---

## Limitations

### Current Limitations

1. **No custom layout options** - Grid layout only (v1.0)
2. **No auto-zoom** - Must manually zoom to see pasted instances
3. **No naming** - Instances use default naming
4. **Single page only** - Cannot paste to multiple pages at once

### Planned Improvements

Future versions may include:
- Custom spacing controls
- Layout templates (row, column, grid)
- Auto-zoom after paste
- Custom instance naming
- Paste to specific coordinates

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Paste to canvas | Click button (no shortcut yet) |
| Select all pasted | Drag selection box |
| Zoom to fit | `Shift + 1` |
| Delete selected | `Delete` or `Backspace` |

---

## Tips & Tricks

### Tip 1: Quick Instance Creation

Want to create instances without the plugin?

1. Hold `Alt/Option` while dragging component from assets panel
2. Creates instance immediately
3. Repeat for more variants

### Tip 2: Batch Renaming

After pasting:

1. Select all pasted instances
2. Use "Batch Rename" plugin (if installed)
3. Add prefix like "TEST-" to all instances
4. Easy to clean up later

### Tip 3: Create Component Documentation

1. Paste variants to canvas
2. Add annotations with properties
3. Screenshot or export
4. Add to design system documentation

### Tip 4: Testing Responsiveness

1. Paste variants in a row
2. Create frames around each
3. Set different widths
4. Test how components respond

---

## Related Features

### Selection Integration

After pasting, instances are automatically selected:

```typescript
const pastedNodes = figma.currentPage.selection;
console.log(`Pasted ${pastedNodes.length} instances`);
```

You can then:
- Move them as a group
- Apply properties collectively
- Export as PNG
- Delete all at once

### Component Navigation

Each pasted instance maintains a link to its main component:

```typescript
instance.mainComponent  // Access the source component
```

Right-click an instance → "Go to Main Component" to edit the source.

---

## Performance Considerations

### Memory Usage

Each instance uses minimal memory (~5KB), but large-scale pasting adds up:

- 10 instances: ~50KB
- 100 instances: ~500KB
- 1000 instances: ~5MB

**Recommendation:** Paste <50 instances at a time for best performance.

### Rendering Performance

Figma renders all visible nodes, so:

- Large viewports with many pasted instances may slow down
- Zoom in to see fewer nodes at once
- Hide layers not currently being reviewed

---

## API Reference

### FigmaComponentService

```typescript
class FigmaComponentService {
  // Create instance of component variant
  createInstance(componentId: string): InstanceNode;
  
  // Place instance at coordinates
  placeInstance(instance: InstanceNode, x: number, y: number): void;
  
  // Arrange multiple instances in grid
  arrangeInGrid(instances: InstanceNode[], options: LayoutOptions): void;
}
```

### Layout Options

```typescript
interface LayoutOptions {
  columns?: number;          // Auto-calculated if not provided
  horizontalGap?: number;    // Default: 100
  verticalGap?: number;      // Default: 100
  startX?: number;           // Default: viewport center
  startY?: number;           // Default: viewport center
}
```

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Related Docs**: [Token Fetching](./TOKEN-FETCHING.md), [Token Matching](./TOKEN-MATCHING.md)
