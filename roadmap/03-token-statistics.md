# Feature: Token Statistics Dashboard

## Overview

Provide comprehensive analytics on token usage patterns across the design system, helping teams understand adoption, identify optimization opportunities, and make data-driven decisions about their design tokens.

## User Story

As a design system maintainer, I want to see analytics and insights about how tokens are being used across my Figma file, so I can identify popular tokens, underutilized tokens, components with high/low token coverage, and overall adoption metrics.

## Feature Specifications

### Core Functionality

1. **Token Usage Rankings**
   - Most frequently used tokens
   - Least used tokens (excluding unused)
   - Usage breakdown by token type

2. **Component Coverage Analysis**
   - Components with highest token coverage
   - Components with lowest token coverage
   - Average coverage across file

3. **Distribution Analytics**
   - Token usage by type (color, spacing, typography, effects)
   - Token usage by page
   - Token concentration (which components use the most tokens)

4. **Trend Indicators**
   - Token coverage percentage
   - Tokenization progress metrics

### User Interface

#### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Token Statistics Dashboard                              [Export ▼]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   Token Coverage │  │  Total Tokens    │  │  Components      │  │
│  │      73.4%       │  │     156 used     │  │    248 scanned   │  │
│  │   ████████░░     │  │   of 234 total   │  │    182 tokenized │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                     │
│  Most Used Tokens                           Token Distribution      │
│  ─────────────────────────────────────────  ───────────────────     │
│  1. ids.color.primary.500      87 uses     │ ████████ Color 45%    │
│  2. ids.spacing.4              72 uses     │ █████ Spacing 28%     │
│  3. ids.color.text.primary     65 uses     │ ███ Typography 15%    │
│  4. ids.borderRadius.md        54 uses     │ ██ Effects 12%        │
│  5. ids.spacing.2              48 uses     │                       │
│  ─────────────────────────────────────────  ───────────────────     │
│                                                                     │
│  Top Tokenized Components                   Page Breakdown          │
│  ─────────────────────────────────────────  ───────────────────     │
│  1. Button            98% (24/24 props)    │ Components    156 refs │
│  2. Card              95% (19/20 props)    │ Patterns       89 refs │
│  3. Input             92% (23/25 props)    │ Templates      45 refs │
│  4. Badge             90% (9/10 props)     │ Playground     23 refs │
│  5. Avatar            88% (7/8 props)      │                       │
│  ─────────────────────────────────────────  ───────────────────     │
│                                                                     │
│  Least Tokenized Components (Coverage < 50%)                        │
│  ─────────────────────────────────────────────────────────────────  │
│  ⚠️ LegacyHeader      12% (2/17 props)   [View] [Add to Todo]      │
│  ⚠️ OldNavigation     23% (5/22 props)   [View] [Add to Todo]      │
│  ⚠️ DeprecatedCard    34% (6/18 props)   [View] [Add to Todo]      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/statistics.ts`)

```typescript
interface TokenUsageStats {
  tokenPath: string;
  token: ParsedToken;
  usageCount: number;
  componentIds: string[];
  propertyTypes: Record<string, number>;  // { fill: 5, stroke: 2 }
  pageDistribution: Record<string, number>; // { Components: 10, Patterns: 5 }
}

interface ComponentCoverageStats {
  component: ComponentProperties;
  totalProperties: number;
  tokenizedProperties: number;
  coveragePercentage: number;
  tokensByType: {
    color: { total: number; tokenized: number };
    spacing: { total: number; tokenized: number };
    typography: { total: number; tokenized: number };
    effects: { total: number; tokenized: number };
  };
}

interface TokenTypeDistribution {
  type: TokenType;
  totalTokens: number;
  usedTokens: number;
  totalUsageCount: number;
  percentage: number;
}

interface PageStatistics {
  pageName: string;
  componentCount: number;
  tokenReferenceCount: number;
  averageCoverage: number;
  topTokens: TokenUsageStats[];
}

