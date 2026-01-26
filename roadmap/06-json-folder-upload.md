# Feature: JSON/Folder Upload

## Overview

Allow users to upload token files directly via JSON file upload or folder selection instead of requiring a GitHub repository connection. This provides flexibility for teams who don't use GitHub or want to work with local token files.

## User Story

As a designer or developer, I want to upload my design token files directly from my computer or paste JSON content, so I can use TokensMatch without needing to connect to a GitHub repository.

## Feature Specifications

### Core Functionality

1. **JSON File Upload**
   - Single JSON file upload via file picker
   - Drag-and-drop support for JSON files
   - Paste JSON content directly into a text area
   - Support for multiple JSON formats (Style Dictionary, Tokens Studio, W3C DTCG)

2. **Folder Upload**
   - Select a folder containing multiple token files
   - Recursive scanning of nested directories
   - Auto-detection of token file structure
   - Support for common token organization patterns (themes, brands, platforms)

3. **Format Detection**
   - Automatic detection of token format from file structure
   - Support for common naming conventions
   - Fallback to manual format selection if auto-detect fails

4. **Token Persistence**
   - Store uploaded tokens in plugin storage for session persistence
   - Option to save as "workspace" for quick reload
   - Clear/reset uploaded tokens functionality

### User Interface

#### New UI Elements

1. **Source Selection Screen**
   - Tab or toggle: "GitHub Repository" | "Upload Files"
   - Clear visual distinction between connection methods
   - Remember last used method

2. **Upload Interface**
   ```
   ┌─────────────────────────────────────────────────────────┐
   │ Upload Token Files                                       │
   ├─────────────────────────────────────────────────────────┤
   │                                                         │
   │  ┌─────────────────────────────────────────────────┐   │
   │  │                                                 │   │
   │  │     📁 Drop files here or click to browse      │   │
   │  │                                                 │   │
   │  │     Supports: .json, folders                   │   │
   │  │                                                 │   │
   │  └─────────────────────────────────────────────────┘   │
   │                                                         │
   │  ── OR ──                                               │
   │                                                         │
   │  📋 Paste JSON                                          │
   │  ┌─────────────────────────────────────────────────┐   │
   │  │ {                                               │   │
   │  │   "colors": {                                   │   │
   │  │     "primary": { "$value": "#3B82F6" }         │   │
   │  │   }                                             │   │
   │  │ }                                               │   │
   │  └─────────────────────────────────────────────────┘   │
   │                                                         │
   │  Format: [Auto-detect ▼]                               │
   │                                                         │
   │  [ Load Tokens ]                                        │
   └─────────────────────────────────────────────────────────┘
   ```

3. **Loaded Files Preview**
   - List of uploaded files with file names
   - Token count per file
   - Option to remove individual files
   - "Clear All" button

4. **Format Selection Dropdown**
   - Auto-detect (default)
   - Style Dictionary
   - Tokens Studio (tokens.json)
   - W3C Design Tokens (DTCG)
   - Custom/Generic JSON

### Supported Token Formats

#### Style Dictionary Format
```json
{
  "color": {
    "base": {
      "primary": {
        "value": "#3B82F6",
        "type": "color"
      }
    }
  }
}
```

#### Tokens Studio Format
```json
{
  "colors": {
    "primary": {
      "$value": "#3B82F6",
      "$type": "color"
    }
  }
}
```

#### W3C DTCG Format
```json
{
  "$name": "Design Tokens",
  "color": {
    "primary": {
      "$value": "#3B82F6",
      "$type": "color"
    }
  }
}
```

#### Folder Structure Support
```
tokens/
├── core/
│   ├── colors.json
│   ├── spacing.json
│   └── typography.json
├── themes/
│   ├── light.json
│   └── dark.json
└── brands/
    ├── brand-a.json
    └── brand-b.json
```

---

## Technical Implementation

### Data Structures

#### New Types (add to `types/tokens.ts`)

