# Feature: Token Linting Mode

> **Phase 2/3 — Split Delivery** | Mode toggle + "Find untokenized layers" ships in Phase 2 (no repo dependency). "Find token value mismatches" ships in Phase 3 after provider abstraction (07) is stable.

## Overview

Add a dedicated Lint mode alongside the existing Match mode, accessible via a toggle tab bar (similar to Figma's Design/Prototype mode switch). While Match answers "where is this token used?", Lint answers "what's wrong with this component's token usage?" — starting from components and validating correctness rather than starting from tokens and finding usage.

This feature draws on proven linting patterns from FigmaCWC's token validation pipeline, adapted for TokenMatch's broader audience where token documentation maturity varies.

**Supersedes:** Roadmap item `01-missing-token-detector` — untokenized layer detection becomes the first lint check within this mode, with a more flexible scope and no dependency on a connected repository.

**Depends on:** Roadmap item `07-multiple-repository-providers` should be completed first, so the token provider abstraction is stable before lint checks that require resolved token values (e.g., value mismatch detection) are built on top of it. The "Find untokenized layers" check has no provider dependency and can ship independently.

## User Story

As a design system maintainer, I want to lint my components for token issues — missing token assignments, mismatched values — so I can catch problems before they reach production, without needing to check each token individually through the Match workflow.

## Feature Specifications

### Core Functionality

1. **Mode Toggle**
   - Top-level tab bar switching between Match and Lint modes
   - Each mode maintains independent state (selected token, scan results, etc.)
   - Mode persists across plugin sessions via `figma.clientStorage`

2. **Lint Checks (Configurable)**
   - **Find untokenized layers** — Scans for layers with visual properties (fills, strokes, typography, spacing) that have no Tokens Studio reference. Works without a repository connection. Scope: document-wide, current page, or selection.
   - **Find token value mismatches** — Compares resolved token values against actual canvas values to detect manual overrides. Requires a connected token repository. Scope: component or component set.

3. **Results Presentation**
   - Grouped by page or component, showing issue counts per group
   - Expandable groups reveal individual layer-level issues on demand
   - Each issue shows: layer name, property type, current value, and a recommendation
   - Actions per issue: navigate to layer, apply recommended fix

4. **Lint Settings**
   - Toggle individual checks on/off
   - Per-check scope configuration
   - Checks requiring a repo connection are disabled (with explanation) when no repo is configured

### User Interface

#### Mode Toggle (Top-Level Tab Bar)

```
┌────────────────────────────────────────────────────────────┐
│ ┌──────────────────────┬──────────────────────┐            │
│ │        Match         │         Lint         │            │
│ └──────────────────────┴──────────────────────┘            │
│                                                            │
│  [Lint mode content below]                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The active tab has a highlighted background and bottom border, matching Figma's native tab bar styling. The inactive tab is subdued but clearly clickable.

#### Lint Mode — Check Selection

```
┌────────────────────────────────────────────────────────────┐
│ ┌──────────────────────┬──────────────────────┐            │
│ │        Match         │  ▪ Lint              │            │
│ └──────────────────────┴──────────────────────┘            │
│                                                            │
│  Lint Checks                                               │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ☑  Find untokenized layers                           │  │
│  │    Layers with visual properties but no token ref    │  │
│  │    Scope: [All Pages ▼]                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ☑  Find token value mismatches                       │  │
│  │    Canvas values differ from resolved token values   │  │
│  │    Scope: [Current Selection ▼]                      │  │
│  │    ⚠ Requires connected repository                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  [ Run Lint ]                                              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

When no repository is connected, the "Find token value mismatches" check shows a disabled state with helper text: "Connect a token repository in Match mode to enable this check."

#### Lint Mode — Results (Grouped Summary)

```
┌────────────────────────────────────────────────────────────┐
│ ┌──────────────────────┬──────────────────────┐            │
│ │        Match         │  ▪ Lint              │            │
│ └──────────────────────┴──────────────────────┘            │
│                                                            │
│  Lint Results                                 [ Re-run ]   │
│                                                            │
│  ┌ Untokenized Layers ──────────────────── 47 issues ──┐  │
│  │                                                      │  │
│  │  ▸ Page: Components         18 issues                │  │
│  │  ▸ Page: Templates          12 issues                │  │
│  │  ▸ Page: Icons               9 issues                │  │
│  │  ▸ Page: Patterns            8 issues                │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌ Token Value Mismatches ──────────────── 3 issues ───┐  │
│  │                                                      │  │
│  │  ▸ Button / Primary          2 issues                │  │
│  │  ▸ Card / Elevated           1 issue                 │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

#### Lint Mode — Results (Expanded Group)

```
┌────────────────────────────────────────────────────────────┐
│  ┌ Untokenized Layers ──────────────────── 47 issues ──┐  │
│  │                                                      │  │
│  │  ▾ Page: Components         18 issues                │  │
│  │                                                      │  │
│  │    Button / Primary                                  │  │
│  │    ├─ Background fill: #3B82F6              [ → ]   │  │
│  │    │  Suggest: ids.color.action.primary.default      │  │
│  │    ├─ Border radius: 8px                    [ → ]   │  │
│  │    │  Suggest: ids.borderRadius.md                   │  │
│  │    └─ Padding horizontal: 16px              [ → ]   │  │
│  │       Suggest: ids.spacing.4                         │  │
│  │                                                      │  │
│  │    Input / Default                                   │  │
│  │    ├─ Border color: #D1D5DB                 [ → ]   │  │
│  │    │  Suggest: ids.color.element.border.default      │  │
│  │    └─ Font size: 14px                       [ → ]   │  │
│  │       Suggest: ids.fontSize.sm                       │  │
│  │                                                      │  │
│  │  ▸ Page: Templates          12 issues                │  │
│  │  ...                                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The `[ → ]` button navigates to that specific layer in Figma. Suggestions appear when a repository is connected and a likely token match exists; otherwise only the raw value is shown.

#### Lint Mode — Value Mismatch Detail

```
┌────────────────────────────────────────────────────────────┐
│  ┌ Token Value Mismatches ──────────────── 3 issues ───┐  │
│  │                                                      │  │
│  │  ▾ Button / Primary          2 issues                │  │
│  │                                                      │  │
│  │    Layer: Background                        [ → ]   │  │
│  │    Token: ids.color.action.primary.default           │  │
│  │    Expected: #2563EB                                 │  │
│  │    Actual:   #3B82F6                                 │  │
│  │    ℹ Canvas value differs from token — manual        │  │
│  │      override or stale token reference               │  │
│  │                                                      │  │
│  │    Layer: Label                              [ → ]   │  │
│  │    Token: ids.color.action.onPrimary.default         │  │
│  │    Expected: #FFFFFF                                 │  │
│  │    Actual:   #F3F4F6                                 │  │
│  │    ℹ Canvas value differs from token — manual        │  │
│  │      override or stale token reference               │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/linting.ts`)