interface StatisticsDashboardData {
  summary: {
    totalTokensInRepo: number;
    tokensUsed: number;
    tokensUnused: number;
    totalComponents: number;
    componentsWithTokens: number;
    overallCoverage: number;
  };
  tokenUsage: {
    mostUsed: TokenUsageStats[];
    leastUsed: TokenUsageStats[];
    byType: TokenTypeDistribution[];
  };
  componentCoverage: {
    highest: ComponentCoverageStats[];
    lowest: ComponentCoverageStats[];
    average: number;
    distribution: Array<{ range: string; count: number }>; // 0-25%, 25-50%, etc.
  };
  pageBreakdown: PageStatistics[];
  generatedAt: number;
}
```

### Service Layer

#### New Service: `statistics-service.ts`

```typescript
// services/statistics-service.ts

export class StatisticsService {
  /**
   * Generate comprehensive statistics dashboard data
   */
  generateDashboardData(
    tokens: ParsedToken[],
    components: ComponentProperties[],
    matches: ComponentMatch[]
  ): StatisticsDashboardData;

  /**
   * Calculate token usage statistics
   */
  calculateTokenUsage(
    tokens: ParsedToken[],
    matches: ComponentMatch[]
  ): {
    mostUsed: TokenUsageStats[];
    leastUsed: TokenUsageStats[];
    byType: TokenTypeDistribution[];
  };

  /**
   * Calculate component coverage statistics
   */
  calculateComponentCoverage(
    components: ComponentProperties[]
  ): {
    highest: ComponentCoverageStats[];
    lowest: ComponentCoverageStats[];
    average: number;
    distribution: Array<{ range: string; count: number }>;
  };

  /**
   * Calculate per-page statistics
   */
  calculatePageStatistics(
    components: ComponentProperties[],
    matches: ComponentMatch[]
  ): PageStatistics[];
}
```

### Algorithm: Token Usage Calculation

```typescript
function calculateTokenUsage(
  tokens: ParsedToken[],
  matches: ComponentMatch[]
): Map<string, TokenUsageStats> {
  const usageMap = new Map<string, TokenUsageStats>();

  // Initialize all tokens with zero usage
  for (const token of tokens) {
    const path = token.path.join('.');
    usageMap.set(path, {
      tokenPath: path,
      token,
      usageCount: 0,
      componentIds: [],
      propertyTypes: {},
      pageDistribution: {}
    });
  }

  // Count usage from matches
  for (const match of matches) {
    for (const detail of match.matches) {
      const tokenPath = detail.tokenValue;
      const stats = usageMap.get(tokenPath);

      if (stats) {
        stats.usageCount++;
        if (!stats.componentIds.includes(match.component.id)) {
          stats.componentIds.push(match.component.id);
        }

        // Track property type
        const propType = detail.propertyType;
        stats.propertyTypes[propType] = (stats.propertyTypes[propType] || 0) + 1;

        // Track page distribution
        const page = match.component.pageName;
        stats.pageDistribution[page] = (stats.pageDistribution[page] || 0) + 1;
      }
    }
  }

  return usageMap;
}

function rankTokenUsage(
  usageMap: Map<string, TokenUsageStats>,
  limit: number = 10
): { mostUsed: TokenUsageStats[]; leastUsed: TokenUsageStats[] } {
  const allStats = Array.from(usageMap.values());

  // Filter to only used tokens for "least used" ranking
  const usedTokens = allStats.filter(s => s.usageCount > 0);

  const mostUsed = [...allStats]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);

  const leastUsed = [...usedTokens]
    .sort((a, b) => a.usageCount - b.usageCount)
    .slice(0, limit);

  return { mostUsed, leastUsed };
}
```

### Algorithm: Component Coverage Calculation

```typescript
function calculateComponentCoverage(
  component: ComponentProperties
): ComponentCoverageStats {
  const tokensByType = {
    color: { total: 0, tokenized: 0 },
    spacing: { total: 0, tokenized: 0 },
    typography: { total: 0, tokenized: 0 },
    effects: { total: 0, tokenized: 0 }
  };

  // Count colors
  for (const color of component.colors) {
    tokensByType.color.total++;
    if (color.tokenReference) {
      tokensByType.color.tokenized++;
    }
  }

  // Count spacing
  for (const spacing of component.spacing) {
    tokensByType.spacing.total++;
    if (spacing.tokenReference) {
      tokensByType.spacing.tokenized++;
    }
  }

  // Count typography
  for (const typo of component.typography) {
    tokensByType.typography.total++;
    if (typo.tokenReference) {
      tokensByType.typography.tokenized++;
    }
  }

  // Count effects
  for (const effect of component.effects) {
    tokensByType.effects.total++;
    if (effect.tokenReference) {
      tokensByType.effects.tokenized++;
    }
  }

  const totalProperties =
    tokensByType.color.total +
    tokensByType.spacing.total +
    tokensByType.typography.total +
    tokensByType.effects.total;

  const tokenizedProperties =
    tokensByType.color.tokenized +
    tokensByType.spacing.tokenized +
    tokensByType.typography.tokenized +
    tokensByType.effects.tokenized;

  return {
    component,
    totalProperties,
    tokenizedProperties,
    coveragePercentage: totalProperties > 0
      ? (tokenizedProperties / totalProperties) * 100
      : 0,
    tokensByType
  };
}

