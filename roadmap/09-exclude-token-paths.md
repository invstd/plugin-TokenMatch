# Feature: Exclude Token Paths

## Overview

Allow users to configure token path patterns to exclude from matching results, enabling them to filter out primitive/base tokens and focus only on semantic or component-level tokens that are intended for direct use.

## User Story

As a design system maintainer, I want to exclude primitive token paths (like `colors.base.*`, `primitives.*`, or `core.*`) from token matching results, so I can focus on semantic tokens that designers should actually be using in components.

## Feature Specifications

### Core Functionality

1. **Exclusion Pattern Configuration**
   - Define patterns to exclude from token matching
   - Support glob-style wildcards (`*`, `**`)
   - Multiple exclusion patterns
   - Per-file or global exclusion settings

2. **Common Preset Patterns**
   - Pre-built exclusion sets for common token architectures
   - "Primitives" preset: `primitives.*`, `core.*`, `base.*`
   - "Internal" preset: `_*`, `internal.*`, `private.*`
   - Custom pattern creation

3. **Exclusion Scope Options**
   - Exclude from search/browse token list
   - Exclude from match results
   - Exclude from statistics (optional)
   - Show excluded count for transparency

4. **Quick Toggle**
   - Easy on/off toggle for exclusions in main UI
   - Visual indicator when exclusions are active

### User Interface

#### Settings Page - Token Exclusions

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Token Repository                                       │
│  ├─ [GitHub configuration...]                          │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  Token Path Exclusions                                  │
│                                                         │
│  Exclude primitive or internal tokens from matching     │
│  to focus on semantic tokens intended for direct use.   │
│                                                         │
│  Quick Presets:                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ☑ Primitives (primitives.*, core.*, base.*)     │   │
│  │ ☐ Internal tokens (_*, internal.*, private.*)   │   │
│  │ ☐ Deprecated (deprecated.*, legacy.*)           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Custom Exclusion Patterns:                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ colors.base.**                              [×] │   │
│  │ spacing.scale.**                            [×] │   │
│  │ typography.base.**                          [×] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [ + Add Pattern ]                                      │
│                                                         │
│  Preview: 847 tokens loaded, 312 excluded (37%)        │
│  [ Preview Excluded Tokens ]                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Add Pattern Dialog

```
┌─────────────────────────────────────────────────────────┐
│ Add Exclusion Pattern                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Pattern:                                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ colors.primitives.**                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Pattern Help:                                          │
│  • Use * to match any single segment                   │
│  • Use ** to match any number of segments              │
│  • Examples:                                            │
│    - colors.* → colors.red, colors.blue               │
│    - colors.** → colors.red.500, colors.brand.primary │
│    - *.base.* → colors.base.red, spacing.base.sm      │
│                                                         │
│  Matches 45 tokens:                                     │
│  • colors.primitives.red.50                            │
│  • colors.primitives.red.100                           │
│  • colors.primitives.red.200                           │
│  • ... and 42 more                                      │
│                                                         │
│  [ Cancel ]                           [ Add Pattern ]   │
└─────────────────────────────────────────────────────────┘
```

#### Main UI - Exclusion Indicator

```
┌─────────────────────────────────────────────────────────┐
│ Search Tokens                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔍 [Search tokens...________________]                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🚫 Excluding 312 primitive tokens               │   │
│  │    [ Show All ] [ Configure ]                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Available Tokens (535):                                │
│  ├─ semantic                                            │
│  │  ├─ colors                                          │
│  │  │  ├─ primary                                      │
│  │  │  ├─ secondary                                    │
│  │  ...                                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Main UI - With Exclusions Disabled

```
┌─────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⚠️ Showing all 847 tokens (including primitives)│   │
│  │    [ Hide Primitives ]                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Available Tokens (847):                                │
│  ├─ primitives        ← normally hidden                │
│  │  ├─ colors                                          │
│  │  │  ├─ red                                          │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
```

#### Match Results - With Exclusions

```
┌─────────────────────────────────────────────────────────┐
│ Match Results for "semantic.colors.primary"             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Found 23 components using this token                   │
│                                                         │
│  [Component list...]                                    │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ℹ️ 8 additional matches in excluded primitive tokens   │
│     (primitives.colors.blue.500)                       │
│     [ Show Excluded Matches ]                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/exclusions.ts`)

```typescript
interface ExclusionPattern {
  id: string;
  pattern: string;              // Glob pattern like "primitives.**"
  enabled: boolean;
  source: 'preset' | 'custom';
  presetName?: string;          // e.g., "primitives", "internal"
  matchCount?: number;          // Cached count of matching tokens
}