```typescript
/**
 * Supported lint check identifiers.
 */
type LintCheckId = 'untokenized-layers' | 'value-mismatch';

/**
 * Scope options for lint checks.
 */
type LintScope = 'all-pages' | 'current-page' | 'selection';

/**
 * Configuration for a single lint check.
 */
interface LintCheckConfig {
  id: LintCheckId;
  enabled: boolean;
  scope: LintScope;
  requiresRepo: boolean;
}

/**
 * Overall lint mode configuration.
 */
interface LintConfig {
  checks: LintCheckConfig[];
}

/**
 * Severity of a lint issue.
 */
type LintSeverity = 'error' | 'warning' | 'info';

/**
 * A single lint issue found on a layer.
 */
interface LintIssue {
  checkId: LintCheckId;
  severity: LintSeverity;
  layerId: string;
  layerName: string;
  layerPath: string[];               // Path from component root
  propertyType: 'color' | 'typography' | 'spacing' | 'effect';
  propertyName: string;              // e.g., "fill", "borderRadius", "fontSize"
  currentValue: string;              // What's on the canvas
  expectedValue?: string;            // For value mismatch: what the token resolves to
  tokenReference?: string;           // Token path if one exists
  suggestion?: {
    tokenPath: string;
    confidence: number;
  };
  message: string;                   // Human-readable explanation
}

/**
 * Lint issues grouped by component.
 */
interface ComponentLintResult {
  componentId: string;
  componentName: string;
  pageId: string;
  pageName: string;
  issues: LintIssue[];
}

/**
 * Top-level lint result with summary counts.
 */
interface LintResult {
  checkId: LintCheckId;
  components: ComponentLintResult[];
  summary: {
    totalIssues: number;
    byPage: Record<string, number>;  // pageId → count
    byPropertyType: Record<string, number>;
  };
}

/**
 * Complete result for a lint run (all checks combined).
 */
interface LintRunResult {
  results: LintResult[];
  totalIssues: number;
  scannedComponents: number;
  duration: number;                   // ms
}
```

