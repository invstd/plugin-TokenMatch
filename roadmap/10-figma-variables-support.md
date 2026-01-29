# Feature: Figma Variables Support

## Overview

Add support for Figma's native Variables as an alternative reference source for token matching. Instead of connecting to external design token repositories, users can use their local Figma Variables collections to identify which variables are assigned to component properties.

## User Story

As a designer using Figma Variables for my design system, I want to check which variables are assigned to components without needing to set up an external token repository, so I can audit and maintain consistency using Figma's native variable system.

## Feature Specifications

### Core Functionality

1. **Token Source Selection**
   - New setting on the Settings page to choose the reference source
   - Two primary modes:
     - **Variables (Local file only)** - Uses Figma's native Variable collections
     - **Design Tokens (Repository)** - Current behavior with GitHub/GitLab/etc.

2. **Variable Collection Reading**
   - Read all Variable collections from the current Figma file
   - Support all variable types: Color, Number, String, Boolean
   - Handle variable modes (e.g., Light/Dark themes)
   - Resolve variable aliases/references

3. **Variable-to-Component Matching**
   - Scan components for properties bound to Variables
   - Display which Variable is assigned to each property
   - Show Variable path (Collection > Group > Variable name)
   - Indicate unresolved or missing Variable bindings

### User Interface

#### Settings Page Changes

```
┌─────────────────────────────────────────────────────────┐
│ Token Source                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ○ Variables (Local file only)                           │
│   Use Figma Variables from this file as the reference   │
│   for matching component values.                        │
│                                                         │
│ ○ Design Tokens (Repository)                            │
│   Connect to a token repository (GitHub, GitLab,        │
│   BitBucket, or upload JSON files).                     │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ When "Variables" is selected:                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Available Collections                               │ │
│ │ ☑ Primitives (24 variables)                         │ │
│ │ ☑ Semantic (48 variables)                           │ │
│ │ ☐ Brand/Legacy (12 variables)                       │ │
│ │                                                     │ │
│ │ Selected Mode: Light                        ▼       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ When "Design Tokens" is selected:                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Provider:  GitHub              ▼                    │ │
│ │ Repository: org/design-tokens                       │ │
│ │ Branch: main                                        │ │
│ │ [Configure Repository...]                           │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Results Display Changes

When using Variables mode, the results view adapts to show Variable-specific information:

```
┌─────────────────────────────────────────────────────────┐
│ Search results for "primary"                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─ Variable ──────────────────────────────────────────┐ │
│ │ 🎨 Semantic/Colors/Primary/500                      │ │
│ │    Type: Color                                      │ │
│ │    Value: #3B82F6 (Light mode)                    │ │
│ │    Aliases: → Primitives/Blue/500                   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Used in 12 components:                                  │
│ • Button/Primary → Background fill                      │
│ • Link/Default → Text color                             │
│ • Badge/Info → Background fill                          │
│ • ...                                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Mode Comparison

| Aspect | Variables Mode | Design Tokens Mode |
|--------|---------------|-------------------|
| Source | Local Figma file | External repository |
| Setup | Zero config (auto-detects) | Requires repository connection |
| Types | Color, Number, String, Boolean | All token types |
| Theming | Variable modes | Token themes/sets |
| Offline | ✅ Works offline | ❌ Requires network |
| Sync | Automatic (live) | Manual refresh |
| Aliases | Figma Variable references | Token $value references |

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/tokens.ts`)

```typescript
// Variable source types
type TokenSourceType = 'variables' | 'design-tokens';

interface TokenSourceConfig {
  type: TokenSourceType;
  // Variables-specific config
  variables?: {
    selectedCollections: string[];  // Collection IDs to include
    selectedMode: string;           // Mode name for resolution
  };
  // Design tokens config (existing)
  designTokens?: {
    provider: 'github' | 'gitlab' | 'bitbucket' | 'local';
    // ... existing config
  };
}

// Figma Variable representation
interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  collectionId: string;
  collectionName: string;
  path: string[];              // Full path: [collection, ...groups, name]
  valuesByMode: Record<string, VariableValue>;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: VariableScope[];
  // Alias resolution
  aliasOf?: {
    variableId: string;
    variablePath: string;
  };
}

interface VariableValue {
  type: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'ALIAS';
  value: RGBA | number | string | boolean;
  resolvedValue?: RGBA | number | string | boolean;  // If alias, resolved value
}

interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
  hiddenFromPublishing: boolean;
}

