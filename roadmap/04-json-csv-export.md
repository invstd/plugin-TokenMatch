# Feature: JSON/CSV Export

## Overview

Generate downloadable files documenting the relationships between tokens and components for external documentation, auditing, integration with other tools, or offline analysis.

## User Story

As a design system maintainer, I want to export token-component relationship data in standard formats (JSON, CSV), so I can create documentation, integrate with other tools, perform offline analysis, or share data with stakeholders who don't use Figma.

## Feature Specifications

### Core Functionality

1. **Export Formats**
   - **JSON**: Full structured data with nested relationships
   - **CSV**: Flattened tabular data for spreadsheet analysis

2. **Export Scopes**
   - All token-component relationships
   - Filtered by token type
   - Filtered by page
   - Current search/scan results only

3. **Data Included**
   - Token information (path, type, value)
   - Component information (name, type, page, variants)
   - Match details (property type, confidence, matched value)
   - Optional: statistics summary

4. **Delivery Methods**
   - Copy to clipboard (primary - Figma plugin limitation)
   - Browser download trigger via data URL

### User Interface

#### Export Dialog

```
┌─────────────────────────────────────────────────────────┐
│ Export Token-Component Relationships                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Format                                                 │
│  ┌─────────────┐  ┌─────────────┐                      │
│  │    JSON     │  │     CSV     │                      │
│  │   ● ──────  │  │   ┌─┬─┬─┐  │                      │
│  │   ● ──────  │  │   ├─┼─┼─┤  │                      │
│  │   ● ──────  │  │   └─┴─┴─┘  │                      │
│  └─────────────┘  └─────────────┘                      │
│       ○ Selected        ○                              │
│                                                         │
│  Scope                                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ All relationships (1,234 rows)                │   │
│  │ ○ Current results only (56 rows)                │   │
│  │ ○ Selected token type: [Color ▼]                │   │
│  │ ○ Selected page: [Components ▼]                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Include                                                │
│  ☑ Token metadata (type, value, description)           │
│  ☑ Component metadata (page, variants)                 │
│  ☑ Match details (confidence, property type)           │
│  ☐ Statistics summary                                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │               Copy to Clipboard                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │               Download File                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Output Formats

#### JSON Format

```json
{
  "exportInfo": {
    "generatedAt": "2024-01-15T10:30:00Z",
    "pluginVersion": "1.2.0",
    "figmaFile": "Design System v3",
    "scope": "all",
    "totalRelationships": 1234
  },
  "tokens": [
    {
      "path": "ids.color.primary.500",
      "type": "color",
      "value": "#3B82F6",
      "description": "Primary brand color",
      "usageCount": 87,
      "components": [
        {
          "id": "123:456",
          "name": "Button",
          "type": "COMPONENT_SET",
          "page": "Components",
          "variants": ["Primary", "Secondary"],
          "matches": [
            {
              "property": "fill color",
              "propertyType": "color",
              "matchedValue": "#3B82F6",
              "confidence": 1.0,
              "layer": "Background"
            }
          ]
        }
      ]
    }
  ],
  "statistics": {
    "totalTokens": 234,
    "usedTokens": 156,
    "totalComponents": 248,
    "averageCoverage": 73.4
  }
}
```

#### CSV Format

```csv
token_path,token_type,token_value,component_id,component_name,component_type,page,variant,property_type,matched_value,confidence
ids.color.primary.500,color,#3B82F6,123:456,Button,COMPONENT_SET,Components,Primary,fill color,#3B82F6,1.0
ids.color.primary.500,color,#3B82F6,123:456,Button,COMPONENT_SET,Components,Secondary,fill color,#3B82F6,1.0
ids.spacing.4,dimension,16px,123:789,Card,COMPONENT,Components,,padding,16px,1.0
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/export.ts`)

```typescript
interface ExportOptions {
  format: 'json' | 'csv';
  scope: 'all' | 'current' | 'token-type' | 'page';
  scopeFilter?: string;  // Token type or page name
  include: {
    tokenMetadata: boolean;
    componentMetadata: boolean;
    matchDetails: boolean;
    statistics: boolean;
  };
}

interface ExportInfo {
  generatedAt: string;
  pluginVersion: string;
  figmaFile: string;
  scope: string;
  totalRelationships: number;
}

interface TokenExportData {
  path: string;
  type: string;
  value: string;
  description?: string;
  usageCount: number;
  components: ComponentExportData[];
}

