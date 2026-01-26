# Token Fetching from GitHub

This document explains how TokenMatch fetches, parses, and processes design tokens from GitHub repositories.

## Table of Contents

- [Overview](#overview)
- [Setup & Configuration](#setup--configuration)
- [GitHub Connection](#github-connection)
- [Token File Discovery](#token-file-discovery)
- [Token Parsing](#token-parsing)
- [Supported Token Formats](#supported-token-formats)
- [Token Types](#token-types)
- [Troubleshooting](#troubleshooting)

---

## Overview

TokenMatch connects to your GitHub repository to fetch design tokens. It supports both public and private repositories, multiple branches, and various token file formats commonly used in design systems.

### Workflow

```
User Configuration
    ↓
GitHub API Connection
    ↓
Browse Repository Structure
    ↓
Fetch Token Files (.json, .js, .ts)
    ↓
Parse Token Files
    ↓
Normalize Token Structure
    ↓
Present Searchable Token List
```

---

## Setup & Configuration

### 1. Generate GitHub Personal Access Token

You need a GitHub Personal Access Token to fetch tokens from private repositories.

**Steps:**

1. Go to **GitHub** → **Settings** → **Developer Settings** → **Personal Access Tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Set a descriptive name (e.g., "Figma TokenMatch Plugin")
4. Select scopes:
   - For **public repositories**: No scopes needed
   - For **private repositories**: Check `repo` (Full control of private repositories)
5. Click **Generate token**
6. **Copy the token immediately** (you won't be able to see it again)

### 2. Configure in TokenMatch

In the Figma plugin:

1. Open the **Settings** panel
2. Enter your **Repository URL**:
   - Format: `https://github.com/owner/repository`
   - Example: `https://github.com/company/design-tokens`
3. Paste your **GitHub Personal Access Token**
4. (Optional) Enter a **Directory Path** if tokens are in a subdirectory:
   - Example: `tokens` or `src/tokens`
5. Click **Test Connection**

### 3. Select Branch

After successful connection:

1. Choose the branch from the dropdown (defaults to `main` or `master`)
2. Click **Fetch Tokens**

---

## GitHub Connection

### Connection Process

The `GitHubTokenService` handles all GitHub API interactions.

```typescript
const service = new GitHubTokenService({
  repoUrl: 'https://github.com/company/design-tokens',
  token: 'ghp_xxxxxxxxxxxxxxxxxxxx',
  directoryPath: 'tokens' // optional
});

// Test connection
const result = await service.testConnection();
// Returns: { success: true, repoOwner: 'company', repoName: 'design-tokens', defaultBranch: 'main' }
```

### What Happens During Connection

1. **Parse Repository URL** - Extract owner and repo name
2. **Authenticate** - Use token for API access
3. **Fetch Repository Info** - Get default branch and metadata
4. **Validate Access** - Ensure read permissions
5. **Return Status** - Success or error details

### API Endpoints Used

```
GET https://api.github.com/repos/{owner}/{repo}
GET https://api.github.com/repos/{owner}/{repo}/branches
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}
```

---

## Token File Discovery

### Automatic File Detection

TokenMatch recursively scans the repository (or specified directory) for token files.

**Supported Extensions:**
- `.json` - JSON token files
- `.js` - JavaScript files with `export` statements
- `.ts` - TypeScript files with token exports

**File Naming Patterns:**

TokenMatch looks for common design token file patterns:

```
✅ tokens.json
✅ design-tokens.json
✅ colors.json
✅ spacing.js
✅ typography.ts
✅ global.json
✅ core/primitives.json
✅ semantic/colors.json
```

### Directory Structure Example

```
design-tokens/
├── core/
│   ├── colors.json         ← Fetched
│   ├── spacing.json        ← Fetched
│   └── typography.json     ← Fetched
├── semantic/
│   ├── buttons.json        ← Fetched
│   └── forms.json          ← Fetched
├── package.json            ← Ignored
└── README.md               ← Ignored
```

### Filtering Logic

Files are **included** if:
- Extension is `.json`, `.js`, or `.ts`
- Not in `node_modules/` directory
- Not a package configuration file

Files are **excluded** if:
- `package.json`, `tsconfig.json`, `package-lock.json`
- In `.git/` directory
- In `node_modules/`
- Binary or build files

---

## Token Parsing

### Parser Architecture

The `TokenParser` service normalizes different token formats into a consistent structure.

```typescript
interface ParsedToken {
  path: string[];          // ['color', 'primary', 'blue']
  value: any;              // '#3B82F6' or { color: '...', width: '...' }
  type: TokenType;         // 'color', 'spacing', 'border', etc.
  name: string;            // 'color.primary.blue'
  description?: string;    // Optional description from token file
  original?: any;          // Original token object (for reference)
}
```

### Parsing Strategy

The parser uses a multi-pass approach:

1. **Format Detection** - Identify token format (Tokens Studio, W3C, flat, nested)
2. **Structure Traversal** - Recursively walk the token tree
3. **Type Inference** - Determine token type from value, `$type`, or context
4. **Value Extraction** - Extract the actual value (resolve `$value` or direct value)
5. **Path Construction** - Build full token path from nested structure
6. **Normalization** - Convert to standard `ParsedToken` format

---

## Supported Token Formats

### 1. Tokens Studio Format

**Most Common** - Used by the Tokens Studio Figma plugin.

```json
{
  "core": {
    "color": {
      "blue": {
        "500": {
          "value": "#3B82F6",
          "type": "color",
          "description": "Primary blue"
        }
      }
    }
  },
  "semantic": {
    "button": {
      "background": {
        "value": "{core.color.blue.500}",
        "type": "color"
      }
    }
  }
}
```

**Parsed Output:**
```typescript
[
  {
    path: ['core', 'color', 'blue', '500'],
    name: 'core.color.blue.500',
    value: '#3B82F6',
    type: 'color'
  },
  {
    path: ['semantic', 'button', 'background'],
    name: 'semantic.button.background',
    value: '{core.color.blue.500}',
    type: 'color'
  }
]
```

### 2. W3C Design Tokens Format (DTCG)

Emerging standard format.

```json
{
  "color": {
    "primary": {
      "$type": "color",
      "$value": "#3B82F6",
      "$description": "Primary brand color"
    }
  },
  "spacing": {
    "md": {
      "$type": "dimension",
      "$value": "16px"
    }
  }
}
```

**Key Features:**
- Uses `$type` instead of `type`
- Uses `$value` instead of `value`
- Uses `$description` for metadata

### 3. Flat Object Format

Simple key-value pairs.

```json
{
  "color-primary": "#3B82F6",
  "color-secondary": "#10B981",
  "spacing-sm": "8px",
  "spacing-md": "16px"
}
```

**Parsing Behavior:**
- Token path inferred from key using separators (`-`, `.`, `_`)
- Type inferred from value format

### 4. Nested Object Format

Hierarchical structure without explicit token metadata.

```json
{
  "color": {
    "primary": "#3B82F6",
    "secondary": "#10B981"
  },
  "spacing": {
    "sm": "8px",
    "md": "16px"
  }
}
```

### 5. JavaScript/TypeScript Export

```typescript
// tokens.ts
export const tokens = {
  color: {
    primary: {
      value: '#3B82F6',
      type: 'color'
    }
  }
};

// or
module.exports = {
  color: { ... }
};
```

**Parsing:** The parser evaluates the file and extracts the exported object.

### 6. Composite Tokens (Border, Typography, Shadow)

Complex tokens that combine multiple properties.

**Border Token:**
```json
{
  "border": {
    "primary": {
      "value": {
        "color": "{color.primary}",
        "width": "1px",
        "style": "solid"
      },
      "type": "border"
    }
  }
}
```

**Typography Token:**
```json
{
  "typography": {
    "heading1": {
      "value": {
        "fontFamily": "Inter",
        "fontSize": "32px",
        "fontWeight": "700",
        "lineHeight": "1.2"
      },
      "type": "typography"
    }
  }
}
```

**Shadow Token:**
```json
{
  "shadow": {
    "card": {
      "value": {
        "x": "0",
        "y": "4px",
        "blur": "12px",
        "spread": "0",
        "color": "rgba(0, 0, 0, 0.1)"
      },
      "type": "boxShadow"
    }
  }
}
```

---

## Token Types

TokenMatch recognizes and handles the following token types:

### Color Tokens

**Detected by:**
- `type: 'color'`
- Hex values (`#RRGGBB`, `#RRGGBBAA`)
- RGB/RGBA values (`rgb(...)`, `rgba(...)`)
- HSL values (`hsl(...)`, `hsla(...)`)

**Examples:**
```json
{
  "color-primary": "#3B82F6",
  "color-secondary": "rgba(16, 185, 129, 1)",
  "color-accent": "hsl(200, 95%, 50%)"
}
```

### Spacing/Dimension Tokens

**Detected by:**
- `type: 'dimension'` or `'spacing'`
- Values ending in `px`, `rem`, `em`, `%`
- Numeric values (interpreted as pixels)

**Examples:**
```json
{
  "spacing-xs": "4px",
  "spacing-sm": "8px",
  "spacing-md": "16px",
  "spacing-lg": "24px",
  "spacing-xl": "32px"
}
```

### Typography Tokens

**Detected by:**
- `type: 'typography'`
- `type: 'fontFamily'`, `'fontWeight'`, `'fontSize'`, etc.

**Examples:**
```json
{
  "font-family-base": "Inter, sans-serif",
  "font-size-base": "16px",
  "font-weight-normal": "400",
  "font-weight-bold": "700"
}
```

### Border Radius Tokens

**Detected by:**
- `type: 'borderRadius'`
- Keys containing `radius`, `rounded`

**Examples:**
```json
{
  "radius-sm": "4px",
  "radius-md": "8px",
  "radius-full": "9999px"
}
```

### Border Width Tokens

**Detected by:**
- `type: 'borderWidth'`
- Keys containing `border-width`, `stroke`

**Examples:**
```json
{
  "border-width-thin": "1px",
  "border-width-medium": "2px",
  "border-width-thick": "4px"
}
```

### Border Composite Tokens

**Detected by:**
- `type: 'border'`
- Object with `color`, `width`, `style` properties

**Example:**
```json
{
  "border-primary": {
    "value": {
      "color": "{color.primary}",
      "width": "1px",
      "style": "solid"
    },
    "type": "border"
  }
}
```

### Shadow/Effect Tokens

**Detected by:**
- `type: 'boxShadow'` or `'shadow'`
- Values matching shadow syntax

**Examples:**
```json
{
  "shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
  "shadow-md": "0 4px 6px rgba(0, 0, 0, 0.1)"
}
```

---

## Troubleshooting

### Issue: "Failed to connect to repository"

**Possible Causes:**
- Invalid repository URL format
- Repository doesn't exist or is private without proper token
- Network connectivity issues

**Solutions:**
1. Verify repository URL: `https://github.com/owner/repo`
2. For private repos, ensure token has `repo` scope
3. Test connection using GitHub's web interface first

---

### Issue: "No token files found"

**Possible Causes:**
- Tokens are in a subdirectory not specified in settings
- Token files use non-standard extensions
- Files are in `node_modules/` or other excluded directories

**Solutions:**
1. Specify the correct directory path in settings (e.g., `src/tokens`)
2. Ensure token files use `.json`, `.js`, or `.ts` extensions
3. Check file structure matches supported patterns

---

### Issue: "Tokens not parsing correctly"

**Possible Causes:**
- Unsupported token format
- Malformed JSON
- Complex token references not resolved

**Solutions:**
1. Validate JSON syntax using a JSON validator
2. Check token format matches one of the supported formats
3. Simplify token structure if using deeply nested references

---

### Issue: "Rate limit exceeded"

**Possible Causes:**
- Too many API requests to GitHub
- Shared token across multiple users/apps

**Solutions:**
1. Wait for rate limit to reset (shown in error message)
2. Use an authenticated token (higher rate limits)
3. Cache tokens locally to reduce API calls

---

## Best Practices

### 1. Organize Tokens by Category

```
tokens/
├── core/              # Primitive tokens
│   ├── colors.json
│   ├── spacing.json
│   └── typography.json
└── semantic/          # Semantic tokens
    ├── buttons.json
    └── forms.json
```

### 2. Use Token References

```json
{
  "color": {
    "blue-500": "#3B82F6"
  },
  "button": {
    "primary": {
      "background": "{color.blue-500}"
    }
  }
}
```

Benefits:
- Single source of truth
- Easier to maintain
- Better for matching in Figma

### 3. Include Descriptions

```json
{
  "color": {
    "primary": {
      "value": "#3B82F6",
      "type": "color",
      "description": "Primary brand color used for CTAs and key actions"
    }
  }
}
```

### 4. Use Consistent Naming

Choose a naming convention and stick to it:

**Kebab-case:**
```json
{
  "color-primary-blue": "#3B82F6",
  "spacing-large": "24px"
}
```

**Dot notation:**
```json
{
  "color.primary.blue": "#3B82F6",
  "spacing.large": "24px"
}
```

**Nested objects:**
```json
{
  "color": {
    "primary": {
      "blue": "#3B82F6"
    }
  }
}
```

---

## API Reference

### GitHubTokenService

```typescript
class GitHubTokenService {
  constructor(config: GitHubConfig);
  
  // Test connection and get repository info
  testConnection(): Promise<ConnectionResult>;
  
  // Fetch all branches
  getBranches(): Promise<string[]>;
  
  // Fetch and parse tokens from branch
  fetchTokens(branch: string): Promise<ParsedToken[]>;
}
```

### TokenParser

```typescript
class TokenParser {
  // Parse a single token file
  parseTokenFile(content: string, filename: string): ParsedToken[];
  
  // Detect token format
  detectFormat(data: any): TokenFormat;
  
  // Infer token type from value
  inferTokenType(value: any): TokenType;
}
```

---

## Performance Notes

### Caching

- Token files are fetched from GitHub on demand
- Results are cached in memory for the session
- Re-fetching only occurs when:
  - Branch is changed
  - "Refresh Tokens" is clicked
  - Plugin is restarted

### Large Repositories

For repositories with 100+ token files:

- Initial fetch: 3-10 seconds
- Subsequent fetches: Near-instant (cached)
- Recommendation: Use directory path to limit scope

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Related Docs**: [Token Matching](./TOKEN-MATCHING.md), [Component Pasting](./COMPONENT-PASTING.md)
