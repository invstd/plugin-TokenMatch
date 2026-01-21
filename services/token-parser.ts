/**
 * Token Parser Service
 * Parses design token files following multiple formats:
 * - W3C Design Tokens Format ($value, $type)
 * - Token Studio format (value, type)
 * - Plain nested JSON (primitive values at leaf nodes)
 */

import {
  DesignToken,
  ParsedToken,
  TokenFile,
  ParsedTokens,
  TokenType,
  ValidationError
} from '../types/tokens';

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
   * Supports: W3C ($value), Token Studio (value), and plain nested primitives
   */
  private collectTokens(obj: any, path: string[]): void {
    // Skip null/undefined
    if (obj === null || obj === undefined) {
      return;
    }

    // Skip metadata keys that start with $ but aren't token values
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

    // Check if this is a primitive value at a leaf node (plain nested format)
    if (this.isPrimitiveToken(obj, path)) {
      this.addToken(obj, undefined, undefined, undefined, path);
      return;
    }

    // If it's an object or array, recurse into children
    if (typeof obj === 'object') {
      const keys = Array.isArray(obj) ? obj.map((_, i) => String(i)) : Object.keys(obj);
      
      for (const key of keys) {
        // Skip internal/metadata keys
        if (key.startsWith('$') || key === 'extensions' || key === 'description') {
          continue;
        }
        
        const child = Array.isArray(obj) ? obj[parseInt(key)] : obj[key];
        this.collectTokens(child, [...path, key]);
      }
    }
  }

  /**
   * Add a token to the collection
   */
  private addToken(
    value: any,
    explicitType: string | undefined,
    description: string | undefined,
    extensions: Record<string, any> | undefined,
    path: string[]
  ): void {
    const tokenName = path[path.length - 1] || 'unnamed';
    const tokenType = this.inferTokenType({ $value: value, $type: explicitType as TokenType }, path);

    // Handle alias references in the value
    let aliases: string[] | undefined;
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('$'))) {
      aliases = this.extractAliases(value);
    }

    const parsedToken: ParsedToken = {
      name: tokenName,
      value: value,
      type: tokenType,
      path: [...path],
      description: description,
      extensions: extensions,
      rawValue: value,
      aliases: aliases
    };

    this.tokens.push(parsedToken);
    this.tokenMap.set(path.join('.'), parsedToken);
  }

  /**
   * Check if an object is a W3C Design Token (has $value)
   */
  private isW3CToken(obj: any): boolean {
    return obj && typeof obj === 'object' && '$value' in obj;
  }

  /**
   * Check if an object is a Token Studio token (has value but not $value)
   */
  private isTokenStudioToken(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if ('$value' in obj) return false; // W3C takes precedence
    if (!('value' in obj)) return false;
    
    // Additional checks to distinguish from regular objects
    // Token Studio tokens typically have 'value' and optionally 'type', 'description'
    const value = obj.value;
    
    // If value is a primitive or simple color/dimension, it's likely a token
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return true;
    }
    
    // If value is an object (like typography, shadow, or border composite tokens)
    if (typeof value === 'object' && value !== null) {
      // Check if parent has explicit token properties (type, description)
      if ('type' in obj || 'description' in obj) {
        return true;
      }
      
      // Check if value object looks like a known composite token type:
      // - Border: has color, width, style
      // - Typography: has fontFamily, fontSize, fontWeight, lineHeight
      // - Shadow: has color, x/offsetX, y/offsetY, blur, spread
      // - Gradient: has type, stops
      const valueKeys = Object.keys(value);
      
      // Border composite token
      if (valueKeys.some(k => ['color', 'width', 'style'].includes(k.toLowerCase()))) {
        // At least 2 of the border properties
        const borderProps = valueKeys.filter(k => 
          ['color', 'width', 'style', 'bordercolor', 'borderwidth', 'borderstyle'].includes(k.toLowerCase())
        );
        if (borderProps.length >= 2) return true;
      }
      
      // Typography composite token
      if (valueKeys.some(k => ['fontfamily', 'fontsize', 'fontweight', 'lineheight', 'letterspacing'].includes(k.toLowerCase()))) {
        return true;
      }
      
      // Shadow composite token
      if (valueKeys.some(k => ['blur', 'spread', 'offsetx', 'offsety', 'x', 'y'].includes(k.toLowerCase())) &&
          valueKeys.some(k => k.toLowerCase() === 'color')) {
        return true;
      }
      
      // If the value object has fewer than 6 keys and contains alias references,
      // it's likely a composite token with resolved references
      if (valueKeys.length <= 6 && valueKeys.length >= 2) {
        const hasAliasValues = valueKeys.some(k => {
          const v = value[k];
          return typeof v === 'string' && (v.startsWith('{') || v.startsWith('$'));
        });
        if (hasAliasValues) return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a value is a primitive that should be treated as a token
   * (for plain nested JSON format)
   * 
   * PERMISSIVE: Any primitive at depth 1+ is considered a potential token
   */
  private isPrimitiveToken(value: any, path: string[]): boolean {
    // Must be a primitive
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return false;
    }

    // Must have at least 1 level of nesting (not root-level primitives)
    if (path.length < 1) {
      return false;
    }

    // Accept ALL primitives at depth 1+ as potential tokens
    return true;
  }

  /**
   * Legacy check for DesignToken type
   */
  private isDesignToken(obj: any): obj is DesignToken {
    return this.isW3CToken(obj);
  }

  /**
   * Infer token type from value or path
   */
  private inferTokenType(token: DesignToken, path: string[]): TokenType {
    // Use explicit type if provided
    if (token.$type) {
      return token.$type;
    }

    // Infer from path
    const pathStr = path.join('.').toLowerCase();
    if (pathStr.includes('color') || pathStr.includes('colour')) {
      return 'color';
    }
    if (pathStr.includes('font') || pathStr.includes('typography') || pathStr.includes('text')) {
      if (pathStr.includes('weight')) return 'fontWeight';
      if (pathStr.includes('family')) return 'fontFamily';
      return 'typography';
    }
    if (pathStr.includes('spacing') || pathStr.includes('size') || pathStr.includes('gap')) {
      return 'dimension';
    }
    if (pathStr.includes('shadow')) {
      return 'shadow';
    }
    // Check for specific border types BEFORE generic 'border'
    // This ensures border.radius.md gets 'borderRadius' not 'border'
    if (pathStr.includes('radius') || pathStr.includes('corner') || pathStr.includes('rounded')) {
      return 'borderRadius';
    }
    if (pathStr.includes('borderwidth') || pathStr.includes('strokeweight') || 
        pathStr.includes('stroke-weight') || pathStr.includes('border-width') ||
        (pathStr.includes('border') && pathStr.includes('width'))) {
      return 'borderWidth';
    }
    // Generic 'border' type for composite tokens (with color, width, style)
    if (pathStr.includes('border')) {
      return 'border';
    }

    // Infer from value
    const value = token.$value;
    if (typeof value === 'string') {
      // Color formats
      if (value.match(/^#[0-9A-Fa-f]{3,8}$/) || 
          value.match(/^rgba?\(/) ||
          value.match(/^hsla?\(/)) {
        return 'color';
      }
      // Dimension formats
      if (value.match(/^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/)) {
        return 'dimension';
      }
      // Duration
      if (value.match(/^\d+(\.\d+)?(ms|s)$/)) {
        return 'duration';
      }
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }

    return 'string';
  }

  /**
   * Extract alias references from token value
   * Supports multiple formats:
   * - W3C: {path.to.token} or {path.to.token, fallback}
   * - Token Studio: {path.to.token} or $path.to.token
   */
  private extractAliases(value: string): string[] {
    const aliases: string[] = [];
    
    // Pattern for curly brace references: {path.to.token}
    const bracketPattern = /\{([^}]+)\}/g;
    let match;

    while ((match = bracketPattern.exec(value)) !== null) {
      let aliasPath = match[1].split(',').map(s => s.trim())[0]; // Take first part before comma
      // Remove leading $ if present inside braces
      if (aliasPath.startsWith('$')) {
        aliasPath = aliasPath.substring(1);
      }
      aliases.push(aliasPath);
    }

    // Pattern for $ prefix references (Token Studio): $path.to.token
    if (value.startsWith('$') && !value.startsWith('{')) {
      const dollarPattern = /\$([a-zA-Z0-9._-]+)/g;
      while ((match = dollarPattern.exec(value)) !== null) {
        aliases.push(match[1]);
      }
    }

    return aliases;
  }

  /**
   * Resolve token aliases and references
   */
  private resolveAliases(): void {
    for (const token of this.tokens) {
      if (token.aliases && token.aliases.length > 0) {
        for (const aliasPath of token.aliases) {
          const referencedToken = this.tokenMap.get(aliasPath);
          if (referencedToken) {
            // Resolve the alias
            token.value = referencedToken.value;
            // Keep track of the reference
            if (!token.aliases) token.aliases = [];
          } else {
            // Unresolved alias
            this.errors.push({
              path: token.path,
              message: `Unresolved alias: ${aliasPath}`,
              severity: 'error'
            });
          }
        }
      }
    }
  }

  /**
   * Validate token values based on their type
   */
  private validateTokens(): void {
    for (const token of this.tokens) {
      const validation = this.validateTokenValue(token);
      if (!validation.valid) {
        this.errors.push({
          path: token.path,
          message: validation.message || 'Validation error',
          severity: validation.severity || 'error'
        });
      }
    }
  }

  /**
   * Validate a single token value
   */
  private validateTokenValue(token: ParsedToken): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    const { type, value } = token;

    // Check for null/undefined values
    if (value === null || value === undefined) {
      return { valid: false, message: 'Token value cannot be null or undefined', severity: 'error' };
    }

    switch (type) {
      case 'color':
        return this.validateColor(value);
      case 'dimension':
        return this.validateDimension(value);
      case 'fontWeight':
        return this.validateFontWeight(value);
      case 'duration':
        return this.validateDuration(value);
      case 'typography':
        return this.validateTypography(value);
      case 'shadow':
        return this.validateShadow(value);
      case 'border':
        return this.validateBorder(value);
      case 'borderRadius':
      case 'borderWidth':
        // These are essentially dimensions
        return this.validateDimension(value);
      default:
        return { valid: true };
    }
  }

  private validateColor(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value !== 'string') {
      return { valid: false, message: 'Color value must be a string', severity: 'error' };
    }

    const colorPatterns = [
      /^#[0-9A-Fa-f]{3,8}$/, // Hex
      /^rgba?\([^)]+\)$/, // RGB/RGBA
      /^hsla?\([^)]+\)$/, // HSL/HSLA
    ];

    const isValid = colorPatterns.some(pattern => pattern.test(value));
    if (!isValid) {
      return { valid: false, message: `Invalid color format: ${value}`, severity: 'error' };
    }

    return { valid: true };
  }

  private validateDimension(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value === 'string') {
      // Accept dimension with units
      const dimensionWithUnitsPattern = /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/;
      // Also accept plain numbers as strings (common in token files)
      const plainNumberPattern = /^-?\d+(\.\d+)?$/;
      // Also accept alias references
      const aliasPattern = /^[{$]/;
      
      if (!dimensionWithUnitsPattern.test(value) && !plainNumberPattern.test(value) && !aliasPattern.test(value)) {
        // Only warn, don't error - some tokens use unconventional formats
        return { valid: true, message: `Unusual dimension format: ${value}`, severity: 'warning' };
      }
    } else if (typeof value === 'number') {
      // Numbers are acceptable for dimensions
      return { valid: true };
    } else {
      return { valid: false, message: 'Dimension value must be a string or number', severity: 'error' };
    }

    return { valid: true };
  }

  private validateFontWeight(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value === 'string') {
      const validWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'];
      if (!validWeights.includes(value)) {
        return { valid: false, message: `Invalid font weight: ${value}`, severity: 'warning' };
      }
    } else if (typeof value === 'number') {
      if (value < 1 || value > 1000) {
        return { valid: false, message: 'Font weight must be between 1 and 1000', severity: 'error' };
      }
    } else {
      return { valid: false, message: 'Font weight must be a string or number', severity: 'error' };
    }

    return { valid: true };
  }

  private validateDuration(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value !== 'string') {
      return { valid: false, message: 'Duration value must be a string', severity: 'error' };
    }

    const durationPattern = /^\d+(\.\d+)?(ms|s)$/;
    if (!durationPattern.test(value)) {
      return { valid: false, message: `Invalid duration format: ${value}`, severity: 'error' };
    }

    return { valid: true };
  }

  private validateTypography(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, message: 'Typography value must be an object', severity: 'error' };
    }

    // Typography should have fontFamily and fontSize at minimum
    if (!value.fontFamily) {
      return { valid: false, message: 'Typography token missing fontFamily', severity: 'warning' };
    }

    return { valid: true };
  }

  private validateShadow(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, message: 'Shadow value must be an object', severity: 'error' };
    }

    // Shadow should have color and offset
    if (!value.color) {
      return { valid: false, message: 'Shadow token missing color', severity: 'warning' };
    }

    return { valid: true };
  }

  private validateBorder(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    // Border can be a composite object with color, width, style
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Composite border token - should have at least width or color
      const hasWidth = 'width' in value || 'borderWidth' in value;
      const hasColor = 'color' in value || 'borderColor' in value;
      const hasStyle = 'style' in value || 'borderStyle' in value;
      
      if (!hasWidth && !hasColor && !hasStyle) {
        return { valid: false, message: 'Border token should have width, color, or style', severity: 'warning' };
      }
      return { valid: true };
    }
    
    // Border can also be a string (CSS shorthand like "1px solid #000")
    if (typeof value === 'string') {
      // Accept alias references
      if (value.startsWith('{') || value.startsWith('$')) {
        return { valid: true };
      }
      // Accept CSS border shorthand format
      return { valid: true };
    }
    
    // Numbers are acceptable (for simple border width)
    if (typeof value === 'number') {
      return { valid: true };
    }
    
    return { valid: false, message: 'Border value must be an object, string, or number', severity: 'error' };
  }

  /**
   * Get all tokens of a specific type
   */
  getTokensByType(type: TokenType): ParsedToken[] {
    return this.tokens.filter(token => token.type === type);
  }

  /**
   * Get token by path
   */
  getTokenByPath(path: string[]): ParsedToken | undefined {
    return this.tokenMap.get(path.join('.'));
  }

  /**
   * Get all validation errors
   */
  getErrors(): ValidationError[] {
    return this.errors;
  }
}

