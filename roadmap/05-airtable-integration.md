# Feature: Airtable Integration

## Overview

Push token and component relationship data directly to Airtable for collaborative design system documentation, governance workflows, and accessibility to non-Figma users.

## User Story

As a design system maintainer, I want to sync my token-component relationships to Airtable, so my team can collaboratively manage design system documentation, track token adoption, and share this data with stakeholders who don't use Figma.

## Feature Specifications

### Core Functionality

1. **Airtable Connection**
   - Authenticate with Airtable API
   - Select existing base/table or create new ones
   - Configure field mappings

2. **Data Sync Operations**
   - "Paste to Airtable" - One-time push of current data
   - "Sync to Airtable" - Update existing records, add new ones
   - "Full Refresh" - Replace all data in table

3. **Record Management**
   - Create records for token-component relationships
   - Update existing records when data changes
   - Handle linked records (tokens → components)

4. **Schema Configuration**
   - Map TokensMatch data to Airtable fields
   - Support custom field mappings
   - Create required fields if missing

### User Interface

#### Connection Setup Flow

```
┌─────────────────────────────────────────────────────────┐
│ Connect to Airtable                         Step 1 of 3 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  To connect, you'll need an Airtable Personal Access    │
│  Token with the following scopes:                       │
│  • data.records:read                                    │
│  • data.records:write                                   │
│  • schema.bases:read                                    │
│                                                         │
│  Personal Access Token                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ pat•••••••••••••••••••••••••••••••••••••••••   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Get your token from Airtable →]                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │               Test Connection                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Select Base & Table                         Step 2 of 3 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Base                                                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Design System Documentation              ▼      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Table                                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ Use existing: [Token Usage ▼]                 │   │
│  │ ○ Create new table: [________________]          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                    Next                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Configure Field Mapping                     Step 3 of 3 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Map TokensMatch data to Airtable fields:               │
│                                                         │
│  TokensMatch Field        Airtable Field                │
│  ─────────────────────────────────────────────────────  │
│  Token Path          →    [Token Path ▼]    ✓ Primary   │
│  Token Type          →    [Type ▼]                      │
│  Token Value         →    [Value ▼]                     │
│  Component Name      →    [Component ▼]                 │
│  Component Page      →    [Page ▼]                      │
│  Property Type       →    [Property ▼]                  │
│  Confidence          →    [Confidence ▼]                │
│                                                         │
│  ☑ Create missing fields automatically                  │
│  ☑ Include Figma file link in records                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Save Configuration                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Sync Interface

```
┌─────────────────────────────────────────────────────────┐
│ Airtable Sync                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Connected to: Design System Documentation              │
│  Table: Token Usage                                     │
│  Last sync: 2 hours ago (1,234 records)                │
│                                                         │
│  Sync Mode                                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ Update & Add - Update existing, add new       │   │
│  │ ○ Full Refresh - Replace all records            │   │
│  │ ○ Add Only - Only add new records               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Preview                                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ • 1,287 relationships to sync                   │   │
│  │ • 53 new records                                │   │
│  │ • 1,234 updates                                 │   │
│  │ • Estimated time: ~30 seconds                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │               Sync to Airtable                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Open in Airtable →                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/airtable.ts`)

```typescript
interface AirtableConfig {
  personalAccessToken: string;
  baseId: string;
  baseName: string;
  tableId: string;
  tableName: string;
  fieldMapping: AirtableFieldMapping;
  createMissingFields: boolean;
  includeFigmaLink: boolean;
  lastSync?: {
    timestamp: number;
    recordCount: number;
    status: 'success' | 'partial' | 'failed';
  };
}

interface AirtableFieldMapping {
  tokenPath: string;       // Airtable field ID/name
  tokenType: string;
  tokenValue: string;
  tokenDescription?: string;
  componentId: string;
  componentName: string;
  componentType: string;
  componentPage: string;
  componentVariant?: string;
  propertyType: string;
  matchedValue: string;
  confidence: string;
  figmaLink?: string;
}

interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

interface AirtableTable {
  id: string;
  name: string;
  fields: AirtableField[];
}

interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: Record<string, any>;
}

interface AirtableRecord {
  id?: string;           // Undefined for new records
  fields: Record<string, any>;
}

interface SyncPreview {
  totalRecords: number;
  newRecords: number;
  updatedRecords: number;
  deletedRecords: number;  // For full refresh
  estimatedTime: number;   // In seconds
}

interface SyncResult {
  status: 'success' | 'partial' | 'failed';
  recordsCreated: number;
  recordsUpdated: number;
  recordsDeleted: number;
  errors: Array<{ record: string; error: string }>;
  duration: number;
}
```

### Service Layer

#### New Service: `airtable-service.ts`

```typescript
// services/airtable-service.ts

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

export class AirtableService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Test connection and return user info
   */
  async testConnection(): Promise<{ valid: boolean; user?: string; error?: string }>;

  /**
   * List available bases
   */
  async listBases(): Promise<AirtableBase[]>;

  /**
   * List tables in a base
   */
  async listTables(baseId: string): Promise<AirtableTable[]>;

  /**
   * Get table schema
   */
  async getTableSchema(baseId: string, tableId: string): Promise<AirtableTable>;

  /**
   * Create a new table
   */
  async createTable(baseId: string, name: string, fields: AirtableField[]): Promise<AirtableTable>;

  /**
   * Add fields to existing table
   */
  async addFields(baseId: string, tableId: string, fields: AirtableField[]): Promise<void>;

  /**
   * Calculate sync preview
   */
  async calculateSyncPreview(
    baseId: string,
    tableId: string,
    records: AirtableRecord[],
    mode: 'update' | 'refresh' | 'add'
  ): Promise<SyncPreview>;

  /**
   * Sync records to Airtable
   */
  async syncRecords(
    baseId: string,
    tableId: string,
    records: AirtableRecord[],
    mode: 'update' | 'refresh' | 'add',
    onProgress?: (progress: number) => void
  ): Promise<SyncResult>;

  /**
   * Transform TokensMatch data to Airtable records
   */
  transformToRecords(
    matches: ComponentMatch[],
    tokens: ParsedToken[],
    mapping: AirtableFieldMapping,
    figmaFileUrl?: string
  ): AirtableRecord[];
}
```

### API Implementation

```typescript
// services/airtable-service.ts

export class AirtableService {
  private token: string;
  private rateLimitDelay = 200; // ms between requests (5 req/sec limit)

