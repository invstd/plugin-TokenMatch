# Feature: Missing Token Detector

## Overview

Find components with layers that don't have tokens assigned to them and generate actionable to-do lists that can be pasted directly on the Figma canvas.

## User Story

As a design system maintainer, I want to identify components with explicit values (colors, spacing, typography) that should have design tokens assigned, so I can ensure consistent token coverage across my design system.

## Feature Specifications

### Core Functionality

1. **Scan for Missing Tokens**
   - Analyze component properties that have explicit values but no token reference
   - Categorize by property type: colors, spacing, typography, effects
   - Include nested layers within components

2. **Generate To-Do Lists**
   - Create visual checklist frames on the canvas
   - Show component name, layer path, property type, and current value
   - Position to-do lists adjacent to the relevant components

3. **"Paste All" Mode**
   - Generate to-do lists for all components across the file
   - Position each list next to its corresponding component container
   - Option to create a single consolidated list or per-component lists

### User Interface

#### New UI Elements

1. **Missing Tokens Tab/View**
   - Toggle between "Find Using Token" and "Find Missing Tokens" modes
   - Filter options: property types, pages, confidence threshold

2. **Results Display**
   - Group by component
   - Show property type icons
   - Display current explicit value
   - Suggested token matches (if detectable)

3. **Action Buttons**
   - "Paste to Canvas" - Single component's missing tokens
   - "Paste All to Canvas" - All missing tokens file-wide
   - "Copy as Text" - For external documentation

### Canvas Output Format

```
┌─────────────────────────────────────────────────────────┐
│ Missing Tokens: Button/Primary                          │
├─────────────────────────────────────────────────────────┤
│ □ Background fill: #3B82F6                              │
│   Layer: Button Background                              │
│   Suggested: ids.color.primary.500                      │
│                                                         │
│ □ Border radius: 8px                                    │
│   Layer: Button Background                              │
│   Suggested: ids.borderRadius.md                        │
│                                                         │
│ □ Padding horizontal: 16px                              │
│   Layer: Button                                         │
│   Suggested: ids.spacing.4                              │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/components.ts`)

```typescript
interface MissingTokenProperty {
  layerId: string;
  layerName: string;
  layerPath: string[];           // Path from component root to layer
  propertyType: 'color' | 'spacing' | 'typography' | 'effect';
  propertyName: string;          // e.g., "fill", "paddingLeft", "fontSize"
  currentValue: string | number; // The explicit value
  suggestedToken?: {
    path: string;
    confidence: number;
  };
}

interface ComponentMissingTokens {
  component: ComponentProperties;
  missingTokens: MissingTokenProperty[];
  totalProperties: number;       // Total properties scanned
  tokenizedProperties: number;   // Properties with tokens
  coveragePercentage: number;    // tokenized / total * 100
}

interface MissingTokenScanResult {
  components: ComponentMissingTokens[];
  summary: {
    totalComponents: number;
    componentsWithMissing: number;
    totalMissingTokens: number;
    byPropertyType: Record<string, number>;
  };
}
```

### Service Layer

#### New Service: `missing-token-service.ts`

```typescript
// services/missing-token-service.ts

export class MissingTokenService {
  /**
   * Scan components for properties without token references
   */
  async scanForMissingTokens(
    components: ComponentProperties[],
    options: {
      propertyTypes?: ('color' | 'spacing' | 'typography' | 'effect')[];
      includeNested?: boolean;
      minCoverageThreshold?: number;
    }
  ): Promise<MissingTokenScanResult>;

  /**
   * Suggest matching tokens for explicit values
   */
  suggestTokensForValue(
    value: string | number,
    propertyType: string,
    availableTokens: ParsedToken[]
  ): Array<{ token: ParsedToken; confidence: number }>;

  /**
   * Generate canvas-ready to-do list data
   */
  generateTodoListData(
    missingTokens: ComponentMissingTokens
  ): TodoListFrameData;
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
// Add to message handlers in main.ts

case 'scan-missing-tokens':
  const missingService = new MissingTokenService();
  const missingResult = await missingService.scanForMissingTokens(
    cachedComponents,
    {
      propertyTypes: msg.propertyTypes,
      includeNested: msg.includeNested
    }
  );
  emit('missing-tokens-result', missingResult);
  break;

case 'create-missing-tokens-todo':
  // Create single to-do list frame
  const todoFrame = await createMissingTokensTodoFrame(
    msg.componentId,
    msg.missingTokens,
    msg.position
  );
  emit('todo-frame-created', { frameId: todoFrame.id });
  break;

case 'create-all-missing-tokens-todos':
  // Create to-do lists for all components
  const results = await createAllMissingTokensTodos(
    msg.components,
    msg.positioning // 'adjacent' | 'consolidated'
  );
  emit('all-todos-created', results);
  break;
```