interface ComponentExportData {
  id: string;
  name: string;
  type: string;
  page: string;
  variants?: string[];
  matches: MatchExportData[];
}

interface MatchExportData {
  property: string;
  propertyType: string;
  matchedValue: string;
  confidence: number;
  layer?: string;
}

interface CSVRow {
  token_path: string;
  token_type: string;
  token_value: string;
  token_description: string;
  component_id: string;
  component_name: string;
  component_type: string;
  page: string;
  variant: string;
  property_type: string;
  matched_value: string;
  confidence: number;
}

interface ExportResult {
  format: 'json' | 'csv';
  data: string;
  filename: string;
  rowCount: number;
}
```

### Service Layer

#### New Service: `export-service.ts`

```typescript
// services/export-service.ts

export class ExportService {
  /**
   * Generate export data in specified format
   */
  generateExport(
    tokens: ParsedToken[],
    matches: ComponentMatch[],
    options: ExportOptions,
    statistics?: StatisticsDashboardData
  ): ExportResult;

  /**
   * Convert matches to JSON export format
   */
  toJSON(
    tokens: ParsedToken[],
    matches: ComponentMatch[],
    options: ExportOptions,
    statistics?: StatisticsDashboardData
  ): string;

  /**
   * Convert matches to CSV export format
   */
  toCSV(
    tokens: ParsedToken[],
    matches: ComponentMatch[],
    options: ExportOptions
  ): string;

  /**
   * Filter data by scope
   */
  filterByScope(
    matches: ComponentMatch[],
    scope: ExportOptions['scope'],
    filter?: string
  ): ComponentMatch[];

  /**
   * Generate filename based on options
   */
  generateFilename(options: ExportOptions): string;
}
```

### Algorithm: JSON Export Generation

```typescript
function generateJSONExport(
  tokens: ParsedToken[],
  matches: ComponentMatch[],
  options: ExportOptions,
  statistics?: StatisticsDashboardData
): string {
  // Group matches by token
  const tokenMap = new Map<string, ComponentMatch[]>();

  for (const match of matches) {
    for (const detail of match.matches) {
      const tokenPath = detail.tokenValue;
      if (!tokenMap.has(tokenPath)) {
        tokenMap.set(tokenPath, []);
      }
      tokenMap.get(tokenPath)!.push(match);
    }
  }

  // Build export structure
  const exportData = {
    exportInfo: {
      generatedAt: new Date().toISOString(),
      pluginVersion: PLUGIN_VERSION,
      figmaFile: figma.root.name,
      scope: options.scope,
      totalRelationships: matches.reduce((sum, m) => sum + m.matches.length, 0)
    },
    tokens: [] as TokenExportData[]
  };

  // Add token data
  for (const token of tokens) {
    const tokenPath = token.path.join('.');
    const tokenMatches = tokenMap.get(tokenPath) || [];

    if (tokenMatches.length === 0 && options.scope !== 'all') {
      continue; // Skip unused tokens unless exporting all
    }

    const tokenExport: TokenExportData = {
      path: tokenPath,
      type: token.type,
      value: formatTokenValue(token.value),
      usageCount: tokenMatches.length,
      components: []
    };

    if (options.include.tokenMetadata && token.description) {
      tokenExport.description = token.description;
    }

    // Add component data
    for (const match of tokenMatches) {
      const componentExport: ComponentExportData = {
        id: match.component.id,
        name: match.component.name,
        type: match.component.type,
        page: match.component.pageName,
        matches: []
      };

      if (options.include.componentMetadata && match.component.variantName) {
        componentExport.variants = [match.component.variantName];
      }

      if (options.include.matchDetails) {
        componentExport.matches = match.matches
          .filter(d => d.tokenValue === tokenPath)
          .map(d => ({
            property: d.property,
            propertyType: d.propertyType,
            matchedValue: d.matchedValue,
            confidence: d.confidence
          }));
      }

      tokenExport.components.push(componentExport);
    }

    exportData.tokens.push(tokenExport);
  }

  // Add statistics if requested
  if (options.include.statistics && statistics) {
    (exportData as any).statistics = {
      totalTokens: statistics.summary.totalTokensInRepo,
      usedTokens: statistics.summary.tokensUsed,
      totalComponents: statistics.summary.totalComponents,
      averageCoverage: statistics.componentCoverage.average
    };
  }

  return JSON.stringify(exportData, null, 2);
}
```

### Algorithm: CSV Export Generation

```typescript
function generateCSVExport(
  tokens: ParsedToken[],
  matches: ComponentMatch[],
  options: ExportOptions
): string {
  const rows: CSVRow[] = [];

  // Build token lookup
  const tokenLookup = new Map<string, ParsedToken>();
  for (const token of tokens) {
    tokenLookup.set(token.path.join('.'), token);
  }

  // Generate rows (one per match detail)
  for (const match of matches) {
    for (const detail of match.matches) {
      const token = tokenLookup.get(detail.tokenValue);

      const row: CSVRow = {
        token_path: detail.tokenValue,
        token_type: token?.type || '',
        token_value: token ? formatTokenValue(token.value) : '',
        token_description: token?.description || '',
        component_id: match.component.id,
        component_name: match.component.name,
        component_type: match.component.type,
        page: match.component.pageName,
        variant: match.component.variantName || '',
        property_type: detail.propertyType,
        matched_value: detail.matchedValue,
        confidence: detail.confidence
      };

      rows.push(row);
    }
  }

  // Convert to CSV string
  return convertToCSV(rows, options);
}

