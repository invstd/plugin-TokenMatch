# Tokens Studio Integration Guide for Figma Plugins

> A comprehensive guide to parsing design tokens and matching them against Figma components when using Tokens Studio.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Token Parser Setup](#token-parser-setup)
4. [Token Matching Service](#token-matching-service)
5. [Reading Tokens Studio Data from Figma](#reading-tokens-studio-data-from-figma)
6. [Type Definitions](#type-definitions)
7. [Full Implementation Examples](#full-implementation-examples)
8. [Debugging & Troubleshooting](#debugging--troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

### What This Guide Covers

This guide explains how to build a Figma plugin that:
1. **Parses design tokens** from JSON files (supporting W3C, Tokens Studio, and nested JSON formats)
2. **Extracts token references** from Figma components that have been styled using Tokens Studio
3. **Matches tokens to components** by comparing token paths stored in Figma's plugin data

### How Tokens Studio Works

When Tokens Studio applies a token to a Figma element, it performs two operations:

1. **Resolves the token value** and applies it to the Figma property (e.g., sets fill color to `#267853`)
2. **Stores a reference** to the original token path in Figma's shared plugin data

```
┌──────────────────────────────────────────────────────────────────┐
│                     Figma Node (e.g., Button)                    │
├──────────────────────────────────────────────────────────────────┤
│  Visual Properties:                                              │
│    fills[0].color = { r: 0.15, g: 0.47, b: 0.33 }  (#267853)     │
│    cornerRadius = 8                                              │
│                                                                  │
│  Shared Plugin Data (namespace: "tokens"):                       │
│    "fill" → "ids.color.element.primary.default"                  │
│    "borderRadius" → "ids.spacing.radius.md"                      │
└──────────────────────────────────────────────────────────────────┘
```

We read these stored references to determine which token was applied to which property.

---

## Architecture

### Components Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Figma Plugin                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐     ┌──────────────────────────────────┐          │
│   │   Token Parser      │     │   GitHub Token Service           │          │
│   │   (token-parser.ts) │     │   (github-token-service.ts)      │          │
│   ├─────────────────────┤     ├──────────────────────────────────┤          │
│   │ - Parse W3C format  │     │ - Fetch tokens from GitHub       │          │
│   │ - Parse TS format   │     │ - Parse branches                 │          │
│   │ - Parse nested JSON │     │ - Auto-detect token files        │          │
│   │ - Resolve aliases   │     │ - Decode base64 content          │          │
│   │ - Validate tokens   │     └──────────────────────────────────┘          │
│   └─────────────────────┘                                                   │
│              │                                                              │
│              ▼                                                              │
│   ┌─────────────────────────────────────────────────────────────┐           │
│   │               Token Matching Service                        │           │
│   │               (token-matching-service.ts)                   │           │
│   ├─────────────────────────────────────────────────────────────┤           │
│   │  - Match by token reference path (highest confidence)       │           │
│   │  - Fallback to value matching (lower confidence)            │           │
│   │  - Support colors, typography, spacing, effects             │           │
│   └─────────────────────────────────────────────────────────────┘           │
│              │                                                              │
│              ▼                                                              │
│   ┌─────────────────────────────────────────────────────────────┐           │
│   │            Figma Component Service                          │           │
│   │            (figma-component-service.ts)                     │           │
│   ├─────────────────────────────────────────────────────────────┤           │
│   │  - Scan Figma components                                    │           │
│   │  - Extract visual properties (colors, typography, etc.)     │           │
│   │  - Read Tokens Studio plugin data                           │           │
│   │  - Read Figma Variable bindings                             │           │
│   └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
services/
├── token-parser.ts           # Parse design token JSON files
├── token-matching-service.ts # Match tokens to components
├── figma-component-service.ts # Scan Figma components & extract data
└── github-token-service.ts   # Fetch tokens from GitHub

types/
├── tokens.ts                 # Token type definitions
└── components.ts             # Component property types
```

---

## Token Parser Setup

The Token Parser handles three different token formats:

### Supported Formats

#### 1. W3C Design Tokens Format (`$value`, `$type`)

```json
{
  "colors": {
    "primary": {
      "$value": "#267853",
      "$type": "color",
      "$description": "Primary brand color"
    }
  }
}
```

#### 2. Tokens Studio Format (`value`, `type`)

```json
{
  "colors": {
    "primary": {
      "value": "#267853",
      "type": "color",
      "description": "Primary brand color"
    }
  }
}
```

#### 3. Plain Nested JSON (primitive values at leaf nodes)

```json
{
  "colors": {
    "primary": "#267853",
    "secondary": "#1a5c3e"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px"
  }
}
```

### Token Parser Implementation

```typescript
// types/tokens.ts
export type TokenType = 
  | 'color' 
  | 'dimension' 
  | 'fontFamily' 
  | 'fontWeight' 
  | 'duration' 
  | 'cubicBezier' 
  | 'number' 
  | 'string' 
  | 'boolean' 
  | 'typography' 
  | 'shadow' 
  | 'border' 
  | 'borderRadius' 
  | 'borderWidth' 
  | 'composition';

export interface ParsedToken {
  name: string;           // Token name (last segment of path)
  value: any;             // Resolved value
  type: TokenType;        // Inferred or explicit type
  path: string[];         // Full path, e.g., ['colors', 'primary', '500']
  description?: string;
  extensions?: Record<string, any>;
  aliases?: string[];     // Referenced tokens (if value is alias)
  rawValue?: any;         // Original value before resolution
}

export interface ParsedTokens {
  tokens: ParsedToken[];
  metadata?: {
    filePath: string;
    format: string;
    errors: ValidationError[];
  };
}
```

### Token Parser Class

```typescript
// services/token-parser.ts
export class TokenParser {
  private tokens: ParsedToken[] = [];
  private errors: ValidationError[] = [];
  private tokenMap: Map<string, ParsedToken> = new Map();

  /**
   * Parse a token file (JSON object)
   */
  parse(tokenFile: TokenFile, filePath: string = ''): ParsedTokens {
    this.tokens = [];
    this.errors = [];
    this.tokenMap = new Map();

    // First pass: collect all tokens (supports multiple formats)
    this.collectTokens(tokenFile, []);

    // Second pass: resolve aliases and references
    this.resolveAliases();

    // Third pass: validate tokens
    this.validateTokens();

    return {
      tokens: this.tokens,
      metadata: {
        filePath,
        format: 'auto-detected',
        errors: this.errors
      }
    };
  }

  /**
   * Collect all tokens from the token file structure
   */
  private collectTokens(obj: any, path: string[]): void {
    if (obj === null || obj === undefined) return;

    // Skip metadata keys that start with $
    const currentKey = path[path.length - 1] || '';
    if (currentKey.startsWith('$') && currentKey !== '$value' && currentKey !== '$type') {
      return;
    }

    // Check for W3C format token ($value)
    if (this.isW3CToken(obj)) {
      this.addToken(obj.$value, obj.$type, obj.$description, obj.$extensions, path);
      return;
    }

    // Check for Token Studio format (value property without $)
    if (this.isTokenStudioToken(obj)) {
      this.addToken(obj.value, obj.type, obj.description, obj.extensions, path);
      return;
    }

    // Check if this is a primitive value at a leaf node
    if (this.isPrimitiveToken(obj, path)) {
      this.addToken(obj, undefined, undefined, undefined, path);
      return;
    }

    // Recurse into objects
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      for (const key of keys) {
        if (key.startsWith('$') || key === 'extensions' || key === 'description') {
          continue;
        }
        this.collectTokens(obj[key], [...path, key]);
      }
    }
  }

  /**
   * Check if an object is a W3C Design Token
   */
  private isW3CToken(obj: any): boolean {
    return obj && typeof obj === 'object' && '$value' in obj;
  }

  /**
   * Check if an object is a Tokens Studio token
   */
  private isTokenStudioToken(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if ('$value' in obj) return false; // W3C takes precedence
    if (!('value' in obj)) return false;
    
    const value = obj.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return true;
    }
    if (typeof value === 'object' && value !== null) {
      return 'type' in obj || 'description' in obj;
    }
    return false;
  }

  /**
   * Check if a value is a primitive that should be treated as a token
   */
  private isPrimitiveToken(value: any, path: string[]): boolean {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return false;
    }
    // Must have at least 1 level of nesting
    return path.length >= 1;
  }

  /**
   * Infer token type from value or path
   */
  private inferTokenType(value: any, path: string[]): TokenType {
    const pathStr = path.join('.').toLowerCase();
    
    // Infer from path
    if (pathStr.includes('color') || pathStr.includes('colour')) return 'color';
    if (pathStr.includes('font') || pathStr.includes('typography')) {
      if (pathStr.includes('weight')) return 'fontWeight';
      if (pathStr.includes('family')) return 'fontFamily';
      return 'typography';
    }
    if (pathStr.includes('spacing') || pathStr.includes('size') || pathStr.includes('gap')) {
      return 'dimension';
    }
    if (pathStr.includes('shadow')) return 'shadow';
    if (pathStr.includes('border')) return 'border';
    if (pathStr.includes('radius')) return 'borderRadius';

    // Infer from value
    if (typeof value === 'string') {
      if (value.match(/^#[0-9A-Fa-f]{3,8}$/) || 
          value.match(/^rgba?\(/) || 
          value.match(/^hsla?\(/)) {
        return 'color';
      }
      if (value.match(/^-?\d+(\.\d+)?(px|rem|em|pt|%)$/)) {
        return 'dimension';
      }
      if (value.match(/^\d+(\.\d+)?(ms|s)$/)) {
        return 'duration';
      }
    }
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';

    return 'string';
  }

  /**
   * Extract alias references from token value
   * Supports: {path.to.token} and $path.to.token
   */
  private extractAliases(value: string): string[] {
    const aliases: string[] = [];
    
    // Pattern for curly brace references: {path.to.token}
    const bracketPattern = /\{([^}]+)\}/g;
    let match;
    while ((match = bracketPattern.exec(value)) !== null) {
      let aliasPath = match[1].split(',')[0].trim();
      if (aliasPath.startsWith('$')) {
        aliasPath = aliasPath.substring(1);
      }
      aliases.push(aliasPath);
    }

    // Pattern for $ prefix references: $path.to.token
    if (value.startsWith('$') && !value.startsWith('{')) {
      const dollarPattern = /\$([a-zA-Z0-9._-]+)/g;
      while ((match = dollarPattern.exec(value)) !== null) {
        aliases.push(match[1]);
      }
    }

    return aliases;
  }
}
```

---

## Token Matching Service

The Token Matching Service compares parsed tokens against Figma component properties.

### Matching Strategy

**Priority Order:**
1. **Token Reference Matching** (confidence: 1.0) — Compare token paths stored in Figma's plugin data
2. **Value Matching** (confidence: 0.7) — Fall back to comparing resolved values

### Match Types by Property

| Property Type | Token Path Match Keys | Value Comparison Method |
|---------------|----------------------|------------------------|
| Colors | `fill`, `stroke`, `fillColor` | Hex comparison (normalized) |
| Typography | `fontFamily`, `fontSize`, `fontWeight`, `typography` | String/number comparison |
| Spacing | `padding*`, `gap`, `width`, `height` | Numeric comparison (±0.5 tolerance) |
| Border Radius | `borderRadius`, `cornerRadius`, `radius` | Numeric comparison |
| Effects | `boxShadow`, `shadow`, `effects` | Object property comparison |

### Token Matching Implementation

```typescript
// services/token-matching-service.ts
export interface MatchDetail {
  property: string;
  propertyType: 'color' | 'typography' | 'spacing' | 'effect';
  matchedValue: string;
  tokenValue: string;
  confidence: number; // 0-1, where 1 is exact match
}

export interface ComponentMatch {
  component: ComponentProperties;
  matches: MatchDetail[];
  confidence: number;
}

export class TokenMatchingService {
  /**
   * Match a token against scanned components
   */
  matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult {
    const matchingComponents: ComponentMatch[] = [];

    for (const component of scanResult.components) {
      const matchDetails = this.matchComponentRecursively(token, component);

      if (matchDetails.length > 0) {
        const avgConfidence = matchDetails.reduce((sum, m) => sum + m.confidence, 0) / matchDetails.length;
        matchingComponents.push({
          component,
          matches: matchDetails,
          confidence: avgConfidence
        });
      }
    }

    // Sort by confidence (highest first)
    matchingComponents.sort((a, b) => b.confidence - a.confidence);

    return {
      token,
      matchingComponents,
      totalMatches: matchingComponents.length,
      totalComponentsScanned: scanResult.totalComponents
    };
  }

  /**
   * Match color tokens — Prioritizes token reference, falls back to value
   */
  private matchColor(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = this.normalizeColor(token.value);

    // PRIORITY 1: Match by token reference
    for (const color of component.colors) {
      if (color.tokenReference) {
        let refPath = color.tokenReference.trim()
          .replace(/^["']|["']$/g, '')  // Remove quotes
          .replace(/^[{]|[}]$/g, '')    // Remove braces
          .replace(/^\$/, '');           // Remove leading $
        
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        // Exact path match
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${color.type} color (token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Partial path match
        else if (normalizedRef.includes(normalizedToken) || normalizedToken.includes(normalizedRef)) {
          matches.push({
            property: `${color.type} color (token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.85
          });
        }
      }
    }

    // If found reference matches, return (don't fall back)
    if (matches.length > 0) return matches;

    // PRIORITY 2: Fall back to value matching
    if (!tokenValue) return matches;

    for (const color of component.colors) {
      const componentHex = this.normalizeHex(color.hex);
      const tokenHex = this.normalizeHex(tokenValue);

      if (tokenHex && componentHex && tokenHex === componentHex) {
        matches.push({
          property: `${color.type} color (value)`,
          propertyType: 'color',
          matchedValue: color.hex,
          tokenValue: String(token.value),
          confidence: 0.7 // Lower confidence for value-only matches
        });
      }
    }

    return matches;
  }

  // Helper: Check if token looks like a spacing token by path
  private looksLikeSpacingToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const spacingKeywords = [
      'spacing', 'space', 'size', 'sizing', 'dimension',
      'width', 'height', 'padding', 'margin', 'gap',
      'radius', 'border', 'inset', 'offset',
      '1x', '2x', '3x', '4x', '5x', '6x', '8x', '10x', '12x', '16x'
    ];
    return spacingKeywords.some(keyword => pathStr.includes(keyword));
  }
}
```

---

## Reading Tokens Studio Data from Figma

This is the **critical part** — understanding how Tokens Studio stores token references.

### Key Discovery: Tokens Studio Data Format

**After testing, we discovered:**

```
Namespace: "tokens"
Keys: "fill", "stroke", "fontSize", "fontFamily", "borderRadius", etc.
Values: Direct token path as string (e.g., "ids.color.element.primary.default")
```

**Important:** Values are plain strings — no braces `{}` or `$` prefix.

### Figma Plugin Data API

Figma provides two storage mechanisms:

1. **Plugin Data** (`node.getPluginData(key)`) — Private to each plugin
2. **Shared Plugin Data** (`node.getSharedPluginData(namespace, key)`) — Accessible by any plugin

**Tokens Studio uses Shared Plugin Data** with namespace `"tokens"`.

### Complete Plugin Data Key Reference

#### Color Properties
| Figma Property | Keys to Check |
|----------------|---------------|
| Fill color | `fill`, `fills`, `fillColor`, `fills[0]`, `fill[0]` |
| Stroke color | `stroke`, `strokes`, `strokeColor`, `borderColor`, `strokes[0]` |

#### Typography Properties
| Figma Property | Keys to Check |
|----------------|---------------|
| Font family | `fontFamily`, `fontFamilies`, `typography.fontFamily` |
| Font size | `fontSize`, `fontSizes`, `typography.fontSize` |
| Font weight | `fontWeight`, `fontWeights`, `typography.fontWeight` |
| Line height | `lineHeight`, `lineHeights`, `typography.lineHeight` |
| Letter spacing | `letterSpacing`, `typography.letterSpacing` |
| Composite | `typography`, `text`, `textStyle` |

#### Spacing/Dimension Properties
| Figma Property | Keys to Check |
|----------------|---------------|
| Width | `width`, `sizing`, `dimension` |
| Height | `height`, `sizing`, `dimension` |
| Padding (all) | `padding`, `spacing` |
| Padding (individual) | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` |
| Padding (grouped) | `horizontalPadding`, `verticalPadding` |
| Gap/Item spacing | `itemSpacing`, `spacing`, `gap`, `counterAxisSpacing` |

#### Border Properties
| Figma Property | Keys to Check |
|----------------|---------------|
| Border radius | `borderRadius`, `cornerRadius`, `radius`, `borderRadiusTopLeft`, `borderRadiusTopRight`, `borderRadiusBottomRight`, `borderRadiusBottomLeft` |
| Border width | `borderWidth`, `strokeWeight`, `border`, `strokeWidth` |

#### Effect Properties
| Figma Property | Keys to Check |
|----------------|---------------|
| Box shadow | `boxShadow`, `shadow`, `effects`, `effect`, `dropShadow`, `innerShadow`, `elevation` |

### Namespaces to Check

While `"tokens"` is primary, check these alternatives for compatibility:

```typescript
const namespaces = [
  'tokens',           // Primary — Tokens Studio standard
  'tokens-studio',    // Alternative
  'tokensStudio',     // CamelCase variant
  'figma-tokens',     // Legacy
  'design-tokens',    // Generic
];
```

### Implementation: Figma Component Service

```typescript
// services/figma-component-service.ts
export class FigmaComponentService {
  private readonly TOKENS_STUDIO_NAMESPACE = 'tokens';
  private readonly DEBUG_LOGGING = true;

  /**
   * Get token reference from Tokens Studio plugin data
   */
  private getTokenReference(node: SceneNode, key: string): string | undefined {
    const namespaces = ['tokens', 'tokens-studio', 'tokensStudio', 'design-tokens'];
    
    for (const namespace of namespaces) {
      try {
        const sharedData = node.getSharedPluginData(namespace, key);
        if (sharedData && sharedData.trim()) {
          const cleanedValue = this.cleanTokenReference(sharedData);
          if (this.DEBUG_LOGGING) {
            console.log(`[TokenRef] Found ${namespace}:${key} = "${cleanedValue}" on ${node.name}`);
          }
          return cleanedValue;
        }
      } catch (e) {
        // Namespace might not exist
      }
    }
    return undefined;
  }

  /**
   * Clean token reference value — remove quotes that Tokens Studio may include
   */
  private cleanTokenReference(value: string): string {
    let cleaned = value.trim();
    // Remove multiple layers of quotes
    while (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    // Remove braces and $ prefix if present
    cleaned = cleaned.replace(/^[{]|[}]$/g, '');
    cleaned = cleaned.replace(/^\$/, '');
    return cleaned.trim();
  }

  /**
   * Get Figma Variable binding (for tokens synced to Variables)
   */
  private getVariableBinding(node: SceneNode, property: string): string | undefined {
    try {
      if (!('boundVariables' in node) || !node.boundVariables) {
        return undefined;
      }
      
      const boundVars = node.boundVariables as Record<string, any>;
      const binding = boundVars[property];
      
      if (binding) {
        const bindingToCheck = Array.isArray(binding) ? binding[0] : binding;
        
        if (bindingToCheck?.id) {
          const variable = figma.variables.getVariableById(bindingToCheck.id);
          if (variable?.name) {
            return variable.name;
          }
        }
      }
    } catch (e) {
      // Bound variables not available
    }
    return undefined;
  }

  /**
   * Extract fill token references
   */
  private getFillTokenReferences(node: SceneNode, fillIndex: number): string | undefined {
    const keys = [
      `fills[${fillIndex}]`,
      `fill[${fillIndex}]`,
      'fill',
      'fills',
      'fillColor',
      `fillColor[${fillIndex}]`
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) return ref;
    }
    
    return undefined;
  }

  /**
   * Extract border radius token reference
   */
  private getBorderRadiusTokenReference(node: SceneNode): string | undefined {
    const keys = [
      'borderRadius',
      'borderRadiusTopLeft',
      'borderRadiusTopRight', 
      'borderRadiusBottomRight',
      'borderRadiusBottomLeft',
      'radius',
      'cornerRadius',
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) return ref;
    }
    
    // Also check Figma Variable binding
    return this.getVariableBinding(node, 'cornerRadius');
  }

  /**
   * Log all token data on a node (for debugging)
   */
  private getAllTokenKeys(node: SceneNode): Record<string, string> {
    const allKeys: Record<string, string> = {};
    const namespaces = ['tokens', 'tokens-studio', 'tokensStudio', 'design-tokens', 'figma-tokens'];
    
    for (const namespace of namespaces) {
      try {
        const keys = node.getSharedPluginDataKeys(namespace);
        for (const key of keys) {
          const value = node.getSharedPluginData(namespace, key);
          if (value && value.trim()) {
            allKeys[`${namespace}:${key}`] = value;
          }
        }
      } catch (e) {
        // Namespace doesn't exist
      }
    }
    
    return allKeys;
  }
}
```

---

## Type Definitions

### Token Types

```typescript
// types/tokens.ts
export type TokenType = 
  | 'color' 
  | 'dimension' 
  | 'fontFamily' 
  | 'fontWeight' 
  | 'duration' 
  | 'cubicBezier' 
  | 'number' 
  | 'string' 
  | 'boolean' 
  | 'typography' 
  | 'shadow' 
  | 'border' 
  | 'borderRadius' 
  | 'borderWidth' 
  | 'composition';

export interface DesignToken {
  $type?: TokenType;
  $value: any;
  $description?: string;
  $extensions?: Record<string, any>;
}

export interface ParsedToken {
  name: string;
  value: any;
  type: TokenType;
  path: string[];
  description?: string;
  extensions?: Record<string, any>;
  aliases?: string[];
  rawValue?: any;
}

export interface TokenFile {
  [key: string]: DesignToken | TokenFile;
}

export interface ParsedTokens {
  tokens: ParsedToken[];
  metadata?: {
    filePath: string;
    format: string;
    errors: ValidationError[];
  };
}

export interface ValidationError {
  path: string[];
  message: string;
  severity: 'error' | 'warning';
}
```

### Component Types

```typescript
// types/components.ts
export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ColorProperty {
  type: 'fill' | 'stroke';
  color: RGBAColor;
  hex: string;
  rgba: string;
  opacity: number;
  tokenReference?: string; // Tokens Studio reference
}

export interface TypographyProperty {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  textDecoration?: string;
  textCase?: string;
  tokenReference?: string;
}

export interface SpacingProperty {
  type: 'width' | 'height' | 'padding' | 'gap' | 'borderRadius' | 'borderWidth';
  value: number;
  unit: string;
  tokenReference?: string;
}

export interface EffectProperty {
  type: 'drop-shadow' | 'inner-shadow' | 'layer-blur' | 'background-blur';
  visible: boolean;
  radius: number;
  color?: RGBAColor;
  offset?: { x: number; y: number };
  spread?: number;
  tokenReference?: string;
}

export interface ComponentProperties {
  id: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE';
  pageName: string;
  colors: ColorProperty[];
  typography: TypographyProperty[];
  spacing: SpacingProperty[];
  effects: EffectProperty[];
  width?: number;
  height?: number;
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  children?: ComponentProperties[];
}

export interface ScanResult {
  components: ComponentProperties[];
  totalComponents: number;
  totalInstances: number;
  pagesScanned: number;
  errors: ComponentScanError[];
}
```

---

## Full Implementation Examples

### Example 1: Scanning Components and Extracting Token References

```typescript
// main.ts — Figma plugin code
import { FigmaComponentService } from './services/figma-component-service';
import { TokenParser } from './services/token-parser';
import { TokenMatchingService } from './services/token-matching-service';

const componentService = new FigmaComponentService();
const tokenParser = new TokenParser();
const matchingService = new TokenMatchingService();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'scan-components') {
    // Scan all components in the document
    const scanResult = componentService.scanAllComponents();
    
    figma.ui.postMessage({
      type: 'scan-complete',
      data: scanResult
    });
  }
  
  if (msg.type === 'match-token') {
    const { tokenData, scanResult } = msg;
    
    // Parse the token
    const parsedTokens = tokenParser.parse(tokenData, 'tokens.json');
    const token = parsedTokens.tokens.find(t => t.path.join('.') === msg.tokenPath);
    
    if (token) {
      const matchResult = matchingService.matchTokenToComponents(token, scanResult);
      
      figma.ui.postMessage({
        type: 'match-complete',
        data: matchResult
      });
    }
  }
};
```

### Example 2: Diagnostic Tool to Inspect Token Data

```typescript
// Diagnostic tool to discover what Tokens Studio stores
function inspectSelectedNodes() {
  const selection = figma.currentPage.selection;
  const results: any[] = [];

  for (const node of selection) {
    const nodeData = {
      id: node.id,
      name: node.name,
      type: node.type,
      sharedPluginData: {} as Record<string, Record<string, string>>,
      boundVariables: {} as Record<string, string>
    };

    // Check all known namespaces
    const namespaces = [
      'tokens', 'tokens-studio', 'tokensStudio', 
      'figma-tokens', 'design-tokens', 'style-dictionary'
    ];

    for (const namespace of namespaces) {
      try {
        const keys = node.getSharedPluginDataKeys(namespace);
        if (keys.length > 0) {
          nodeData.sharedPluginData[namespace] = {};
          for (const key of keys) {
            nodeData.sharedPluginData[namespace][key] = node.getSharedPluginData(namespace, key);
          }
        }
      } catch (e) {
        // Namespace doesn't exist
      }
    }

    // Check bound variables
    if ('boundVariables' in node && node.boundVariables) {
      const boundVars = node.boundVariables as Record<string, any>;
      for (const [prop, binding] of Object.entries(boundVars)) {
        try {
          const b = Array.isArray(binding) ? binding[0] : binding;
          if (b?.id) {
            const variable = figma.variables.getVariableById(b.id);
            if (variable) {
              nodeData.boundVariables[prop] = variable.name;
            }
          }
        } catch (e) {
          // Variable not accessible
        }
      }
    }

    results.push(nodeData);
  }

  console.log('=== Token Data Inspection ===');
  console.log(JSON.stringify(results, null, 2));
  
  return results;
}
```

### Example 3: Complete Color Extraction with Token References

```typescript
extractColors(node: SceneNode): ColorProperty[] {
  const colors: ColorProperty[] = [];

  // Extract fills
  if ('fills' in node && Array.isArray(node.fills)) {
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i];
      if (fill.type === 'SOLID') {
        const opacity = fill.opacity ?? 1;
        const color = this.rgbaToColor(fill.color, opacity);
        
        // Get Tokens Studio token reference
        const tokenRef = this.getFillTokenReferences(node, i);
        
        colors.push({
          type: 'fill',
          color: {
            r: fill.color.r,
            g: fill.color.g,
            b: fill.color.b,
            a: opacity
          },
          hex: color.hex,
          rgba: color.rgba,
          opacity: opacity,
          tokenReference: tokenRef // e.g., "ids.color.element.primary.default"
        });
      }
    }
  }

  // Extract strokes
  if ('strokes' in node && Array.isArray(node.strokes)) {
    for (let i = 0; i < node.strokes.length; i++) {
      const stroke = node.strokes[i];
      if (stroke.type === 'SOLID') {
        const opacity = stroke.opacity ?? 1;
        const color = this.rgbaToColor(stroke.color, opacity);
        const tokenRef = this.getStrokeTokenReferences(node, i);
        
        colors.push({
          type: 'stroke',
          color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b, a: opacity },
          hex: color.hex,
          rgba: color.rgba,
          opacity: opacity,
          tokenReference: tokenRef
        });
      }
    }
  }

  return colors;
}
```

---

## Debugging & Troubleshooting

### Enable Debug Logging

```typescript
// In FigmaComponentService
private readonly DEBUG_LOGGING = true;

// This will log all token references found:
// [TokenRef] Found tokens:fill = "ids.color.primary.default" on Button
// [TokenData] Node: "Card" (FRAME)
//   tokens:borderRadius = "ids.radius.md"
```

### Common Issues

#### 1. No Token References Found

**Symptoms:** Components return empty `tokenReference` fields.

**Possible Causes:**
- Tokens were applied manually (not via Tokens Studio)
- Using wrong namespace (check `tokens`, `tokens-studio`, etc.)
- Tokens Studio version difference

**Debug Steps:**
```typescript
// Run the diagnostic inspector on the node
const allKeys = this.getAllTokenKeys(node);
console.log('All token keys:', allKeys);
```

#### 2. Spacing Tokens Not Matching

**Symptoms:** Color tokens match, but spacing doesn't.

**Possible Causes:**
- Tokens Studio uses different keys for spacing (e.g., `sizing` vs `dimension`)
- Token path in file doesn't match stored reference

**Debug Steps:**
```typescript
// Check what keys exist for spacing
const spacingKeys = ['width', 'height', 'padding', 'spacing', 'sizing', 'dimension', 'itemSpacing', 'gap'];
for (const key of spacingKeys) {
  const ref = this.getTokenReference(node, key);
  if (ref) console.log(`${key} → ${ref}`);
}
```

#### 3. Token Values Show `null` or `undefined`

**Symptoms:** Token reference exists but value is null.

**Possible Causes:**
- Token references an alias that wasn't resolved
- Token file structure different from expected

**Debug Steps:**
```typescript
// Check for unresolved aliases
if (token.aliases && token.aliases.length > 0) {
  console.log('Unresolved aliases:', token.aliases);
}
```

#### 4. Typography Composite Tokens

**Symptoms:** Typography tokens have multiple properties but only partial matches.

**Possible Causes:**
- Tokens Studio stores composite typography as one token
- Need to check individual properties AND composite

**Solution:**
```typescript
// Check composite first, then fallback to individual
const typographyToken = this.getTypographyTokenReference(node, 'typography');
const fontFamilyToken = this.getTypographyTokenReference(node, 'fontFamily');
const fontSizeToken = this.getTypographyTokenReference(node, 'fontSize');

const tokenRef = typographyToken || fontFamilyToken || fontSizeToken;
```

---

## Best Practices

### 1. Always Check Multiple Namespaces

```typescript
const namespaces = ['tokens', 'tokens-studio', 'tokensStudio', 'design-tokens'];
for (const namespace of namespaces) {
  const ref = node.getSharedPluginData(namespace, key);
  if (ref) return ref;
}
```

### 2. Clean Token References

Tokens Studio may store values with extra quotes or formatting:

```typescript
private cleanTokenReference(value: string): string {
  let cleaned = value.trim();
  while ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
         (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.replace(/^[{]|[}]$/g, '');
  cleaned = cleaned.replace(/^\$/, '');
  return cleaned.trim();
}
```

### 3. Normalize Paths for Comparison

```typescript
const normalizedRef = tokenRef.toLowerCase();
const normalizedToken = tokenPath.toLowerCase();

// Support exact match
if (normalizedRef === normalizedToken) { /* exact match */ }

// Support partial match (for nested tokens)
if (normalizedRef.includes(normalizedToken) || 
    normalizedToken.includes(normalizedRef)) { /* partial match */ }
```

### 4. Fall Back Gracefully

```typescript
// 1. Try token reference (highest confidence)
const refMatch = matchByReference(token, component);
if (refMatch.length > 0) return refMatch;

// 2. Fall back to value matching (lower confidence)
const valueMatch = matchByValue(token, component);
return valueMatch;
```

### 5. Support Both Plugin Data and Variables

Modern Tokens Studio can sync tokens to Figma Variables:

```typescript
// Check shared plugin data first
const pluginRef = this.getTokenReference(node, key);
if (pluginRef) return pluginRef;

// Fall back to Figma Variables
const variableRef = this.getVariableBinding(node, key);
if (variableRef) return variableRef;
```

### 6. Recursively Scan Children

Components may have nested elements with their own tokens:

```typescript
extractComponentProperties(node, pageName) {
  const properties = { /* ... */ };
  
  // Recursively check children
  if ('children' in node) {
    const childProperties = [];
    for (const child of node.children) {
      const childProps = this.extractComponentProperties(child, pageName);
      if (childProps) childProperties.push(childProps);
    }
    if (childProperties.length > 0) {
      properties.children = childProperties;
    }
  }
  
  return properties;
}
```

---

## Summary

### Key Takeaways

1. **Tokens Studio stores references in shared plugin data** with namespace `"tokens"`
2. **Values are plain token path strings** — no braces or $ prefix
3. **Check multiple key variations** — Tokens Studio uses different keys for different versions
4. **Prioritize reference matching** over value matching for accuracy
5. **Support Figma Variables** as an alternative storage mechanism
6. **Enable debug logging** during development to discover actual keys used

### Files You Need

```
services/
├── token-parser.ts           # Parse JSON token files
├── token-matching-service.ts # Match tokens to components
├── figma-component-service.ts # Extract component properties + token refs
└── github-token-service.ts   # (Optional) Fetch from GitHub

types/
├── tokens.ts                 # Token type definitions
└── components.ts             # Component property types
```

### Quick Start Checklist

- [ ] Set up TypeScript types for tokens and components
- [ ] Implement `TokenParser` to handle W3C/Tokens Studio/nested formats
- [ ] Implement `FigmaComponentService` with token reference extraction
- [ ] Implement `TokenMatchingService` with path-based matching
- [ ] Enable debug logging during development
- [ ] Test with real tokenized Figma components
- [ ] Document any additional keys your version of Tokens Studio uses

---

*Last Updated: January 2026*