interface ExclusionPreset {
  id: string;
  name: string;
  description: string;
  patterns: string[];
}

interface ExclusionConfig {
  enabled: boolean;             // Master toggle
  patterns: ExclusionPattern[];
  scope: {
    tokenList: boolean;         // Exclude from token browser
    matchResults: boolean;      // Exclude from match results
    statistics: boolean;        // Exclude from statistics
  };
}

interface ExclusionResult {
  included: ParsedToken[];
  excluded: ParsedToken[];
  excludedCount: number;
  excludedByPattern: Map<string, number>;  // Pattern → count
}
```

### Preset Definitions

```typescript
const EXCLUSION_PRESETS: ExclusionPreset[] = [
  {
    id: 'primitives',
    name: 'Primitives',
    description: 'Base/primitive tokens not intended for direct use',
    patterns: [
      'primitives.**',
      'primitive.**',
      'core.**',
      'base.**',
      '*.base.**',
      '*.primitives.**'
    ]
  },
  {
    id: 'internal',
    name: 'Internal Tokens',
    description: 'Internal or private tokens',
    patterns: [
      '_**',
      'internal.**',
      'private.**',
      '*.internal.**',
      '*.private.**'
    ]
  },
  {
    id: 'deprecated',
    name: 'Deprecated',
    description: 'Legacy or deprecated tokens',
    patterns: [
      'deprecated.**',
      'legacy.**',
      '*.deprecated.**',
      '*.legacy.**'
    ]
  },
  {
    id: 'scales',
    name: 'Numeric Scales',
    description: 'Raw scale values (50, 100, 200, etc.)',
    patterns: [
      '**.50',
      '**.100',
      '**.200',
      '**.300',
      '**.400',
      '**.500',
      '**.600',
      '**.700',
      '**.800',
      '**.900'
    ]
  }
];
```

### Service Layer

#### New Service: `exclusion-service.ts`

```typescript
// services/exclusion-service.ts

const EXCLUSION_STORAGE_KEY = 'tokensmatch_exclusions';

export class ExclusionService {
  private config: ExclusionConfig;

  constructor() {
    this.config = this.getDefaultConfig();
  }

  /**
   * Load exclusion configuration from storage
   */
  async loadConfig(): Promise<ExclusionConfig> {
    const stored = await figma.clientStorage.getAsync(EXCLUSION_STORAGE_KEY);
    if (stored) {
      this.config = JSON.parse(stored);
    }
    return this.config;
  }

  /**
   * Save exclusion configuration
   */
  async saveConfig(config: ExclusionConfig): Promise<void> {
    this.config = config;
    await figma.clientStorage.setAsync(
      EXCLUSION_STORAGE_KEY,
      JSON.stringify(config)
    );
  }

  /**
   * Apply exclusions to a token list
   */
  applyExclusions(tokens: ParsedToken[]): ExclusionResult {
    if (!this.config.enabled) {
      return {
        included: tokens,
        excluded: [],
        excludedCount: 0,
        excludedByPattern: new Map()
      };
    }

    const enabledPatterns = this.config.patterns.filter(p => p.enabled);
    const included: ParsedToken[] = [];
    const excluded: ParsedToken[] = [];
    const excludedByPattern = new Map<string, number>();

    for (const token of tokens) {
      const matchingPattern = this.findMatchingPattern(token.path, enabledPatterns);

      if (matchingPattern) {
        excluded.push(token);
        const count = excludedByPattern.get(matchingPattern.pattern) || 0;
        excludedByPattern.set(matchingPattern.pattern, count + 1);
      } else {
        included.push(token);
      }
    }

    return {
      included,
      excluded,
      excludedCount: excluded.length,
      excludedByPattern
    };
  }

  /**
   * Check if a single token path is excluded
   */
  isExcluded(tokenPath: string): boolean {
    if (!this.config.enabled) return false;

    const enabledPatterns = this.config.patterns.filter(p => p.enabled);
    return this.findMatchingPattern(tokenPath, enabledPatterns) !== null;
  }