function convertToCSV(rows: CSVRow[], options: ExportOptions): string {
  if (rows.length === 0) {
    return '';
  }

  // Determine columns based on options
  const allColumns: (keyof CSVRow)[] = [
    'token_path',
    'token_type',
    'token_value',
    'token_description',
    'component_id',
    'component_name',
    'component_type',
    'page',
    'variant',
    'property_type',
    'matched_value',
    'confidence'
  ];

  const columns = allColumns.filter(col => {
    if (!options.include.tokenMetadata && col === 'token_description') return false;
    if (!options.include.componentMetadata && col === 'variant') return false;
    if (!options.include.matchDetails && (col === 'matched_value' || col === 'confidence')) return false;
    return true;
  });

  // Build CSV
  const lines: string[] = [];

  // Header
  lines.push(columns.join(','));

  // Data rows
  for (const row of rows) {
    const values = columns.map(col => {
      const value = row[col];
      // Escape values that contain commas, quotes, or newlines
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
case 'generate-export':
  const exportService = new ExportService();

  const exportResult = exportService.generateExport(
    fetchedTokens,
    cachedMatchResults,
    msg.options,
    cachedStatistics
  );

  emit('export-result', exportResult);
  break;

case 'copy-to-clipboard':
  // Note: Figma plugins can't access system clipboard directly
  // The UI will handle this via document.execCommand or Clipboard API
  emit('clipboard-data', { data: msg.data });
  break;
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
const [showExportDialog, setShowExportDialog] = useState(false);
const [exportOptions, setExportOptions] = useState<ExportOptions>({
  format: 'json',
  scope: 'all',
  include: {
    tokenMetadata: true,
    componentMetadata: true,
    matchDetails: true,
    statistics: false
  }
});
const [exportResult, setExportResult] = useState<ExportResult | null>(null);
const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
```

#### New UI Components

```typescript
const ExportDialog = ({ onClose }: { onClose: () => void }) => {
  const handleExport = () => {
    emit('generate-export', { options: exportOptions });
  };

  const handleCopyToClipboard = async () => {
    if (!exportResult) return;

    try {
      await navigator.clipboard.writeText(exportResult.data);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = exportResult.data;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleDownload = () => {
    if (!exportResult) return;

    const blob = new Blob([exportResult.data], {
      type: exportOptions.format === 'json' ? 'application/json' : 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-80 max-h-96 overflow-y-auto">
        <h2 className="font-semibold mb-4">Export Relationships</h2>

        {/* Format Selection */}
        <div className="mb-4">
          <label className="text-sm font-medium">Format</label>
          <div className="flex gap-2 mt-1">
            <button
              className={`flex-1 py-2 rounded border ${
                exportOptions.format === 'json' ? 'border-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => setExportOptions(o => ({ ...o, format: 'json' }))}
            >
              JSON
            </button>
            <button
              className={`flex-1 py-2 rounded border ${
                exportOptions.format === 'csv' ? 'border-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => setExportOptions(o => ({ ...o, format: 'csv' }))}
            >
              CSV
            </button>
          </div>
        </div>

        {/* Scope Selection */}
        <div className="mb-4">
          <label className="text-sm font-medium">Scope</label>
          <div className="mt-1 space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={exportOptions.scope === 'all'}
                onChange={() => setExportOptions(o => ({ ...o, scope: 'all' }))}
              />
              <span className="text-sm">All relationships</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={exportOptions.scope === 'current'}
                onChange={() => setExportOptions(o => ({ ...o, scope: 'current' }))}
              />
              <span className="text-sm">Current results only</span>
            </label>
          </div>
        </div>

        {/* Include Options */}
        <div className="mb-4">
          <label className="text-sm font-medium">Include</label>
          <div className="mt-1 space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.include.tokenMetadata}
                onChange={e => setExportOptions(o => ({
                  ...o,
                  include: { ...o.include, tokenMetadata: e.target.checked }
                }))}
              />
              <span className="text-sm">Token metadata</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.include.componentMetadata}
                onChange={e => setExportOptions(o => ({
                  ...o,
                  include: { ...o.include, componentMetadata: e.target.checked }
                }))}
              />
              <span className="text-sm">Component metadata</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.include.matchDetails}
                onChange={e => setExportOptions(o => ({
                  ...o,
                  include: { ...o.include, matchDetails: e.target.checked }
                }))}
              />
              <span className="text-sm">Match details</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={exportOptions.include.statistics}
                onChange={e => setExportOptions(o => ({
                  ...o,
                  include: { ...o.include, statistics: e.target.checked }
                }))}
              />
              <span className="text-sm">Statistics summary</span>
            </label>
          </div>
        </div>

        {/* Preview/Status */}
        {exportResult && (
          <div className="mb-4 p-2 bg-gray-50 rounded text-xs">
            <div>{exportResult.rowCount} relationships</div>
            <div>{(exportResult.data.length / 1024).toFixed(1)} KB</div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <button
            className="w-full py-2 bg-blue-500 text-white rounded"
            onClick={exportResult ? handleCopyToClipboard : handleExport}
          >
            {exportResult
              ? copyStatus === 'copied'
                ? '✓ Copied!'
                : 'Copy to Clipboard'
              : 'Generate Export'}
          </button>

          {exportResult && (
            <button
              className="w-full py-2 border border-gray-300 rounded"
              onClick={handleDownload}
            >
              Download File
            </button>
          )}

          <button
            className="w-full py-2 text-gray-500"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/export-service.ts` | Core export generation logic |
| `types/export.ts` | Type definitions for export options and results |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add message handlers for export generation |
| `src/ui.tsx` | Add export dialog and related UI |

---

## UI/UX Considerations

### Visual Design

1. **Format Icons**: Visual distinction between JSON and CSV
2. **Size Preview**: Show estimated file size before generation
3. **Progress Indicator**: For large exports that take time
4. **Success Feedback**: Clear indication when copy succeeds

### Interaction Flow

1. User clicks "Export" button in toolbar
2. Export dialog opens with options
3. User selects format, scope, and inclusions
4. User clicks "Generate Export"
5. Preview shows row count and size
6. User clicks "Copy to Clipboard" or "Download File"
7. Success feedback displayed

### Accessibility

- Keyboard navigation through dialog
- Screen reader announcements for status changes
- Focus management when dialog opens/closes

---

## Testing Strategy

### Unit Tests

1. `generateJSONExport()` output structure validity
2. `generateCSVExport()` proper escaping
3. `filterByScope()` correct filtering
4. Edge cases: empty data, special characters, large datasets

### Integration Tests

1. Full export workflow end-to-end
2. Verify JSON parses correctly
3. Verify CSV imports into spreadsheet tools
4. Test clipboard functionality across browsers

### Manual Testing

1. Import exported JSON into JSON validators
2. Import exported CSV into Excel/Google Sheets
3. Verify data integrity after round-trip
4. Test with files of varying complexity

---

## Performance Considerations

1. **Streaming for Large Exports**: Process in chunks to avoid UI freeze
2. **Web Workers**: Consider offloading CSV generation to worker
3. **Compression Option**: Offer gzipped download for very large exports
4. **Cancel Support**: Allow user to cancel long-running exports

---

## Security Considerations

1. **Sanitize Data**: Ensure no XSS vectors in exported data
2. **No Sensitive Data**: Confirm no API keys or secrets in export
3. **Filename Sanitization**: Prevent path traversal in download filenames

---

## Future Enhancements

1. **Custom Templates**: User-defined export schemas
2. **Scheduled Exports**: Automatic periodic exports
3. **Direct Integration**: Push to Google Sheets, Notion, etc.
4. **Diff Export**: Export only changes since last export
5. **Multiple Format Download**: Export JSON and CSV simultaneously
