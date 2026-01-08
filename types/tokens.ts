/**
 * Type definitions for Design Tokens
 * Based on W3C Design Tokens Format Specification
 */

export type TokenType = 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'string' | 'boolean' | 'typography' | 'shadow' | 'border' | 'borderRadius' | 'borderWidth' | 'composition';

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
  rawValue?: any; // Original value before alias resolution
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

export interface TokenReference {
  path: string[];
  token: ParsedToken | null;
}