  /**
   * Test a pattern against all tokens and return matches
   */
  testPattern(pattern: string, tokens: ParsedToken[]): ParsedToken[] {
    return tokens.filter(token => this.matchesPattern(token.path, pattern));
  }

  /**
   * Add a custom exclusion pattern
   */
  async addPattern(pattern: string): Promise<ExclusionPattern> {
    const newPattern: ExclusionPattern = {
      id: this.generateId(),
      pattern,
      enabled: true,
      source: 'custom'
    };

    this.config.patterns.push(newPattern);
    await this.saveConfig(this.config);
    return newPattern;
  }

  /**
   * Remove an exclusion pattern
   */
  async removePattern(patternId: string): Promise<void> {
    this.config.patterns = this.config.patterns.filter(p => p.id !== patternId);
    await this.saveConfig(this.config);
  }

  /**
   * Toggle a preset on/off
   */
  async togglePreset(presetId: string, enabled: boolean): Promise<void> {
    const preset = EXCLUSION_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    if (enabled) {
      // Add preset patterns if not already present
      for (const pattern of preset.patterns) {
        const exists = this.config.patterns.some(
          p => p.pattern === pattern && p.presetName === presetId
        );
        if (!exists) {
          this.config.patterns.push({
            id: this.generateId(),
            pattern,
            enabled: true,
            source: 'preset',
            presetName: presetId
          });
        }
      }
    } else {
      // Remove all patterns from this preset
      this.config.patterns = this.config.patterns.filter(
        p => p.presetName !== presetId
      );
    }

    await this.saveConfig(this.config);
  }

  /**
   * Check if a preset is enabled
   */
  isPresetEnabled(presetId: string): boolean {
    const preset = EXCLUSION_PRESETS.find(p => p.id === presetId);
    if (!preset) return false;

    // Preset is enabled if all its patterns are present and enabled
    return preset.patterns.every(pattern =>
      this.config.patterns.some(
        p => p.pattern === pattern && p.presetName === presetId && p.enabled
      )
    );
  }

  /**
   * Get available presets with their current state
   */
  getPresets(): Array<ExclusionPreset & { enabled: boolean }> {
    return EXCLUSION_PRESETS.map(preset => ({
      ...preset,
      enabled: this.isPresetEnabled(preset.id)
    }));
  }

  // Private methods

  private getDefaultConfig(): ExclusionConfig {
    return {
      enabled: true,
      patterns: [],
      scope: {
        tokenList: true,
        matchResults: true,
        statistics: false
      }
    };
  }

  private findMatchingPattern(
    tokenPath: string,
    patterns: ExclusionPattern[]
  ): ExclusionPattern | null {
    for (const pattern of patterns) {
      if (this.matchesPattern(tokenPath, pattern.pattern)) {
        return pattern;
      }
    }
    return null;
  }

  private matchesPattern(tokenPath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = this.globToRegex(pattern);
    return regexPattern.test(tokenPath);
  }

  private globToRegex(pattern: string): RegExp {
    // Escape special regex characters except * and **
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // ** matches any number of segments (including dots)
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      // * matches any characters except dots (single segment)
      .replace(/\*/g, '[^.]*')
      // Replace placeholder back
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');

    return new RegExp(`^${regexStr}$`, 'i');
  }

  private generateId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
// Add to message handlers in main.ts

case 'get-exclusion-config':
  const exclusionService = new ExclusionService();
  const config = await exclusionService.loadConfig();
  emit('exclusion-config', config);
  break;

case 'save-exclusion-config':
  await exclusionService.saveConfig(msg.config);
  emit('exclusion-config-saved', {});
  break;

case 'toggle-exclusion-preset':
  await exclusionService.togglePreset(msg.presetId, msg.enabled);
  const updatedConfig = await exclusionService.loadConfig();
  emit('exclusion-config', updatedConfig);
  break;

case 'add-exclusion-pattern':
  const newPattern = await exclusionService.addPattern(msg.pattern);
  emit('exclusion-pattern-added', newPattern);
  break;

case 'remove-exclusion-pattern':
  await exclusionService.removePattern(msg.patternId);
  emit('exclusion-pattern-removed', { patternId: msg.patternId });
  break;

case 'test-exclusion-pattern':
  const matches = exclusionService.testPattern(msg.pattern, cachedTokens);
  emit('exclusion-pattern-test-result', {
    pattern: msg.pattern,
    matchCount: matches.length,
    sampleMatches: matches.slice(0, 10).map(t => t.path)
  });
  break;

case 'get-tokens':
  // Modified to apply exclusions
  const tokens = await fetchTokensFromRepository();
  const exclusionResult = exclusionService.applyExclusions(tokens);

