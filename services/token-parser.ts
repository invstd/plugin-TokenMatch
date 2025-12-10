/**
 * Token Parser Service
 * Parses design token files following W3C Design Tokens Format
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

    try {
      // First pass: collect all tokens
      console.log(`[TokenParser] Starting to collect tokens from ${filePath || 'root'}`);
      console.log(`[TokenParser] Input structure:`, JSON.stringify(Object.keys(tokenFile || {})).substring(0, 200));
      this.collectTokens(tokenFile, []);
      console.log(`[TokenParser] Collected ${this.tokens.length} tokens`);
      
      if (this.tokens.length === 0) {
        console.warn(`[TokenParser] No tokens found! File structure might not match expected format.`);
        console.warn(`[TokenParser] Expected: Objects with $value or value property`);
        console.warn(`[TokenParser] Sample of file structure:`, JSON.stringify(tokenFile).substring(0, 500));
      }

      // Second pass: resolve aliases and references
      console.log(`[TokenParser] Resolving aliases...`);
      this.resolveAliases();
      console.log(`[TokenParser] Alias resolution complete`);

      // Third pass: validate tokens
      console.log(`[TokenParser] Validating tokens...`);
      this.validateTokens();
      
      // Categorize errors for better reporting
      const errorCategories: { [key: string]: number } = {};
      for (const error of this.errors) {
        const category = error.message.split(':')[0] || error.message;
        errorCategories[category] = (errorCategories[category] || 0) + 1;
      }
      
      console.log(`[TokenParser] Validation complete. ${this.errors.length} errors found:`);
      console.log(`[TokenParser] Error breakdown:`, errorCategories);
    } catch (error) {
      console.error(`[TokenParser] Error parsing ${filePath}:`, error);
      this.errors.push({
        path: [],
        message: `Parser error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    }

    return {
      tokens: this.tokens,
      metadata: {
        filePath,
        format: 'w3c-design-tokens',
        errors: this.errors
      }
    };
  }

  /**
   * Collect all tokens from the token file structure
   * @param maxDepth Maximum nesting depth to prevent stack overflow
   */
  private collectTokens(obj: TokenFile | DesignToken, path: string[], maxDepth: number = 50, currentDepth: number = 0): void {
    // Prevent infinite recursion from deeply nested structures
    if (currentDepth >= maxDepth) {
      this.errors.push({
        path: path,
        message: `Maximum nesting depth ${maxDepth} exceeded`,
        severity: 'error'
      });
      return;
    }

    // Prevent circular references
    if (path.length > 0) {
      const pathStr = path.join('.');
      if (path.length > 100) {
        this.errors.push({
          path: path,
          message: 'Token path too long, possible circular reference',
          severity: 'error'
        });
        return;
      }
    }

    if (this.isDesignToken(obj)) {
      // This is a token - support multiple formats
      const tokenName = path[path.length - 1] || 'unnamed';
      
      // Get value from either $value (W3C) or value (Style Dictionary)
      const tokenValue = ('$value' in obj) ? (obj as any).$value : (obj as any).value;
      const tokenType = this.inferTokenType(obj, path);
      
      const parsedToken: ParsedToken = {
        name: tokenName,
        value: tokenValue,
        type: tokenType,
        path: [...path],
        description: ('$description' in obj) ? (obj as any).$description : ((obj as any).description || undefined),
        extensions: ('$extensions' in obj) ? (obj as any).$extensions : undefined,
        rawValue: tokenValue
      };

      // Check for alias/reference (works with both formats)
      if (typeof tokenValue === 'string' && tokenValue.startsWith('{')) {
        parsedToken.aliases = this.extractAliases(tokenValue);
      }

      this.tokens.push(parsedToken);
      this.tokenMap.set(path.join('.'), parsedToken);
    } else if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      // This is a group, recurse
      const keys = Object.keys(obj);
      // Limit number of keys to prevent processing huge objects
      if (keys.length > 1000) {
        this.errors.push({
          path: path,
          message: `Object has too many keys (${keys.length}), skipping`,
          severity: 'warning'
        });
        return;
      }
      
      for (const key of keys) {
        try {
          this.collectTokens(obj[key] as TokenFile | DesignToken, [...path, key], maxDepth, currentDepth + 1);
        } catch (error) {
          this.errors.push({
            path: [...path, key],
            message: `Error processing key "${key}": ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error'
          });
        }
      }
    }
  }

  /**
   * Check if an object is a DesignToken
   * Supports multiple formats:
   * - W3C Design Tokens: { $value: ..., $type: ... }
   * - Style Dictionary: { value: ..., type: ... }
   * - Simple format: { value: ... }
   */
  private isDesignToken(obj: any): obj is DesignToken {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }
    
    // W3C Design Tokens format (with $value)
    if ('$value' in obj) {
      return true;
    }
    
    // Style Dictionary or other formats (with value, no $)
    if ('value' in obj) {
      return true;
    }
    
    return false;
  }

  /**
   * Infer token type from value or path
   */
  private inferTokenType(token: any, path: string[]): TokenType {
    // Use explicit type if provided (support both $type and type)
    if (token.$type) {
      return token.$type;
    }
    if (token.type && typeof token.type === 'string') {
      return token.type as TokenType;
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
    if (pathStr.includes('border')) {
      return 'border';
    }

    // Infer from value (support both formats)
    const value = ('$value' in token) ? (token as any).$value : (token as any).value;
    
    // If value is an object, it might be a composite type (typography, shadow, etc.)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Check for composite types
      if (value.fontFamily || value.fontSize) {
        return 'typography';
      }
      if (value.color || value.offset || value.radius) {
        return 'shadow';
      }
      if (value.width || value.style) {
        return 'border';
      }
    }
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
   * Format: {path.to.token} or {path.to.token, fallback}
   */
  private extractAliases(value: string): string[] {
    const aliases: string[] = [];
    const aliasPattern = /\{([^}]+)\}/g;
    let match;

    while ((match = aliasPattern.exec(value)) !== null) {
      const aliasPath = match[1].split(',').map(s => s.trim())[0]; // Take first part before comma
      aliases.push(aliasPath);
    }

    return aliases;
  }

  /**
   * Resolve token aliases and references
   * Prevents circular references
   */
  private resolveAliases(): void {
    const resolving = new Set<string>(); // Track tokens currently being resolved
    
    for (const token of this.tokens) {
      if (token.aliases && token.aliases.length > 0) {
        const tokenPath = token.path.join('.');
        
        // Skip if already resolving this token (circular reference)
        if (resolving.has(tokenPath)) {
          this.errors.push({
            path: token.path,
            message: `Circular alias reference detected: ${tokenPath}`,
            severity: 'error'
          });
          continue;
        }
        
        resolving.add(tokenPath);
        
        try {
          for (const aliasPath of token.aliases) {
            const referencedToken = this.tokenMap.get(aliasPath);
            if (referencedToken) {
              // Check for circular reference
              if (referencedToken.path.join('.') === tokenPath) {
                this.errors.push({
                  path: token.path,
                  message: `Token references itself: ${tokenPath}`,
                  severity: 'error'
                });
                continue;
              }
              
              // Resolve the alias
              token.value = referencedToken.value;
            } else {
              // Unresolved alias
              this.errors.push({
                path: token.path,
                message: `Unresolved alias: ${aliasPath}`,
                severity: 'error'
              });
            }
          }
        } finally {
          resolving.delete(tokenPath);
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
          message: validation.message,
          severity: validation.severity
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
      // More lenient dimension pattern - allow unitless numbers that might be used as multipliers
      const dimensionPattern = /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)?$/;
      if (!dimensionPattern.test(value)) {
        // Don't fail - might be a reference or alias
        return { valid: true, message: `Unusual dimension format: ${value}`, severity: 'warning' };
      }
    } else if (typeof value === 'number') {
      // Numbers are acceptable for dimensions
      return { valid: true };
    } else {
      // Don't fail validation - might be an object or reference
      return { valid: true, message: 'Dimension value is not a string or number', severity: 'warning' };
    }

    return { valid: true };
  }

  private validateFontWeight(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value === 'string') {
      const validWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold', 'lighter', 'bolder'];
      if (!validWeights.includes(value.toLowerCase())) {
        // Don't fail - might be a custom weight name
        return { valid: true, message: `Unusual font weight: ${value}`, severity: 'warning' };
      }
    } else if (typeof value === 'number') {
      if (value < 1 || value > 1000) {
        return { valid: false, message: 'Font weight must be between 1 and 1000', severity: 'error' };
      }
    } else {
      // Don't fail - might be a reference
      return { valid: true, message: 'Font weight is not a string or number', severity: 'warning' };
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
    if (typeof value !== 'object' || Array.isArray(value) || value === null) {
      // Don't fail - might be a reference that will be resolved
      return { valid: true, message: 'Typography value is not an object', severity: 'warning' };
    }

    // Typography should have fontFamily and fontSize at minimum, but don't fail if missing
    if (!value.fontFamily && !value.fontSize) {
      return { valid: true, message: 'Typography token missing fontFamily or fontSize', severity: 'warning' };
    }

    return { valid: true };
  }

  private validateShadow(value: any): { valid: boolean; message?: string; severity?: 'error' | 'warning' } {
    if (typeof value !== 'object' || Array.isArray(value) || value === null) {
      // Don't fail - might be a reference
      return { valid: true, message: 'Shadow value is not an object', severity: 'warning' };
    }

    // Shadow should have color and offset, but don't fail if missing
    if (!value.color && !value.offset && !value.radius) {
      return { valid: true, message: 'Shadow token missing color, offset, or radius', severity: 'warning' };
    }

    return { valid: true };
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