// Component variable binding
interface VariableBinding {
  componentId: string;
  componentName: string;
  layerId: string;
  layerName: string;
  property: string;           // e.g., "fills/0/color", "itemSpacing"
  variableId: string;
  variablePath: string;
}
```

### Service Layer

#### New Service: `figma-variables-service.ts`

```typescript
// services/figma-variables-service.ts

export class FigmaVariablesService {
  /**
   * Get all Variable collections from the current file
   */
  async getCollections(): Promise<FigmaVariableCollection[]> {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    return collections.map(c => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name })),
      defaultModeId: c.defaultModeId,
      variableIds: c.variableIds,
      hiddenFromPublishing: c.hiddenFromPublishing
    }));
  }

  /**
   * Get all Variables from specified collections
   */
  async getVariables(collectionIds?: string[]): Promise<FigmaVariable[]> {
    const allVariables = await figma.variables.getLocalVariablesAsync();
    
    const filtered = collectionIds 
      ? allVariables.filter(v => collectionIds.includes(v.variableCollectionId))
      : allVariables;
    
    return Promise.all(filtered.map(v => this.mapVariable(v)));
  }

  /**
   * Map Figma Variable to our data structure
   */
  private async mapVariable(variable: Variable): Promise<FigmaVariable> {
    const collection = await figma.variables.getVariableCollectionByIdAsync(
      variable.variableCollectionId
    );
    
    const valuesByMode: Record<string, VariableValue> = {};
    
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = collection?.modes.find(m => m.modeId === modeId)?.name || modeId;
      valuesByMode[modeName] = await this.resolveValue(value, variable.resolvedType);
    }
    
    return {
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      collectionId: variable.variableCollectionId,
      collectionName: collection?.name || 'Unknown',
      path: this.buildPath(collection?.name || '', variable.name),
      valuesByMode,
      description: variable.description,
      hiddenFromPublishing: variable.hiddenFromPublishing,
      scopes: variable.scopes
    };
  }

  /**
   * Build full variable path from collection and name
   */
  private buildPath(collectionName: string, variableName: string): string[] {
    // Variable names use "/" as separator: "Colors/Primary/500"
    const nameParts = variableName.split('/');
    return [collectionName, ...nameParts];
  }

  /**
   * Resolve variable value, following aliases if needed
   */
  private async resolveValue(
    value: VariableValue | VariableAlias,
    type: VariableResolvedDataType
  ): Promise<VariableValue> {
    if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
      const aliasedVar = await figma.variables.getVariableByIdAsync(value.id);
      if (aliasedVar) {
        return {
          type: 'ALIAS',
          value: value.id,
          resolvedValue: await this.getResolvedValue(aliasedVar)
        };
      }
    }
    
    return { type, value } as VariableValue;
  }

  /**
   * Scan a component for Variable bindings
   */
  scanComponentForVariables(node: SceneNode): VariableBinding[] {
    const bindings: VariableBinding[] = [];
    
    // Check bound variables on the node
    const boundVars = node.boundVariables;
    if (boundVars) {
      for (const [property, binding] of Object.entries(boundVars)) {
        if (binding && 'id' in binding) {
          bindings.push({
            componentId: node.id,
            componentName: node.name,
            layerId: node.id,
            layerName: node.name,
            property,
            variableId: binding.id,
            variablePath: '' // Will be resolved later
          });
        }
      }
    }
    
    // Recursively scan children
    if ('children' in node) {
      for (const child of node.children) {
        bindings.push(...this.scanComponentForVariables(child));
      }
    }
    
    return bindings;
  }

  /**
   * Find components using a specific Variable
   */
  async findComponentsUsingVariable(
    variableId: string,
    components: ComponentNode[]
  ): Promise<VariableBinding[]> {
    const allBindings: VariableBinding[] = [];
    
    for (const component of components) {
      const bindings = this.scanComponentForVariables(component);
      const matching = bindings.filter(b => b.variableId === variableId);
      allBindings.push(...matching);
    }
    
    return allBindings;
  }

  /**
   * Search Variables by name/path
   */
  searchVariables(
    variables: FigmaVariable[],
    query: string
  ): FigmaVariable[] {
    const lowerQuery = query.toLowerCase();
    return variables.filter(v => 
      v.name.toLowerCase().includes(lowerQuery) ||
      v.path.join('/').toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Convert Variables to ParsedToken format for unified handling
   */
  convertToTokenFormat(variables: FigmaVariable[], mode: string): ParsedToken[] {
    return variables.map(v => ({
      path: v.path.join('.'),
      name: v.name,
      value: this.formatValue(v.valuesByMode[mode]),
      type: this.mapTypeToTokenType(v.resolvedType),
      rawValue: v.valuesByMode[mode]?.value,
      // Additional metadata
      metadata: {
        source: 'figma-variables',
        variableId: v.id,
        collectionId: v.collectionId,
        collectionName: v.collectionName
      }
    }));
  }

  private mapTypeToTokenType(type: string): string {
    const mapping: Record<string, string> = {
      'COLOR': 'color',
      'FLOAT': 'number',
      'STRING': 'string',
      'BOOLEAN': 'boolean'
    };
    return mapping[type] || 'other';
  }

  private formatValue(value: VariableValue | undefined): string {
    if (!value) return '';
    
    const v = value.resolvedValue || value.value;
    
    if (value.type === 'COLOR' && typeof v === 'object') {
      const rgba = v as RGBA;
      return `rgba(${Math.round(rgba.r * 255)}, ${Math.round(rgba.g * 255)}, ${Math.round(rgba.b * 255)}, ${rgba.a})`;
    }
    
    return String(v);
  }
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
// Add to message handlers in main.ts

case 'get-variable-collections':
  const variablesService = new FigmaVariablesService();
  const collections = await variablesService.getCollections();
  emit('variable-collections', { collections });
  break;

case 'get-variables':
  const varService = new FigmaVariablesService();
  const variables = await varService.getVariables(msg.collectionIds);
  emit('variables-loaded', { 
    variables,
    count: variables.length 
  });
  break;

case 'search-variables':
  const searchService = new FigmaVariablesService();
  const allVars = await searchService.getVariables(msg.collectionIds);
  const matches = searchService.searchVariables(allVars, msg.query);
  emit('variable-search-results', { variables: matches });
  break;

case 'find-components-using-variable':
  const findService = new FigmaVariablesService();
  const components = await getComponentsFromPages(msg.pageIds);
  const bindings = await findService.findComponentsUsingVariable(
    msg.variableId,
    components
  );
  emit('variable-usage-results', { bindings });
  break;

case 'set-token-source':
  // Store user's token source preference
  await figma.clientStorage.setAsync('tokenSource', msg.config);
  emit('token-source-saved', { success: true });
  break;

case 'get-token-source':
  const savedSource = await figma.clientStorage.getAsync('tokenSource');
  emit('token-source-loaded', { 
    config: savedSource || { type: 'design-tokens' } 
  });
  break;
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
// Add to existing state in ui.tsx

type TokenSourceType = 'variables' | 'design-tokens';

const [tokenSource, setTokenSource] = useState<TokenSourceType>('design-tokens');
const [variableCollections, setVariableCollections] = useState<FigmaVariableCollection[]>([]);
const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
const [selectedMode, setSelectedMode] = useState<string>('');
const [availableModes, setAvailableModes] = useState<string[]>([]);
```

#### Settings Page Component

```typescript
const TokenSourceSettings = () => {
  useEffect(() => {
    // Load saved preference
    emit('get-token-source');
    
    // Load available collections
    emit('get-variable-collections');
  }, []);

  const handleSourceChange = (source: TokenSourceType) => {
    setTokenSource(source);
    emit('set-token-source', { 
      type: source,
      variables: source === 'variables' ? {
        selectedCollections,
        selectedMode
      } : undefined
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Token Source</h2>
      
      {/* Source Selection */}
      <div className="space-y-3">
        <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="tokenSource"
            value="variables"
            checked={tokenSource === 'variables'}
            onChange={() => handleSourceChange('variables')}
            className="mt-1"
          />
          <div>
            <div className="font-medium">Variables (Local file only)</div>
            <div className="text-sm text-gray-500">
              Use Figma Variables from this file as the reference for matching component values.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="tokenSource"
            value="design-tokens"
            checked={tokenSource === 'design-tokens'}
            onChange={() => handleSourceChange('design-tokens')}
            className="mt-1"
          />
          <div>
            <div className="font-medium">Design Tokens (Repository)</div>
            <div className="text-sm text-gray-500">
              Connect to a token repository (GitHub, GitLab, BitBucket, or upload JSON files).
            </div>
          </div>
        </label>
      </div>

      {/* Variables Configuration */}
      {tokenSource === 'variables' && (
        <VariablesConfig
          collections={variableCollections}
          selectedCollections={selectedCollections}
          onCollectionsChange={setSelectedCollections}
          selectedMode={selectedMode}
          availableModes={availableModes}
          onModeChange={setSelectedMode}
        />
      )}

      {/* Design Tokens Configuration (existing) */}
      {tokenSource === 'design-tokens' && (
        <DesignTokensConfig />
      )}
    </div>
  );
};

const VariablesConfig = ({ 
  collections, 
  selectedCollections, 
  onCollectionsChange,
  selectedMode,
  availableModes,
  onModeChange 
}) => (
  <div className="space-y-4 pl-7">
    <div>
      <h3 className="text-sm font-medium mb-2">Available Collections</h3>
      <div className="space-y-2">
        {collections.map(collection => (
          <label key={collection.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedCollections.includes(collection.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  onCollectionsChange([...selectedCollections, collection.id]);
                } else {
                  onCollectionsChange(selectedCollections.filter(id => id !== collection.id));
                }
              }}
            />
            <span>{collection.name}</span>
            <span className="text-gray-400 text-sm">
              ({collection.variableIds.length} variables)
            </span>
          </label>
        ))}
      </div>
      {collections.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No Variable collections found in this file.
        </p>
      )}
    </div>

    {availableModes.length > 1 && (
      <div>
        <h3 className="text-sm font-medium mb-2">Selected Mode</h3>
        <select
          value={selectedMode}
          onChange={(e) => onModeChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2"
        >
          {availableModes.map(mode => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </div>
    )}
  </div>
);
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/figma-variables-service.ts` | Core Variables reading and matching logic |
| `types/variables.ts` | Type definitions for Variable data structures |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add message handlers for Variable operations |
| `src/ui.tsx` | Add token source selection, Variables config UI |
| `types/tokens.ts` | Add TokenSourceConfig type |
| `services/token-matching-service.ts` | Support Variables as alternate source |

---

## UI/UX Considerations

### Visual Design

1. **Clear Mode Distinction**: Visual separation between Variables and Design Tokens modes
2. **Collection Browser**: Easy checkbox selection of which collections to include
3. **Mode Selector**: Dropdown for Variable mode selection (Light/Dark/etc.)
4. **Source Indicator**: Show current mode in the header/toolbar

### Interaction Flow

1. User opens Settings
2. User selects "Variables (Local file only)" or "Design Tokens (Repository)"
3. If Variables:
   - Collections auto-load from file
   - User selects which collections to include
   - User selects which mode to use for values
4. If Design Tokens:
   - Existing repository configuration flow
5. User returns to main view
6. Search/match operations use the selected source

### Edge Cases

1. **No Variables in file**: Show helpful message with link to Figma Variables docs
2. **Mode changes**: Automatically re-resolve alias values
3. **Hidden Variables**: Option to show/hide variables marked "hidden from publishing"
4. **Large collection counts**: Virtualized list for collections with 1000+ variables

---

## Testing Strategy

### Unit Tests

1. `getCollections()` returns correct collection metadata
2. `getVariables()` correctly resolves aliases
3. `scanComponentForVariables()` finds all bound variables
4. `convertToTokenFormat()` correctly maps Variable types

### Integration Tests

1. Full flow from Settings → Variables selection → Search → Results
2. Mode switching updates displayed values correctly
3. Source persistence works across plugin sessions

### Manual Testing

1. Test with files containing:
   - Single collection
   - Multiple collections with different modes
   - Variables with aliases
   - No Variables at all
2. Verify switching between Variables and Design Tokens modes
3. Test search functionality with Variables source

---

## Performance Considerations

1. **Lazy Loading**: Only load Variables when Variables mode is selected
2. **Collection Caching**: Cache Variable data during session
3. **Incremental Updates**: If Figma adds Variable change events, subscribe to updates
4. **Batch Operations**: Use async/batch APIs for large Variable sets

---

## Migration Considerations

### Existing Users

- Default to "Design Tokens" mode to preserve existing behavior
- Show one-time prompt about new Variables option
- Preserve all existing repository configurations

### Future Evolution

- Could support hybrid mode (both Variables + Tokens)
- Could add Variable → Token mapping/comparison features
- Could support Team Library Variables when Figma API expands

---

## Dependencies

- Figma Plugin API Variables support (available since 2023)
- No external dependencies required
- Works offline (no network calls needed)

---

## Limitations

### Current Figma API Constraints

1. **Local Variables only**: Cannot access Team Library Variables via Plugin API
2. **No change events**: Must manually refresh to detect Variable changes
3. **Scopes**: Some Variable scopes may limit binding visibility

### Feature Scope

1. Variables mode is local-file only (by design)
2. No Variable creation/editing (read-only inspection)
3. No cross-file Variable comparison