```typescript
interface UploadedTokenSource {
  type: 'file' | 'folder' | 'paste';
  name: string;                      // File name or folder name
  files: UploadedFile[];
  format: TokenFormat;
  uploadedAt: Date;
}

interface UploadedFile {
  name: string;
  path: string;                      // Relative path within folder
  content: string;                   // Raw JSON content
  size: number;
  tokenCount?: number;
}

type TokenFormat =
  | 'auto'
  | 'style-dictionary'
  | 'tokens-studio'
  | 'w3c-dtcg'
  | 'generic';

interface TokenSourceConfig {
  type: 'github' | 'upload';
  github?: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
  };
  upload?: UploadedTokenSource;
}
```

### Service Layer

#### New Service: `upload-token-service.ts`

```typescript
// services/upload-token-service.ts

export class UploadTokenService {
  /**
   * Process uploaded files and extract tokens
   */
  async processUpload(
    files: FileList | File[],
    options: {
      format?: TokenFormat;
      recursive?: boolean;
    }
  ): Promise<UploadedTokenSource>;

  /**
   * Parse JSON content and detect format
   */
  parseTokenContent(
    content: string,
    format: TokenFormat
  ): ParsedToken[];

  /**
   * Auto-detect token format from content structure
   */
  detectFormat(content: object): TokenFormat;

  /**
   * Merge multiple files into unified token set
   */
  mergeTokenFiles(
    files: UploadedFile[]
  ): ParsedToken[];

  /**
   * Validate uploaded tokens
   */
  validateTokens(
    tokens: ParsedToken[]
  ): { valid: boolean; errors: ValidationError[] };

  /**
   * Save tokens to plugin storage
   */
  async persistTokens(
    source: UploadedTokenSource
  ): Promise<void>;

  /**
   * Load persisted tokens
   */
  async loadPersistedTokens(): Promise<UploadedTokenSource | null>;

  /**
   * Clear persisted tokens
   */
  async clearPersistedTokens(): Promise<void>;
}
```

### UI Modifications (`ui.tsx`)

#### New State

```typescript
// Add to existing state in ui.tsx
const [sourceType, setSourceType] = useState<'github' | 'upload'>('github');
const [uploadedSource, setUploadedSource] = useState<UploadedTokenSource | null>(null);
const [uploadFormat, setUploadFormat] = useState<TokenFormat>('auto');
const [pasteContent, setPasteContent] = useState<string>('');
const [isUploading, setIsUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
```

#### New UI Components