  emit('tokens-loaded', {
    tokens: msg.includeExcluded ? tokens : exclusionResult.included,
    excluded: exclusionResult.excluded,
    excludedCount: exclusionResult.excludedCount
  });
  break;
```

### UI Modifications

#### Settings Page State

```typescript
// Add to settings state
const [exclusionConfig, setExclusionConfig] = useState<ExclusionConfig | null>(null);
const [presets, setPresets] = useState<Array<ExclusionPreset & { enabled: boolean }>>([]);
const [newPattern, setNewPattern] = useState('');
const [patternTestResult, setPatternTestResult] = useState<{
  matchCount: number;
  sampleMatches: string[];
} | null>(null);

// Load exclusion config on mount
useEffect(() => {
  emit('get-exclusion-config');
}, []);
```

#### Settings Page Component

```typescript
const ExclusionSettings = () => {
  const handleTogglePreset = (presetId: string, enabled: boolean) => {
    emit('toggle-exclusion-preset', { presetId, enabled });
  };

  const handleAddPattern = () => {
    if (newPattern.trim()) {
      emit('add-exclusion-pattern', { pattern: newPattern.trim() });
      setNewPattern('');
    }
  };

  const handleRemovePattern = (patternId: string) => {
    emit('remove-exclusion-pattern', { patternId });
  };

  const handleTestPattern = (pattern: string) => {
    emit('test-exclusion-pattern', { pattern });
  };

  const customPatterns = exclusionConfig?.patterns.filter(p => p.source === 'custom') || [];

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="font-semibold mb-2">Token Path Exclusions</h3>
      <p className="text-sm text-gray-600 mb-4">
        Exclude primitive or internal tokens from matching to focus on
        semantic tokens intended for direct use.
      </p>

      {/* Master Toggle */}
      <label className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          checked={exclusionConfig?.enabled ?? true}
          onChange={(e) => {
            emit('save-exclusion-config', {
              config: { ...exclusionConfig, enabled: e.target.checked }
            });
          }}
          className="rounded"
        />
        <span className="font-medium">Enable token exclusions</span>
      </label>

      {exclusionConfig?.enabled && (
        <>
          {/* Presets */}
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Quick Presets:</h4>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              {presets.map(preset => (
                <label key={preset.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={preset.enabled}
                    onChange={(e) => handleTogglePreset(preset.id, e.target.checked)}
                    className="rounded mt-0.5"
                  />
                  <div>
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-gray-500 text-sm ml-1">
                      ({preset.patterns.join(', ')})
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Patterns */}
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Custom Exclusion Patterns:</h4>
            {customPatterns.length > 0 ? (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-3">
                {customPatterns.map(pattern => (
                  <div
                    key={pattern.id}
                    className="flex items-center justify-between"
                  >
                    <code className="text-sm bg-white px-2 py-1 rounded">
                      {pattern.pattern}
                    </code>
                    <button
                      className="text-red-500 hover:text-red-700 text-sm"
                      onClick={() => handleRemovePattern(pattern.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-3">No custom patterns defined.</p>
            )}

            {/* Add Pattern */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newPattern}
                onChange={(e) => {
                  setNewPattern(e.target.value);
                  if (e.target.value) {
                    handleTestPattern(e.target.value);
                  }
                }}
                placeholder="e.g., colors.base.**"
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              />
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm
                           hover:bg-blue-600 disabled:opacity-50"
                onClick={handleAddPattern}
                disabled={!newPattern.trim()}
              >
                Add
              </button>
            </div>

            {/* Pattern Test Preview */}
            {patternTestResult && newPattern && (
              <div className="mt-2 text-sm">
                <span className="text-gray-600">
                  Matches {patternTestResult.matchCount} tokens
                </span>
                {patternTestResult.sampleMatches.length > 0 && (
                  <ul className="mt-1 text-gray-500 text-xs">
                    {patternTestResult.sampleMatches.map((path, i) => (
                      <li key={i}>• {path}</li>
                    ))}
                    {patternTestResult.matchCount > 10 && (
                      <li>• ... and {patternTestResult.matchCount - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Preview Stats */}
          <div className="text-sm text-gray-600 bg-blue-50 rounded-lg p-3">
            <span className="font-medium">{totalTokens}</span> tokens loaded,{' '}
            <span className="font-medium">{excludedCount}</span> excluded ({excludedPercent}%)
          </div>
        </>
      )}
    </div>
  );
};
```

#### Main UI Integration

```typescript
// Add to main UI state
const [showExcluded, setShowExcluded] = useState(false);
const [excludedCount, setExcludedCount] = useState(0);

// Exclusion indicator component
const ExclusionIndicator = () => {
  if (excludedCount === 0) return null;

  return (
    <div className={`rounded-lg p-3 mb-3 text-sm ${
      showExcluded ? 'bg-amber-50' : 'bg-gray-50'
    }`}>
      {showExcluded ? (
        <>
          <span className="text-amber-700">
            ⚠️ Showing all {totalTokens} tokens (including primitives)
          </span>
          <button
            className="text-amber-600 hover:text-amber-800 ml-2 underline"
            onClick={() => setShowExcluded(false)}
          >
            Hide Primitives
          </button>
        </>
      ) : (
        <>
          <span className="text-gray-600">
            🚫 Excluding {excludedCount} primitive tokens
          </span>
          <button
            className="text-blue-500 hover:text-blue-700 ml-2 underline"
            onClick={() => setShowExcluded(true)}
          >
            Show All
          </button>
          <button
            className="text-gray-500 hover:text-gray-700 ml-2 underline"
            onClick={() => openSettings('exclusions')}
          >
            Configure
          </button>
        </>
      )}
    </div>
  );
};
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/exclusion-service.ts` | Exclusion pattern matching and configuration |
| `types/exclusions.ts` | Type definitions for exclusion patterns |
| `components/ExclusionSettings.tsx` | Settings page exclusion configuration UI |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add exclusion message handlers, integrate with token loading |
| `src/ui.tsx` | Add exclusion indicator, toggle visibility |
| `src/settings.tsx` | Add exclusion configuration section |
| `services/token-service.ts` | Apply exclusions when fetching tokens |

---

## UI/UX Considerations

### Visual Design

1. **Subtle Indicator**: Non-intrusive notification about excluded tokens
2. **Easy Toggle**: Quick way to show/hide excluded tokens
3. **Clear Feedback**: Pattern testing shows immediate results
4. **Preset Clarity**: Explain what each preset excludes

### Interaction Flow

1. **Default Experience**: New users see all tokens (exclusions disabled by default)
2. **Discovery**: User notices primitive tokens cluttering results
3. **Configuration**: User goes to Settings → Token Path Exclusions
4. **Quick Setup**: User enables "Primitives" preset
5. **Refined View**: Token list now shows only semantic tokens
6. **Transparency**: User can always see excluded count and toggle visibility

### Edge Cases

1. **All Tokens Excluded**: Warn user if patterns exclude everything
2. **Invalid Pattern**: Validate pattern syntax before saving
3. **Overlapping Patterns**: Handle gracefully, don't double-count
4. **Empty Token Set**: Handle case where repository has no tokens after exclusions
5. **Pattern Updates**: Re-apply exclusions when patterns change

---

## Testing Strategy

### Unit Tests

1. Glob pattern to regex conversion
2. Pattern matching accuracy
3. Preset toggle behavior
4. Exclusion result calculation

### Integration Tests

1. Full exclusion flow from settings to token list
2. Persistence of exclusion configuration
3. Real-time pattern testing
4. Toggle show/hide excluded tokens

### Manual Testing

1. Test with real token files from various design systems
2. Verify common primitive patterns are caught
3. Test edge cases (empty patterns, special characters)
4. Verify UI updates correctly when exclusions change

---

## Performance Considerations

1. **Regex Caching**: Pre-compile regex patterns
2. **Incremental Updates**: Don't re-filter entire list on toggle
3. **Lazy Evaluation**: Only compute exclusions when needed
4. **Batch Updates**: Group pattern changes before re-filtering

---

## Future Enhancements

1. **Include Patterns**: Inverse of exclude - only show matching tokens
2. **Category-based Exclusions**: Exclude by token type (color, spacing, etc.)
3. **Workspace Exclusions**: Different exclusions per Figma file
4. **Import/Export Patterns**: Share exclusion configs between team members
5. **Smart Suggestions**: Auto-suggest exclusions based on token naming patterns