  constructor(token: string) {
    this.token = token;
  }

  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const response = await fetch(`${AIRTABLE_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async testConnection(): Promise<{ valid: boolean; user?: string; error?: string }> {
    try {
      const result = await this.request('/meta/whoami');
      return { valid: true, user: result.email };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async listBases(): Promise<AirtableBase[]> {
    const result = await this.request('/meta/bases');
    return result.bases;
  }

  async listTables(baseId: string): Promise<AirtableTable[]> {
    const result = await this.request(`/meta/bases/${baseId}/tables`);
    return result.tables;
  }

  async getTableSchema(baseId: string, tableId: string): Promise<AirtableTable> {
    const tables = await this.listTables(baseId);
    const table = tables.find(t => t.id === tableId || t.name === tableId);
    if (!table) throw new Error('Table not found');
    return table;
  }

  async createTable(
    baseId: string,
    name: string,
    fields: Omit<AirtableField, 'id'>[]
  ): Promise<AirtableTable> {
    return this.request(`/meta/bases/${baseId}/tables`, {
      method: 'POST',
      body: JSON.stringify({ name, fields })
    });
  }

  async addFields(
    baseId: string,
    tableId: string,
    fields: Omit<AirtableField, 'id'>[]
  ): Promise<void> {
    // Add fields one at a time (Airtable limitation)
    for (const field of fields) {
      await this.request(`/meta/bases/${baseId}/tables/${tableId}/fields`, {
        method: 'POST',
        body: JSON.stringify(field)
      });
      await this.delay(this.rateLimitDelay);
    }
  }

  async syncRecords(
    baseId: string,
    tableId: string,
    records: AirtableRecord[],
    mode: 'update' | 'refresh' | 'add',
    onProgress?: (progress: number) => void
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      status: 'success',
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      errors: [],
      duration: 0
    };

    try {
      // If full refresh, delete existing records first
      if (mode === 'refresh') {
        await this.deleteAllRecords(baseId, tableId);
        result.recordsDeleted = await this.getRecordCount(baseId, tableId);
      }

      // Batch records (Airtable limit: 10 per request)
      const batches = this.batchRecords(records, 10);
      let processed = 0;

      for (const batch of batches) {
        try {
          if (mode === 'add' || mode === 'refresh') {
            await this.createRecords(baseId, tableId, batch);
            result.recordsCreated += batch.length;
          } else {
            // Update mode: upsert based on primary field
            const upsertResult = await this.upsertRecords(baseId, tableId, batch);
            result.recordsCreated += upsertResult.created;
            result.recordsUpdated += upsertResult.updated;
          }
        } catch (err) {
          result.errors.push({
            record: batch.map(r => r.fields.tokenPath || 'unknown').join(', '),
            error: err.message
          });
        }

        processed += batch.length;
        onProgress?.(processed / records.length);
        await this.delay(this.rateLimitDelay);
      }

      result.status = result.errors.length > 0 ? 'partial' : 'success';
    } catch (err) {
      result.status = 'failed';
      result.errors.push({ record: 'all', error: err.message });
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  private async createRecords(
    baseId: string,
    tableId: string,
    records: AirtableRecord[]
  ): Promise<void> {
    await this.request(`/${baseId}/${tableId}`, {
      method: 'POST',
      body: JSON.stringify({
        records: records.map(r => ({ fields: r.fields }))
      })
    });
  }

  private async upsertRecords(
    baseId: string,
    tableId: string,
    records: AirtableRecord[]
  ): Promise<{ created: number; updated: number }> {
    const result = await this.request(`/${baseId}/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        performUpsert: {
          fieldsToMergeOn: ['Token Path'] // Primary key field
        },
        records: records.map(r => ({ fields: r.fields }))
      })
    });

    // Count created vs updated
    let created = 0;
    let updated = 0;
    for (const record of result.records) {
      if (record.createdTime === record.fields._createdTime) {
        created++;
      } else {
        updated++;
      }
    }

    return { created, updated };
  }

  private async deleteAllRecords(baseId: string, tableId: string): Promise<void> {
    // Get all record IDs
    let offset: string | undefined;
    const recordIds: string[] = [];

    do {
      const params = new URLSearchParams({ pageSize: '100' });
      if (offset) params.set('offset', offset);

      const result = await this.request(`/${baseId}/${tableId}?${params}`);
      recordIds.push(...result.records.map((r: any) => r.id));
      offset = result.offset;
      await this.delay(this.rateLimitDelay);
    } while (offset);

    // Delete in batches of 10
    const batches = this.batchRecords(recordIds.map(id => ({ id })), 10);
    for (const batch of batches) {
      const params = new URLSearchParams();
      batch.forEach(r => params.append('records[]', r.id!));
      await this.request(`/${baseId}/${tableId}?${params}`, { method: 'DELETE' });
      await this.delay(this.rateLimitDelay);
    }
  }

  transformToRecords(
    matches: ComponentMatch[],
    tokens: ParsedToken[],
    mapping: AirtableFieldMapping,
    figmaFileUrl?: string
  ): AirtableRecord[] {
    const records: AirtableRecord[] = [];
    const tokenLookup = new Map(tokens.map(t => [t.path.join('.'), t]));

    for (const match of matches) {
      for (const detail of match.matches) {
        const token = tokenLookup.get(detail.tokenValue);

        const fields: Record<string, any> = {};

        // Map fields based on configuration
        if (mapping.tokenPath) {
          fields[mapping.tokenPath] = detail.tokenValue;
        }
        if (mapping.tokenType && token) {
          fields[mapping.tokenType] = token.type;
        }
        if (mapping.tokenValue && token) {
          fields[mapping.tokenValue] = formatTokenValue(token.value);
        }
        if (mapping.tokenDescription && token?.description) {
          fields[mapping.tokenDescription] = token.description;
        }
        if (mapping.componentId) {
          fields[mapping.componentId] = match.component.id;
        }
        if (mapping.componentName) {
          fields[mapping.componentName] = match.component.name;
        }
        if (mapping.componentType) {
          fields[mapping.componentType] = match.component.type;
        }
        if (mapping.componentPage) {
          fields[mapping.componentPage] = match.component.pageName;
        }
        if (mapping.componentVariant && match.component.variantName) {
          fields[mapping.componentVariant] = match.component.variantName;
        }
        if (mapping.propertyType) {
          fields[mapping.propertyType] = detail.propertyType;
        }
        if (mapping.matchedValue) {
          fields[mapping.matchedValue] = detail.matchedValue;
        }
        if (mapping.confidence) {
          fields[mapping.confidence] = detail.confidence;
        }
        if (mapping.figmaLink && figmaFileUrl) {
          fields[mapping.figmaLink] = `${figmaFileUrl}?node-id=${match.component.id}`;
        }

        records.push({ fields });
      }
    }

    return records;
  }

  private batchRecords<T>(records: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < records.length; i += batchSize) {
      batches.push(records.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getRecordCount(baseId: string, tableId: string): Promise<number> {
    const result = await this.request(
      `/${baseId}/${tableId}?pageSize=1&fields%5B%5D=_`
    );
    return result.records.length; // This is a simplified count
  }
}
```

### Manifest Modifications

```json
// manifest.json - add Airtable domains
{
  "networkAccess": {
    "allowedDomains": [
      "https://api.github.com",
      "https://raw.githubusercontent.com",
      "https://api.airtable.com"
    ]
  }
}
```

### Backend Modifications (`main.ts`)

#### New Message Handlers

```typescript
case 'airtable-test-connection':
  const airtableService = new AirtableService(msg.token);
  const connectionResult = await airtableService.testConnection();
  emit('airtable-connection-result', connectionResult);
  break;

case 'airtable-list-bases':
  const svc1 = new AirtableService(msg.token);
  const bases = await svc1.listBases();
  emit('airtable-bases', bases);
  break;

case 'airtable-list-tables':
  const svc2 = new AirtableService(msg.token);
  const tables = await svc2.listTables(msg.baseId);
  emit('airtable-tables', tables);
  break;

case 'airtable-sync-preview':
  const svc3 = new AirtableService(airtableConfig.personalAccessToken);
  const records = svc3.transformToRecords(
    cachedMatchResults,
    fetchedTokens,
    airtableConfig.fieldMapping,
    figmaFileUrl
  );
  const preview = await svc3.calculateSyncPreview(
    airtableConfig.baseId,
    airtableConfig.tableId,
    records,
    msg.mode
  );
  emit('airtable-sync-preview', preview);
  break;

case 'airtable-sync':
  const svc4 = new AirtableService(airtableConfig.personalAccessToken);
  const syncRecords = svc4.transformToRecords(
    cachedMatchResults,
    fetchedTokens,
    airtableConfig.fieldMapping,
    figmaFileUrl
  );
  const syncResult = await svc4.syncRecords(
    airtableConfig.baseId,
    airtableConfig.tableId,
    syncRecords,
    msg.mode,
    (progress) => emit('airtable-sync-progress', { progress })
  );
  emit('airtable-sync-result', syncResult);
  break;

case 'save-airtable-config':
  await figma.clientStorage.setAsync('airtable-config', msg.config);
  airtableConfig = msg.config;
  emit('airtable-config-saved');
  break;
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
const [airtableConfig, setAirtableConfig] = useState<AirtableConfig | null>(null);
const [airtableSetupStep, setAirtableSetupStep] = useState<1 | 2 | 3>(1);
const [airtableBases, setAirtableBases] = useState<AirtableBase[]>([]);
const [airtableTables, setAirtableTables] = useState<AirtableTable[]>([]);
const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
const [syncProgress, setSyncProgress] = useState<number>(0);
const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
```

#### Setup Wizard Component

```typescript
const AirtableSetupWizard = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [token, setToken] = useState('');
  const [selectedBase, setSelectedBase] = useState<AirtableBase | null>(null);
  const [selectedTable, setSelectedTable] = useState<AirtableTable | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [useNewTable, setUseNewTable] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<AirtableFieldMapping>(defaultMapping);

  // ... render steps based on current step
  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`w-8 h-1 rounded ${s <= step ? 'bg-blue-500' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {step === 1 && <TokenInputStep />}
      {step === 2 && <BaseTableSelectionStep />}
      {step === 3 && <FieldMappingStep />}
    </div>
  );
};
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/airtable-service.ts` | Airtable API integration |
| `types/airtable.ts` | Type definitions for Airtable data |

### Modified Files

| File | Changes |
|------|---------|
| `manifest.json` | Add Airtable API domain |
| `src/main.ts` | Add message handlers for Airtable operations |
| `src/ui.tsx` | Add setup wizard and sync interface |

---

## UI/UX Considerations

### Visual Design

1. **Setup Wizard**: Step-by-step guided configuration
2. **Connection Status**: Clear indicator of connected state
3. **Sync Progress**: Real-time progress bar during sync
4. **Error Display**: Clear error messages with recovery actions

### Interaction Flow

1. User clicks "Connect to Airtable"
2. Setup wizard guides through:
   - API token input and verification
   - Base and table selection
   - Field mapping configuration
3. User saves configuration
4. User can sync anytime with one click
5. Progress and results displayed in real-time

### Security Considerations

1. **Token Storage**: Store encrypted in Figma clientStorage
2. **Token Scope**: Request minimal required scopes
3. **No Token Display**: Mask token after entry
4. **Revocation Guidance**: Help users revoke if needed

---

## Testing Strategy

### Unit Tests

1. `transformToRecords()` with various data shapes
2. `batchRecords()` correct batch splitting
3. Field mapping application accuracy

### Integration Tests

1. Mock Airtable API responses
2. Full sync workflow end-to-end
3. Error handling for API failures
4. Rate limiting behavior

### Manual Testing

1. Test with real Airtable bases
2. Verify record creation/updates work correctly
3. Test with large datasets (1000+ records)
4. Verify linked fields if implemented

---

## Performance Considerations

1. **Batch Operations**: Send 10 records per API call (Airtable max)
2. **Rate Limiting**: Respect 5 req/sec limit with delays
3. **Progress Updates**: Update UI without blocking sync
4. **Chunked Sync**: Allow cancellation between batches

---

## Error Handling

1. **Invalid Token**: Clear message to check/regenerate token
2. **Rate Limited**: Auto-retry with backoff
3. **Partial Failures**: Continue with other records, report failures
4. **Network Issues**: Retry logic with timeout
5. **Schema Mismatch**: Offer to create missing fields

---

## Future Enhancements

1. **Two-Way Sync**: Read changes from Airtable back
2. **Linked Tables**: Create separate Token and Component tables with links
3. **Automation Triggers**: Webhooks for Airtable automations
4. **Custom Views**: Create pre-configured Airtable views
5. **Multi-Base Support**: Sync to multiple bases
6. **Scheduled Sync**: Auto-sync on file save or interval
7. **Conflict Resolution**: Handle concurrent edits in Airtable