```typescript
// Source type toggle
const SourceTypeToggle = () => (
  <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
    <button
      className={`flex-1 px-3 py-2 rounded ${
        sourceType === 'github' ? 'bg-white shadow' : ''
      }`}
      onClick={() => setSourceType('github')}
    >
      <GitHubIcon className="inline mr-2" />
      GitHub Repository
    </button>
    <button
      className={`flex-1 px-3 py-2 rounded ${
        sourceType === 'upload' ? 'bg-white shadow' : ''
      }`}
      onClick={() => setSourceType('upload')}
    >
      <UploadIcon className="inline mr-2" />
      Upload Files
    </button>
  </div>
);

// File upload dropzone
const FileUploadZone = () => {
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files) {
      await processFiles(files);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      await processFiles(files);
    }
  };

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center
                 hover:border-blue-400 transition-colors cursor-pointer"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => fileInputRef.current?.click()}
    >
      <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
      <p className="mt-2 text-sm text-gray-600">
        Drop files here or click to browse
      </p>
      <p className="text-xs text-gray-400 mt-1">
        Supports: .json files and folders
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        webkitdirectory
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
};

// JSON paste area
const JsonPasteArea = () => (
  <div className="mt-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Or paste JSON content:
    </label>
    <textarea
      className="w-full h-32 p-2 border rounded-md font-mono text-sm"
      placeholder='{"colors": {"primary": {"$value": "#3B82F6"}}}'
      value={pasteContent}
      onChange={(e) => setPasteContent(e.target.value)}
    />
  </div>
);

// Format selector
const FormatSelector = () => (
  <div className="mt-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Token Format:
    </label>
    <select
      className="w-full p-2 border rounded-md"
      value={uploadFormat}
      onChange={(e) => setUploadFormat(e.target.value as TokenFormat)}
    >
      <option value="auto">Auto-detect</option>
      <option value="style-dictionary">Style Dictionary</option>
      <option value="tokens-studio">Tokens Studio</option>
      <option value="w3c-dtcg">W3C Design Tokens (DTCG)</option>
      <option value="generic">Generic JSON</option>
    </select>
  </div>
);

// Uploaded files list
const UploadedFilesList = ({ source }: { source: UploadedTokenSource }) => (
  <div className="bg-gray-50 rounded-lg p-4 mt-4">
    <div className="flex justify-between items-center mb-2">
      <h3 className="font-medium">Loaded Files</h3>
      <button
        className="text-sm text-red-500 hover:text-red-700"
        onClick={clearUploadedTokens}
      >
        Clear All
      </button>
    </div>
    <ul className="space-y-2">
      {source.files.map((file, index) => (
        <li key={index} className="flex justify-between items-center text-sm">
          <span className="flex items-center">
            <FileIcon className="mr-2 h-4 w-4 text-gray-400" />
            {file.path || file.name}
          </span>
          <span className="text-gray-400">
            {file.tokenCount} tokens
          </span>
        </li>
      ))}
    </ul>
    <div className="mt-3 pt-3 border-t text-sm text-gray-600">
      Format: {source.format} | Total: {getTotalTokenCount(source)} tokens
    </div>
  </div>
);
```

### Format Detection Algorithm

```typescript
function detectTokenFormat(content: object): TokenFormat {
  // Check for W3C DTCG format markers
  if ('$name' in content || hasTopLevelDollarKeys(content)) {
    return 'w3c-dtcg';
  }

  // Check for Tokens Studio format
  if (hasTokensStudioStructure(content)) {
    return 'tokens-studio';
  }

  // Check for Style Dictionary format
  if (hasStyleDictionaryStructure(content)) {
    return 'style-dictionary';
  }

  return 'generic';
}

function hasTokensStudioStructure(obj: object): boolean {
  // Tokens Studio uses $value and $type at token level
  return findDeep(obj, (value) =>
    typeof value === 'object' &&
    value !== null &&
    '$value' in value
  );
}

function hasStyleDictionaryStructure(obj: object): boolean {
  // Style Dictionary uses "value" (without $) at token level
  return findDeep(obj, (value) =>
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    !('$value' in value)
  );
}

function hasTopLevelDollarKeys(obj: object): boolean {
  return Object.keys(obj).some(key => key.startsWith('$'));
}
```

### File Processing

```typescript
async function processFiles(files: FileList | File[]): Promise<void> {
  setIsUploading(true);
  setUploadError(null);

  try {
    const uploadService = new UploadTokenService();
    const source = await uploadService.processUpload(Array.from(files), {
      format: uploadFormat,
      recursive: true
    });

    // Validate tokens
    const tokens = uploadService.mergeTokenFiles(source.files);
    const validation = uploadService.validateTokens(tokens);

    if (!validation.valid) {
      setUploadError(`Validation errors: ${validation.errors.map(e => e.message).join(', ')}`);
      return;
    }

    // Persist and set state
    await uploadService.persistTokens(source);
    setUploadedSource(source);

    // Emit to backend
    emit('tokens-loaded', {
      source: 'upload',
      tokens
    });

  } catch (error) {
    setUploadError(error.message);
  } finally {
    setIsUploading(false);
  }
}

async function processJsonPaste(): Promise<void> {
  if (!pasteContent.trim()) {
    setUploadError('Please paste valid JSON content');
    return;
  }

  try {
    const content = JSON.parse(pasteContent);
    const uploadService = new UploadTokenService();

    const format = uploadFormat === 'auto'
      ? uploadService.detectFormat(content)
      : uploadFormat;

    const source: UploadedTokenSource = {
      type: 'paste',
      name: 'Pasted JSON',
      files: [{
        name: 'pasted.json',
        path: '',
        content: pasteContent,
        size: pasteContent.length
      }],
      format,
      uploadedAt: new Date()
    };

    const tokens = uploadService.parseTokenContent(pasteContent, format);
    source.files[0].tokenCount = tokens.length;

    await uploadService.persistTokens(source);
    setUploadedSource(source);

    emit('tokens-loaded', {
      source: 'upload',
      tokens
    });

  } catch (error) {
    setUploadError('Invalid JSON: ' + error.message);
  }
}
```