#### Canvas Creation Functions

```typescript
async function createMissingTokensTodoFrame(
  componentId: string,
  missingTokens: MissingTokenProperty[],
  position: { x: number; y: number }
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `Missing Tokens: ${componentName}`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.paddingTop = 16;
  frame.paddingBottom = 16;
  frame.paddingLeft = 16;
  frame.paddingRight = 16;
  frame.itemSpacing = 8;

  // Header
  const header = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  header.characters = `Missing Tokens: ${componentName}`;
  header.fontSize = 14;
  frame.appendChild(header);

  // Checklist items
  for (const missing of missingTokens) {
    const item = createChecklistItem(missing);
    frame.appendChild(item);
  }

  // Position adjacent to component
  frame.x = position.x;
  frame.y = position.y;

  return frame;
}

function createChecklistItem(missing: MissingTokenProperty): FrameNode {
  const item = figma.createFrame();
  item.layoutMode = 'VERTICAL';
  item.itemSpacing = 4;

  // Checkbox + property line
  const checkLine = figma.createFrame();
  checkLine.layoutMode = 'HORIZONTAL';
  checkLine.itemSpacing = 8;

  // Checkbox rectangle
  const checkbox = figma.createRectangle();
  checkbox.resize(14, 14);
  checkbox.cornerRadius = 2;
  checkbox.strokes = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  checkbox.fills = [];
  checkLine.appendChild(checkbox);

  // Property text
  const propText = figma.createText();
  propText.characters = `${missing.propertyName}: ${missing.currentValue}`;
  propText.fontSize = 12;
  checkLine.appendChild(propText);

  item.appendChild(checkLine);

  // Layer path (indented)
  const layerText = figma.createText();
  layerText.characters = `  Layer: ${missing.layerPath.join(' > ')}`;
  layerText.fontSize = 10;
  layerText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  item.appendChild(layerText);

  // Suggested token (if available)
  if (missing.suggestedToken) {
    const suggestText = figma.createText();
    suggestText.characters = `  Suggested: ${missing.suggestedToken.path}`;
    suggestText.fontSize = 10;
    suggestText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.6, b: 0.9 } }];
    item.appendChild(suggestText);
  }

  return item;
}
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
// Add to existing state in ui.tsx
const [scanMode, setScanMode] = useState<'find-using' | 'find-missing'>('find-using');
const [missingTokenResults, setMissingTokenResults] = useState<MissingTokenScanResult | null>(null);
const [missingPropertyFilter, setMissingPropertyFilter] = useState<string[]>([
  'color', 'spacing', 'typography', 'effect'
]);
```

#### New UI Components

```typescript
// Mode toggle
const ModeToggle = () => (
  <div className="flex bg-gray-100 rounded-lg p-1">
    <button
      className={`px-3 py-1 rounded ${scanMode === 'find-using' ? 'bg-white shadow' : ''}`}
      onClick={() => setScanMode('find-using')}
    >
      Find Token Usage
    </button>
    <button
      className={`px-3 py-1 rounded ${scanMode === 'find-missing' ? 'bg-white shadow' : ''}`}
      onClick={() => setScanMode('find-missing')}
    >
      Find Missing Tokens
    </button>
  </div>
);

// Missing tokens results
const MissingTokensResults = ({ results }: { results: MissingTokenScanResult }) => (
  <div className="space-y-4">
    {/* Summary */}
    <div className="bg-yellow-50 p-3 rounded-lg">
      <div className="font-semibold">
        {results.summary.componentsWithMissing} components with missing tokens
      </div>
      <div className="text-sm text-gray-600">
        {results.summary.totalMissingTokens} total properties without tokens
      </div>
    </div>

    {/* Per-component results */}
    {results.components.map(comp => (
      <MissingTokensCard key={comp.component.id} data={comp} />
    ))}

    {/* Paste All button */}
    <button
      className="w-full bg-blue-500 text-white py-2 rounded-lg"
      onClick={() => emit('create-all-missing-tokens-todos', {
        components: results.components,
        positioning: 'adjacent'
      })}
    >
      Paste All To-Do Lists to Canvas
    </button>
  </div>
);
```