function calculateCoverageDistribution(
  coverageStats: ComponentCoverageStats[]
): Array<{ range: string; count: number }> {
  const ranges = [
    { range: '0-25%', min: 0, max: 25 },
    { range: '25-50%', min: 25, max: 50 },
    { range: '50-75%', min: 50, max: 75 },
    { range: '75-100%', min: 75, max: 100 }
  ];

  return ranges.map(r => ({
    range: r.range,
    count: coverageStats.filter(
      s => s.coveragePercentage >= r.min && s.coveragePercentage < r.max
    ).length
  }));
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
case 'generate-statistics':
  const statsService = new StatisticsService();

  // Use cached data if available
  const dashboardData = statsService.generateDashboardData(
    fetchedTokens,
    cachedComponents,
    cachedMatchResults
  );

  emit('statistics-result', dashboardData);
  break;

case 'export-statistics':
  const format = msg.format; // 'json' | 'csv'
  const stats = cachedStatistics;

  if (format === 'json') {
    const json = JSON.stringify(stats, null, 2);
    emit('statistics-export', { format: 'json', data: json });
  } else {
    const csv = convertStatsToCsv(stats);
    emit('statistics-export', { format: 'csv', data: csv });
  }
  break;
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
const [statisticsData, setStatisticsData] = useState<StatisticsDashboardData | null>(null);
const [statsView, setStatsView] = useState<'overview' | 'tokens' | 'components' | 'pages'>('overview');
const [statsLoading, setStatsLoading] = useState(false);
```

#### New UI Components

```typescript
const StatisticsDashboard = ({ data }: { data: StatisticsDashboardData }) => (
  <div className="space-y-4">
    {/* Summary Cards */}
    <div className="grid grid-cols-3 gap-2">
      <SummaryCard
        label="Token Coverage"
        value={`${data.summary.overallCoverage.toFixed(1)}%`}
        subtext={`${data.summary.tokensUsed}/${data.summary.totalTokensInRepo} tokens used`}
        color="blue"
      />
      <SummaryCard
        label="Components"
        value={data.summary.componentsWithTokens}
        subtext={`of ${data.summary.totalComponents} have tokens`}
        color="green"
      />
      <SummaryCard
        label="Avg Coverage"
        value={`${data.componentCoverage.average.toFixed(1)}%`}
        subtext="per component"
        color="purple"
      />
    </div>

    {/* View Tabs */}
    <div className="flex border-b">
      <TabButton active={statsView === 'overview'} onClick={() => setStatsView('overview')}>
        Overview
      </TabButton>
      <TabButton active={statsView === 'tokens'} onClick={() => setStatsView('tokens')}>
        Tokens
      </TabButton>
      <TabButton active={statsView === 'components'} onClick={() => setStatsView('components')}>
        Components
      </TabButton>
      <TabButton active={statsView === 'pages'} onClick={() => setStatsView('pages')}>
        Pages
      </TabButton>
    </div>

    {/* View Content */}
    {statsView === 'overview' && <OverviewView data={data} />}
    {statsView === 'tokens' && <TokensView data={data} />}
    {statsView === 'components' && <ComponentsView data={data} />}
    {statsView === 'pages' && <PagesView data={data} />}
  </div>
);

const OverviewView = ({ data }: { data: StatisticsDashboardData }) => (
  <div className="space-y-4">
    {/* Token Distribution Chart */}
    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2">Token Distribution by Type</h3>
      {data.tokenUsage.byType.map(dist => (
        <div key={dist.type} className="flex items-center gap-2 mb-1">
          <span className="w-20 text-sm capitalize">{dist.type}</span>
          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${dist.percentage}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-12 text-right">
            {dist.percentage.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>

    {/* Top Tokens */}
    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2">Most Used Tokens</h3>
      {data.tokenUsage.mostUsed.slice(0, 5).map((stats, i) => (
        <div key={stats.tokenPath} className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-4">{i + 1}.</span>
            <TokenPreview token={stats.token} size="sm" />
            <span className="font-mono text-xs">{stats.tokenPath}</span>
          </div>
          <span className="text-sm text-gray-600">{stats.usageCount} uses</span>
        </div>
      ))}
    </div>

    {/* Coverage Distribution */}
    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2">Coverage Distribution</h3>
      {data.componentCoverage.distribution.map(d => (
        <div key={d.range} className="flex items-center gap-2 mb-1">
          <span className="w-16 text-sm">{d.range}</span>
          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{
                width: `${(d.count / data.summary.totalComponents) * 100}%`
              }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">
            {d.count}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const TokensView = ({ data }: { data: StatisticsDashboardData }) => (
  <div className="space-y-4">
    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2">Most Used</h3>
      {data.tokenUsage.mostUsed.map((stats, i) => (
        <TokenStatsRow key={stats.tokenPath} stats={stats} rank={i + 1} />
      ))}
    </div>

    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2">Least Used (Active)</h3>
      {data.tokenUsage.leastUsed.map((stats, i) => (
        <TokenStatsRow key={stats.tokenPath} stats={stats} rank={i + 1} />
      ))}
    </div>
  </div>
);

const ComponentsView = ({ data }: { data: StatisticsDashboardData }) => (
  <div className="space-y-4">
    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2">Highest Coverage</h3>
      {data.componentCoverage.highest.map(stats => (
        <ComponentCoverageRow key={stats.component.id} stats={stats} />
      ))}
    </div>

    <div className="border rounded-lg p-3">
      <h3 className="font-semibold mb-2 text-yellow-600">Needs Attention (Below 50%)</h3>
      {data.componentCoverage.lowest
        .filter(s => s.coveragePercentage < 50)
        .map(stats => (
          <ComponentCoverageRow key={stats.component.id} stats={stats} showWarning />
        ))}
    </div>
  </div>
);
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/statistics-service.ts` | Core statistics calculation logic |
| `types/statistics.ts` | Type definitions for statistics data |

### Modified Files

| File | Changes |
|------|---------|
| `src/main.ts` | Add message handlers for statistics generation |
| `src/ui.tsx` | Add statistics dashboard view and components |

---

## UI/UX Considerations

### Visual Design

1. **Summary Cards**: Prominent metrics at the top
2. **Progress Bars**: Visual representation of percentages
3. **Color Coding**: Green for good coverage, yellow/red for low coverage
4. **Micro Charts**: Small bar charts for distributions

### Interaction Flow

1. User navigates to "Statistics" tab/view
2. Dashboard loads with cached data or prompts scan
3. User can:
   - Switch between overview/tokens/components/pages views
   - Click on tokens to see detailed usage
   - Click on components to navigate in Figma
   - Export statistics data

### Responsive Considerations

- Cards stack vertically on narrow plugin widths
- Tables become scrollable lists
- Charts adapt to available space

---

## Testing Strategy

### Unit Tests

1. `calculateTokenUsage()` with various match scenarios
2. `calculateComponentCoverage()` accuracy
3. `calculateCoverageDistribution()` bucket assignment
4. Edge cases: no matches, all tokens used, etc.

### Integration Tests

1. Full statistics generation workflow
2. Verify calculations match expected results
3. Test with varying dataset sizes

### Manual Testing

1. Compare statistics with manual count
2. Verify rankings are correct
3. Test navigation from statistics to Figma elements
4. Performance with large files (1000+ components)

---

## Performance Considerations

1. **Aggregate During Scan**: Calculate stats as part of scan process
2. **Cache Statistics**: Store generated stats with timestamp
3. **Incremental Updates**: Update stats when individual scans complete
4. **Lazy Loading**: Load detailed views on demand

---

## Future Enhancements

1. **Historical Tracking**: Compare stats across plugin sessions
2. **Goals & Targets**: Set coverage goals, track progress
3. **Alerts**: Notify when coverage drops below threshold
4. **Team Comparisons**: Compare stats across team files
5. **Custom Metrics**: Allow users to define their own statistics
6. **Visualization Export**: Export charts as images