---

## Files to Modify/Create

### New Files

| File | Purpose |
|------|---------|
| `services/upload-token-service.ts` | File upload and token parsing logic |
| `types/upload.ts` | Type definitions for upload functionality |
| `components/FileUploadZone.tsx` | Drag-and-drop file upload component |
| `components/SourceTypeToggle.tsx` | Toggle between GitHub and upload modes |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui.tsx` | Add source type toggle, upload interface, state management |
| `src/main.ts` | Handle tokens from upload source, storage persistence |
| `types/tokens.ts` | Add upload-related type extensions |

---

## UI/UX Considerations

### Visual Design

1. **Clear Mode Separation**: Distinct visual treatment for GitHub vs Upload modes
2. **Drag-and-Drop Feedback**: Highlight dropzone on drag, show upload progress
3. **Format Indicators**: Show detected/selected format with appropriate icons
4. **File Hierarchy**: When uploading folders, show nested structure

### Interaction Flow

1. User opens plugin
2. User selects "Upload Files" tab
3. User either:
   - Drags files/folder into dropzone
   - Clicks to browse and select files
   - Pastes JSON into text area
4. Format is auto-detected (or user selects manually)
5. Files are processed and validated
6. Token count and file list shown
7. User clicks "Load Tokens" to proceed
8. Normal token matching workflow begins

### Edge Cases

1. **Invalid JSON**: Show parse error with line number
2. **Unknown Format**: Prompt for manual format selection
3. **Empty Files**: Skip with warning
4. **Duplicate Tokens**: Warn user, allow override or merge
5. **Very Large Files**: Show progress, consider chunked processing
6. **Mixed Formats**: Warn if folder contains inconsistent formats

---

## Testing Strategy

### Unit Tests

1. Format detection accuracy across all supported formats
2. Token parsing for each format type
3. File merging with path preservation
4. Validation rules for token structure

### Integration Tests

1. Full upload flow from file drop to token display
2. Persistence and reload of uploaded tokens
3. Switching between GitHub and upload sources
4. Large file handling (1000+ tokens)

### Manual Testing

1. Test with real token files from various design systems
2. Verify drag-and-drop on different operating systems
3. Test folder upload with nested structures
4. Validate paste functionality with various JSON formats

---

## Performance Considerations

1. **Lazy Parsing**: Parse tokens on-demand, not all at once
2. **Web Workers**: Process large files in background thread
3. **Streaming**: For very large files, stream parse JSON
4. **Caching**: Cache parsed tokens to avoid re-processing
5. **Debounce Paste**: Don't parse on every keystroke

---

## Security Considerations

1. **No Server Upload**: All processing happens client-side
2. **File Size Limits**: Enforce reasonable max file size (10MB)
3. **Content Validation**: Sanitize JSON before processing
4. **No Sensitive Data**: Tokens should not contain secrets

---

## Future Enhancements

1. **URL Import**: Fetch tokens from public URLs
2. **Watch Mode**: Auto-reload when local files change (requires separate tool)
3. **Export Changes**: Export modified tokens back to files
4. **Version Comparison**: Compare uploaded vs previously uploaded versions
5. **Template Generation**: Generate starter token files from Figma styles