### Algorithm: Detecting Missing Tokens

```typescript
function detectMissingTokens(component: ComponentProperties): MissingTokenProperty[] {
  const missing: MissingTokenProperty[] = [];

  // Check colors
  for (const color of component.colors) {
    if (!color.tokenReference) {
      missing.push({
        layerId: component.id,
        layerName: component.name,
        layerPath: [component.name],
        propertyType: 'color',
        propertyName: `${color.type} color`,
        currentValue: color.hex,
        suggestedToken: findClosestColorToken(color.hex)
      });
    }
  }

  // Check spacing
  for (const spacing of component.spacing) {
    if (!spacing.tokenReference) {
      missing.push({
        layerId: component.id,
        layerName: component.name,
        layerPath: [component.name],
        propertyType: 'spacing',
        propertyName: spacing.type,
        currentValue: `${spacing.value}${spacing.unit}`,
        suggestedToken: findClosestSpacingToken(spacing.value)
      });
    }
  }

  // Check typography
  for (const typo of component.typography) {
    if (!typo.tokenReference) {
      missing.push({
        layerId: component.id,
        layerName: component.name,
        layerPath: [component.name],
        propertyType: 'typography',
        propertyName: 'typography',
        currentValue: `${typo.fontFamily} ${typo.fontSize}/${typo.lineHeight}`,
        suggestedToken: findClosestTypographyToken(typo)
      });
    }
  }

  // Check effects
  for (const effect of component.effects) {
    if (!effect.tokenReference) {
      missing.push({
        layerId: component.id,
        layerName: component.name,
        layerPath: [component.name],
        propertyType: 'effect',
        propertyName: effect.type,
        currentValue: formatEffectValue(effect),
        suggestedToken: findClosestEffectToken(effect)
      });
    }
  }

  // Recursively check children
  if (component.children) {
    for (const child of component.children) {
      const childMissing = detectMissingTokens(child);
      // Update layer paths to include parent
      childMissing.forEach(m => {
        m.layerPath = [component.name, ...m.layerPath];
      });
      missing.push(...childMissing);
    }
  }

  return missing;
}
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/missing-token-service.ts` | Core missing token detection logic |
| `types/missing-tokens.ts` | Type definitions for missing token data |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add message handlers, canvas creation functions |
| `src/ui.tsx` | Add mode toggle, results display, action buttons |
| `types/components.ts` | Extend `ComponentProperties` if needed for deeper layer scanning |

---

## UI/UX Considerations

### Visual Design

1. **Warning Colors**: Use yellow/orange to indicate missing tokens (vs green for matched)
2. **Coverage Indicators**: Show percentage bars for token coverage
3. **Property Type Icons**: Visual icons for color, spacing, typography, effects

### Interaction Flow

1. User selects "Find Missing Tokens" mode
2. User configures scan scope (all pages, current page, selection)
3. User optionally filters by property types
4. Scan runs with progress indicator
5. Results display grouped by component
6. User can:
   - Click component to navigate in Figma
   - Click "Paste to Canvas" for single component
   - Click "Paste All" for file-wide to-do lists

### Edge Cases

1. **Components with no scannable properties**: Show as "No applicable properties"
2. **Very large files**: Paginate results, virtualize list
3. **Nested instances**: Show layer path for context
4. **Token suggestions with low confidence**: Show warning icon

---

## Testing Strategy

### Unit Tests

1. `detectMissingTokens()` with various component configurations
2. Token suggestion algorithm accuracy
3. Layer path construction for nested components

### Integration Tests

1. Full scan workflow with mock Figma data
2. Canvas creation functions produce valid frames
3. Message passing between UI and backend

### Manual Testing

1. Test with real design files of varying complexity
2. Verify to-do list positioning relative to components
3. Check "Paste All" performance with 100+ components
4. Validate checklist formatting and readability

---

## Performance Considerations

1. **Reuse Existing Scan Data**: Don't re-scan if component cache is valid
2. **Lazy Token Suggestions**: Calculate suggestions only when expanding results
3. **Batch Canvas Operations**: Group frame creation to reduce Figma API calls
4. **Progressive Results**: Stream results as they're computed

---

## Future Enhancements

1. **Auto-fix Mode**: Automatically assign suggested tokens
2. **Ignore List**: Allow users to mark certain properties as "intentionally explicit"
3. **Export Missing Tokens Report**: CSV/JSON of all missing tokens
4. **Slack/Teams Integration**: Post missing token reports to channels