### Service Layer

#### New Service: `lint-service.ts`

```typescript
// services/lint-service.ts

import { FigmaComponentServiceOptimized } from './figma-component-service-optimized';
import { TokenMatchingService } from './token-matching-service';

export class LintService {
  private componentService: FigmaComponentServiceOptimized;
  private matchingService: TokenMatchingService;

  constructor(
    componentService: FigmaComponentServiceOptimized,
    matchingService: TokenMatchingService
  ) {
    this.componentService = componentService;
    this.matchingService = matchingService;
  }

  /**
   * Run all enabled lint checks.
   */
  async runLint(
    config: LintConfig,
    tokens: ParsedToken[] | null,
    options: {
      onProgress?: (progress: { check: string; percent: number }) => void;
    }
  ): Promise<LintRunResult> {
    const startTime = Date.now();
    const results: LintResult[] = [];
    let scannedComponents = 0;

    for (const check of config.checks) {
      if (!check.enabled) continue;
      if (check.requiresRepo && !tokens) continue;

      options.onProgress?.({ check: check.id, percent: 0 });

      const components = await this.componentService.scanComponents({
        scope: this.mapScope(check.scope),
        onProgress: (p) => options.onProgress?.({
          check: check.id,
          percent: p.percent
        })
      });

      scannedComponents = Math.max(scannedComponents, components.length);

      switch (check.id) {
        case 'untokenized-layers':
          results.push(this.checkUntokenizedLayers(components));
          break;
        case 'value-mismatch':
          results.push(this.checkValueMismatches(components, tokens!));
          break;
      }
    }

    return {
      results,
      totalIssues: results.reduce((sum, r) => sum + r.summary.totalIssues, 0),
      scannedComponents,
      duration: Date.now() - startTime
    };
  }

  /**
   * Check: Find layers with visual properties but no token reference.
   *
   * Inspects fills, strokes, typography, spacing, and effects.
   * Does NOT require a connected repository — only reads Tokens Studio
   * plugin data on each node.
   */
  private checkUntokenizedLayers(
    components: ComponentProperties[]
  ): LintResult {
    const componentResults: ComponentLintResult[] = [];

    for (const component of components) {
      const issues = this.detectUntokenizedProperties(component);
      if (issues.length > 0) {
        componentResults.push({
          componentId: component.id,
          componentName: component.name,
          pageId: component.pageId,
          pageName: component.pageName,
          issues
        });
      }
    }

    return this.buildLintResult('untokenized-layers', componentResults);
  }

  /**
   * Walk a component's properties and flag those without token references.
   */
  private detectUntokenizedProperties(
    component: ComponentProperties
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    // Check color properties (fills, strokes)
    for (const color of component.colors) {
      if (!color.tokenReference) {
        issues.push({
          checkId: 'untokenized-layers',
          severity: 'warning',
          layerId: color.layerId || component.id,
          layerName: color.layerName || component.name,
          layerPath: color.layerPath || [component.name],
          propertyType: 'color',
          propertyName: `${color.source} color`,
          currentValue: color.hex,
          message: `${color.source} color ${color.hex} has no token reference`
        });
      }
    }

    // Check typography properties
    for (const typo of component.typography) {
      if (!typo.tokenReference) {
        issues.push({
          checkId: 'untokenized-layers',
          severity: 'warning',
          layerId: typo.layerId || component.id,
          layerName: typo.layerName || component.name,
          layerPath: typo.layerPath || [component.name],
          propertyType: 'typography',
          propertyName: 'typography',
          currentValue: `${typo.fontFamily} ${typo.fontSize}/${typo.lineHeight}`,
          message: `Typography has no token reference`
        });
      }
    }

    // Check spacing properties (padding, gap, border-radius)
    for (const spacing of component.spacing) {
      if (!spacing.tokenReference) {
        issues.push({
          checkId: 'untokenized-layers',
          severity: 'info',
          layerId: spacing.layerId || component.id,
          layerName: spacing.layerName || component.name,
          layerPath: spacing.layerPath || [component.name],
          propertyType: 'spacing',
          propertyName: spacing.type,
          currentValue: `${spacing.value}${spacing.unit || 'px'}`,
          message: `${spacing.type} value ${spacing.value}${spacing.unit || 'px'} has no token reference`
        });
      }
    }

    // Check effect properties (shadows, blurs)
    for (const effect of component.effects) {
      if (!effect.tokenReference) {
        issues.push({
          checkId: 'untokenized-layers',
          severity: 'info',
          layerId: effect.layerId || component.id,
          layerName: effect.layerName || component.name,
          layerPath: effect.layerPath || [component.name],
          propertyType: 'effect',
          propertyName: effect.type,
          currentValue: this.formatEffectValue(effect),
          message: `${effect.type} effect has no token reference`
        });
      }
    }

    return issues;
  }

  /**
   * Check: Find layers where the token reference exists but the canvas
   * value doesn't match the resolved token value.
   *
   * Requires resolved token values from a connected repository.
   */
  private checkValueMismatches(
    components: ComponentProperties[],
    tokens: ParsedToken[]
  ): LintResult {
    const componentResults: ComponentLintResult[] = [];

    // Build lookup for fast token resolution
    const tokenByPath = new Map<string, ParsedToken>();
    for (const token of tokens) {
      tokenByPath.set(token.path.join('.'), token);
      // Also index by name for flexible matching
      tokenByPath.set(token.name, token);
    }

    for (const component of components) {
      const issues = this.detectValueMismatches(component, tokenByPath);
      if (issues.length > 0) {
        componentResults.push({
          componentId: component.id,
          componentName: component.name,
          pageId: component.pageId,
          pageName: component.pageName,
          issues
        });
      }
    }

    return this.buildLintResult('value-mismatch', componentResults);
  }

  /**
   * Compare resolved token values against canvas values for a component.
   */
  private detectValueMismatches(
    component: ComponentProperties,
    tokenByPath: Map<string, ParsedToken>
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    // Check color properties with token references
    for (const color of component.colors) {
      if (!color.tokenReference) continue;

      const token = tokenByPath.get(color.tokenReference);
      if (!token) continue;

      const expectedHex = this.normalizeColor(token.value);
      const actualHex = this.normalizeColor(color.hex);

      if (expectedHex && actualHex && expectedHex !== actualHex) {
        issues.push({
          checkId: 'value-mismatch',
          severity: 'error',
          layerId: color.layerId || component.id,
          layerName: color.layerName || component.name,
          layerPath: color.layerPath || [component.name],
          propertyType: 'color',
          propertyName: `${color.source} color`,
          currentValue: actualHex,
          expectedValue: expectedHex,
          tokenReference: color.tokenReference,
          message: `Token ${color.tokenReference} resolves to ${expectedHex} but canvas shows ${actualHex}`
        });
      }
    }

    // Check spacing properties with token references
    for (const spacing of component.spacing) {
      if (!spacing.tokenReference) continue;

      const token = tokenByPath.get(spacing.tokenReference);
      if (!token) continue;

      const expectedValue = this.normalizeDimension(token.value);
      const actualValue = spacing.value;

      if (expectedValue !== null && expectedValue !== actualValue) {
        issues.push({
          checkId: 'value-mismatch',
          severity: 'error',
          layerId: spacing.layerId || component.id,
          layerName: spacing.layerName || component.name,
          layerPath: spacing.layerPath || [component.name],
          propertyType: 'spacing',
          propertyName: spacing.type,
          currentValue: `${actualValue}${spacing.unit || 'px'}`,
          expectedValue: `${expectedValue}${spacing.unit || 'px'}`,
          tokenReference: spacing.tokenReference,
          message: `Token ${spacing.tokenReference} resolves to ${expectedValue} but canvas shows ${actualValue}`
        });
      }
    }

    return issues;
  }

  // --- Helpers ---

  private buildLintResult(
    checkId: LintCheckId,
    componentResults: ComponentLintResult[]
  ): LintResult {
    const byPage: Record<string, number> = {};
    const byPropertyType: Record<string, number> = {};
    let totalIssues = 0;

    for (const comp of componentResults) {
      for (const issue of comp.issues) {
        totalIssues++;
        byPage[comp.pageId] = (byPage[comp.pageId] || 0) + 1;
        byPropertyType[issue.propertyType] =
          (byPropertyType[issue.propertyType] || 0) + 1;
      }
    }

    return {
      checkId,
      components: componentResults,
      summary: { totalIssues, byPage, byPropertyType }
    };
  }

  private mapScope(scope: LintScope): string {
    switch (scope) {
      case 'all-pages': return 'allPages';
      case 'current-page': return 'currentPage';
      case 'selection': return 'selection';
    }
  }

  private normalizeColor(value: any): string | null {
    if (typeof value !== 'string') return null;
    const hex = value.replace('#', '').toLowerCase();
    // Normalize 3-char hex to 6-char
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    if (hex.length === 6 || hex.length === 8) {
      return `#${hex}`;
    }
    return null;
  }

  private normalizeDimension(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private formatEffectValue(effect: any): string {
    if (effect.type === 'drop-shadow' || effect.type === 'inner-shadow') {
      return `${effect.offsetX || 0}/${effect.offsetY || 0} ${effect.blur || 0} ${effect.spread || 0}`;
    }
    return effect.type || 'unknown';
  }
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
// --- Lint Mode ---

// Persisted lint configuration
const LINT_CONFIG_KEY = 'tokenmatch_lint_config';

const lintService = new LintService(
  figmaComponentServiceOptimized,
  tokenMatchingService
);

case 'get-lint-config':
  const lintConfig = await figma.clientStorage.getAsync(LINT_CONFIG_KEY);
  emit('lint-config', lintConfig || getDefaultLintConfig());
  break;

case 'save-lint-config':
  await figma.clientStorage.setAsync(LINT_CONFIG_KEY, msg.config);
  emit('lint-config-saved', {});
  break;

case 'run-lint':
  try {
    emit('lint-started', {});

    const lintResult = await lintService.runLint(
      msg.config,
      cachedTokens,        // null if no repo connected
      {
        onProgress: (progress) => emit('lint-progress', progress)
      }
    );

    emit('lint-result', lintResult);
  } catch (error) {
    emit('lint-error', { message: error.message });
  }
  break;

case 'lint-navigate-to-layer':
  const node = figma.getNodeById(msg.layerId);
  if (node) {
    figma.currentPage = node.parent?.type === 'PAGE'
      ? node.parent
      : figma.currentPage;
    figma.viewport.scrollAndZoomIntoView([node]);
    figma.currentPage.selection = [node];
  }
  break;
```

#### Default Configuration

```typescript
function getDefaultLintConfig(): LintConfig {
  return {
    checks: [
      {
        id: 'untokenized-layers',
        enabled: true,
        scope: 'current-page',
        requiresRepo: false
      },
      {
        id: 'value-mismatch',
        enabled: true,
        scope: 'selection',
        requiresRepo: true
      }
    ]
  };
}
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
// Top-level mode
type PluginMode = 'match' | 'lint';
const [pluginMode, setPluginMode] = useState<PluginMode>('match');

// Lint state
const [lintConfig, setLintConfig] = useState<LintConfig | null>(null);
const [lintResult, setLintResult] = useState<LintRunResult | null>(null);
const [lintRunning, setLintRunning] = useState(false);
const [lintProgress, setLintProgress] = useState<{
  check: string;
  percent: number;
} | null>(null);
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

// Persist mode across sessions
useEffect(() => {
  emit('get-lint-config');
}, []);
```

#### Mode Toggle Component

```typescript
const ModeToggle = () => (
  <div className="flex border-b border-gray-200">
    <button
      className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors
        ${pluginMode === 'match'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-500 hover:text-gray-700'
        }`}
      onClick={() => setPluginMode('match')}
    >
      Match
    </button>
    <button
      className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors
        ${pluginMode === 'lint'
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-500 hover:text-gray-700'
        }`}
      onClick={() => setPluginMode('lint')}
    >
      Lint
    </button>
  </div>
);
```

#### Lint Check Configuration Component

```typescript
const LintChecks = () => {
  if (!lintConfig) return null;

  const repoConnected = !!cachedTokens;

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Lint Checks</h3>

      {lintConfig.checks.map(check => {
        const disabled = check.requiresRepo && !repoConnected;

        return (
          <div
            key={check.id}
            className={`rounded-lg border p-3 ${
              disabled ? 'opacity-60 bg-gray-50' : 'bg-white'
            }`}
          >
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={check.enabled && !disabled}
                disabled={disabled}
                onChange={(e) => updateCheckEnabled(check.id, e.target.checked)}
                className="mt-0.5 rounded"
              />
              <div className="flex-1">
                <span className="font-medium text-sm">
                  {checkLabel(check.id)}
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  {checkDescription(check.id)}
                </p>
                {disabled && (
                  <p className="text-xs text-amber-600 mt-1">
                    Connect a token repository in Match mode to enable this check.
                  </p>
                )}
                {!disabled && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-500">
                      Scope:
                      <select
                        value={check.scope}
                        onChange={(e) =>
                          updateCheckScope(check.id, e.target.value as LintScope)
                        }
                        className="ml-2 text-xs border rounded px-1.5 py-0.5"
                      >
                        <option value="all-pages">All Pages</option>
                        <option value="current-page">Current Page</option>
                        <option value="selection">Current Selection</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            </label>
          </div>
        );
      })}

      <button
        className="w-full py-2 bg-blue-500 text-white text-sm font-medium
                   rounded-lg hover:bg-blue-600 disabled:opacity-50"
        disabled={lintRunning || !lintConfig.checks.some(c => c.enabled)}
        onClick={handleRunLint}
      >
        {lintRunning ? 'Running...' : 'Run Lint'}
      </button>
    </div>
  );
};
```

#### Lint Results Component

```typescript
const LintResults = () => {
  if (!lintResult) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Lint Results</h3>
        <button
          className="text-xs text-blue-500 hover:text-blue-700"
          onClick={handleRunLint}
        >
          Re-run
        </button>
      </div>

      {lintResult.results.map(result => (
        <LintResultGroup key={result.checkId} result={result} />
      ))}

      {lintResult.totalIssues === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No issues found.
        </div>
      )}
    </div>
  );
};

const LintResultGroup = ({ result }: { result: LintResult }) => {
  // Group components by page
  const byPage = groupByPage(result.components);

  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 bg-gray-50 border-b flex justify-between
                      items-center rounded-t-lg">
        <span className="text-sm font-medium">{checkLabel(result.checkId)}</span>
        <span className="text-xs text-gray-500">
          {result.summary.totalIssues} {result.summary.totalIssues === 1 ? 'issue' : 'issues'}
        </span>
      </div>

      <div className="divide-y">
        {Object.entries(byPage).map(([pageId, components]) => {
          const pageIssueCount = components.reduce(
            (sum, c) => sum + c.issues.length, 0
          );
          const groupKey = `${result.checkId}-${pageId}`;
          const expanded = expandedGroups.has(groupKey);

          return (
            <div key={pageId}>
              <button
                className="w-full px-3 py-2 flex justify-between items-center
                           text-sm hover:bg-gray-50"
                onClick={() => toggleGroup(groupKey)}
              >
                <span>
                  {expanded ? '▾' : '▸'} Page: {components[0].pageName}
                </span>
                <span className="text-xs text-gray-500">
                  {pageIssueCount} {pageIssueCount === 1 ? 'issue' : 'issues'}
                </span>
              </button>

              {expanded && (
                <div className="px-3 pb-3 space-y-3">
                  {components.map(comp => (
                    <LintComponentIssues key={comp.componentId} component={comp} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LintComponentIssues = ({
  component
}: {
  component: ComponentLintResult
}) => (
  <div className="ml-4">
    <div className="text-sm font-medium text-gray-700 mb-1">
      {component.componentName}
    </div>
    {component.issues.map((issue, i) => (
      <div key={i} className="flex items-start gap-2 py-1 ml-2 text-xs">
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">├─</span>
            <span className="font-medium">{issue.propertyName}:</span>
            <span className="text-gray-600">{issue.currentValue}</span>
            {issue.expectedValue && (
              <span className="text-red-500">
                (expected {issue.expectedValue})
              </span>
            )}
          </div>
          {issue.suggestion && (
            <div className="ml-4 text-blue-500">
              Suggest: {issue.suggestion.tokenPath}
            </div>
          )}
          {issue.tokenReference && !issue.suggestion && (
            <div className="ml-4 text-gray-400">
              Token: {issue.tokenReference}
            </div>
          )}
        </div>
        <button
          className="text-gray-400 hover:text-blue-500 shrink-0"
          onClick={() => emit('lint-navigate-to-layer', { layerId: issue.layerId })}
          title="Navigate to layer"
        >
          →
        </button>
      </div>
    ))}
  </div>
);
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/lint-service.ts` | Core lint orchestration and check implementations |
| `types/linting.ts` | Type definitions for lint configuration, issues, results |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add lint message handlers, instantiate LintService, persist lint config |
| `src/ui.tsx` | Add mode toggle, lint check configuration, lint results display |

---

## UI/UX Considerations

### Visual Design

1. **Mode toggle** follows Figma's native tab bar pattern — users already understand this interaction
2. **Issue severity** indicated by subtle color: errors in red, warnings in amber, info in gray
3. **Grouped results** prevent overwhelm — summary counts are always visible, details are opt-in
4. **Navigate action** (`→`) is the primary action per issue, keeping the interface clean

### Interaction Flow

1. User switches to Lint tab
2. User toggles desired checks and sets scope per check
3. User clicks "Run Lint"
4. Progress indicator shows which check is running
5. Results appear grouped by check → page → component → issue
6. User expands a page group to see individual issues
7. User clicks `→` to navigate to the offending layer in Figma
8. User reviews suggestion (if available) and fixes manually

### Edge Cases

1. **No repository connected:** Only "Find untokenized layers" is available. Value mismatch check shows disabled state with clear explanation.
2. **Empty results:** Show "No issues found" confirmation so user knows the scan completed.
3. **Very large files (1000+ issues):** Grouped-and-collapsed presentation keeps the UI responsive. Consider virtualizing the expanded list if needed.
4. **Selection scope with nothing selected:** Show inline warning "Select a component or component set to lint."
5. **Token cache expired during lint run:** Gracefully skip value mismatch checks and note in results that token data was unavailable.

---

## Relationship to Existing Roadmap Items

### 01 — Missing Token Detector
The "Find untokenized layers" lint check **supersedes** this item. The original item proposed a standalone mode with canvas to-do list generation. The lint mode approach is more flexible: it integrates into the main plugin flow, supports configurable scopes, and presents results in a navigable list rather than requiring canvas pasting. Canvas export of lint results can be added as a future enhancement to the lint mode.

### 07 — Multiple Repository Providers
Value mismatch checking depends on resolved token values from a connected repository. The provider abstraction from item 07 should be in place before building the value mismatch check, so it's built against a stable token source interface rather than the current GitHub-specific service. The "Find untokenized layers" check has **no dependency** on item 07 and can ship before it.

### 09 — Exclude Token Paths
The existing exclusion service can be leveraged during lint runs — excluded token paths should not generate false positive suggestions in the untokenized layers check.

---

## Build Order

1. **Mode toggle + UI shell** — Add the Match/Lint tab bar and empty Lint view
2. **Lint types + service skeleton** — Create `types/linting.ts` and `lint-service.ts` with the orchestration layer
3. **Find untokenized layers** — Implement the first check (no repo dependency)
4. **(After item 07)** **Find token value mismatches** — Implement using the provider abstraction
5. **Polish** — Progress indicators, edge cases, result caching

---

## Testing Strategy

### Unit Tests

1. `detectUntokenizedProperties()` with components that have mixed tokenized/untokenized properties
2. `detectValueMismatches()` with known token values vs. canvas values
3. Color normalization edge cases (3-char hex, rgba, named colors)
4. Dimension normalization (px, rem, unitless)
5. Result grouping and summary calculation

### Integration Tests

1. Full lint run with mock component data and mock tokens
2. Message passing between UI and backend for lint flow
3. Config persistence and restoration
4. Scope filtering (all pages vs. current page vs. selection)

### Manual Testing

1. Run untokenized check on a file with mixed token coverage
2. Run value mismatch check on a component with known overrides
3. Verify navigation to offending layers works across pages
4. Test with no repository connected — value mismatch should be gracefully disabled
5. Test with very large files to verify grouped results remain performant

---

## Performance Considerations

1. **Reuse component cache** — Lint should use the same `FigmaComponentServiceOptimized` cache as Match mode, avoiding duplicate scans
2. **Lazy expansion** — Only render issue details when a group is expanded
3. **Scope selection** — Default untokenized check to "Current Page" to avoid scanning the entire document on first use
4. **Token index** — Build a `Map<string, ParsedToken>` once at lint start rather than searching the token array per property
5. **Abort support** — Allow canceling a lint run if the user switches modes or changes scope mid-scan

---

## Future Enhancements

1. **Context mismatch detection** — Validate that token semantic state (hover, disabled, etc.) matches the Figma variant context. Opt-in, gated behind a setting like "my tokens follow semantic naming conventions." Draws on FigmaCWC's `context-mismatch-detector.ts` patterns.
2. **Semantic usage detection** — Validate that foreground tokens aren't used as backgrounds and vice versa. Also opt-in, requires well-documented token naming. Based on FigmaCWC's `semantic-usage-detector.ts`.
3. **Primitive token detection** — Flag direct use of tokens marked as internal, primitive, or deprecated via their `$description` field. Can leverage the existing exclusion service presets as a starting point.
4. **Canvas export of lint results** — Generate to-do list frames on the canvas (carrying forward the original item 01 concept) as an optional action from lint results.
5. **Lint result history** — Track lint results over time to show progress on token coverage.
6. **Custom lint rules** — Allow teams to define their own lint checks via configuration (e.g., "all color fills must use a token from the `semantic.color.*` namespace").
