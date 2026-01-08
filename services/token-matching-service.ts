/**
 * Token Matching Service
 * Matches design tokens against Figma component properties
 */

import {
  ComponentProperties,
  ColorProperty,
  TypographyProperty,
  SpacingProperty,
  EffectProperty,
  ScanResult
} from '../types/components';
import { ParsedToken, TokenType } from '../types/tokens';

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
  confidence: number; // Average confidence of all matches
}

export interface MatchingResult {
  token: ParsedToken;
  matchingComponents: ComponentMatch[];
  totalMatches: number;
  totalComponentsScanned: number;
}

export class TokenMatchingService {
  /**
   * Match a token against scanned components
   */
  matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult {
    const matchingComponents: ComponentMatch[] = [];

    for (const component of scanResult.components) {
      // Match the component and all its children recursively
      const matchDetails = this.matchComponentRecursively(token, component);

      if (matchDetails.length > 0) {
        const avgConfidence =
          matchDetails.reduce((sum, m) => sum + m.confidence, 0) / matchDetails.length;
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
   * Match a token against a component and all its children recursively
   */
  private matchComponentRecursively(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matchDetails: MatchDetail[] = [];

    // Match based on token type for this component
    switch (token.type) {
      case 'color':
        matchDetails.push(...this.matchColor(token, component));
        break;
      case 'fontFamily':
      case 'fontWeight':
      case 'typography':
        matchDetails.push(...this.matchTypography(token, component));
        break;
      case 'dimension':
        matchDetails.push(...this.matchSpacing(token, component));
        break;
      case 'shadow':
        matchDetails.push(...this.matchEffects(token, component));
        break;
      case 'borderRadius':
        matchDetails.push(...this.matchSpacing(token, component, 'borderRadius'));
        break;
      case 'borderWidth':
        matchDetails.push(...this.matchSpacing(token, component, 'borderWidth'));
        break;
      default:
        // Try to match by inferring type from value AND path
        matchDetails.push(...this.matchByValue(token, component));
        // Also try spacing matching for tokens with spacing-related paths
        if (this.looksLikeSpacingToken(token)) {
          matchDetails.push(...this.matchSpacing(token, component));
        }
        // Try border-radius matching specifically
        if (this.looksLikeBorderRadiusToken(token)) {
          matchDetails.push(...this.matchSpacing(token, component, 'borderRadius'));
        }
        // Try border/stroke width matching
        if (this.looksLikeBorderToken(token)) {
          matchDetails.push(...this.matchSpacing(token, component, 'borderWidth'));
        }
        // Try effect matching for shadow-like paths
        if (this.looksLikeEffectToken(token)) {
          matchDetails.push(...this.matchEffects(token, component));
        }
    }

    // Recursively check children
    if (component.children && component.children.length > 0) {
      for (const child of component.children) {
        const childMatches = this.matchComponentRecursively(token, child);
        // Add child matches with context about where they were found
        for (const match of childMatches) {
          matchDetails.push({
            ...match,
            property: `${child.name} → ${match.property}`
          });
        }
      }
    }

    return matchDetails;
  }

  /**
   * Match color tokens
   * PRIORITY ORDER:
   * 1. Match by token reference path (Tokens Studio) - highest confidence
   * 2. Fall back to value matching only if no path match and value exists
   */
  private matchColor(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = this.normalizeColor(token.value);

    // First pass: Match by token reference (Tokens Studio path matching)
    // This is the PRIMARY matching method and works even if token value is null
    for (const color of component.colors) {
      if (color.tokenReference) {
        // Clean up the token reference (remove braces, $, quotes, etc.)
        let refPath = color.tokenReference.trim();
        refPath = refPath.replace(/^["']|["']$/g, ''); // Remove quotes
        refPath = refPath.replace(/^[{]|[}]$/g, ''); // Remove braces
        refPath = refPath.replace(/^\$/, ''); // Remove leading $
        
        // Normalize paths for comparison
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        // Exact path match - highest confidence
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${color.type} color (token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Partial path match - still high confidence
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

    // If we found reference matches, return them (don't fall back to value matching)
    if (matches.length > 0) {
      return matches;
    }

    // Second pass: Fall back to value matching only if no reference matches
    // This requires a valid token value
    if (!tokenValue) {
      return matches;
    }

    for (const color of component.colors) {
      const componentHex = this.normalizeHex(color.hex);
      const componentRgba = this.normalizeRgba(color.rgba);
      const tokenHex = this.normalizeHex(tokenValue);
      const tokenRgba = this.normalizeRgba(tokenValue);

      // Exact hex match
      if (tokenHex && componentHex && tokenHex === componentHex) {
        matches.push({
          property: `${color.type} color (value)`,
          propertyType: 'color',
          matchedValue: color.hex,
          tokenValue: String(token.value),
          confidence: 0.7 // Lower confidence for value-only matches
        });
      }
      // Exact rgba match (with tolerance for opacity)
      else if (tokenRgba && componentRgba) {
        const tokenRgbaValues = this.parseRgba(tokenValue);
        const componentRgbaValues = this.parseRgba(color.rgba);

        if (tokenRgbaValues && componentRgbaValues) {
          const rDiff = Math.abs(tokenRgbaValues.r - componentRgbaValues.r);
          const gDiff = Math.abs(tokenRgbaValues.g - componentRgbaValues.g);
          const bDiff = Math.abs(tokenRgbaValues.b - componentRgbaValues.b);
          const aDiff = Math.abs(tokenRgbaValues.a - componentRgbaValues.a);

          // Allow small differences (rounding errors)
          if (rDiff < 2 && gDiff < 2 && bDiff < 2 && aDiff < 0.01) {
            matches.push({
              property: `${color.type} color (value)`,
              propertyType: 'color',
              matchedValue: color.rgba,
              tokenValue: String(token.value),
              confidence: 0.7
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * Match typography tokens
   */
  private matchTypography(
    token: ParsedToken,
    component: ComponentProperties
  ): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');

    for (const typo of component.typography) {
      let confidence = 0;
      let matchedValue = '';
      let matchType = 'value';

      // PRIORITY 1: Match by token reference (Tokens Studio)
      if (typo.tokenReference) {
        const refPath = typo.tokenReference.replace(/[{}]/g, '').replace(/^\$/, '');
        const normalizedRef = refPath.toLowerCase().replace(/\./g, '.');
        const normalizedToken = tokenPath.toLowerCase();
        
        if (normalizedRef === normalizedToken) {
          confidence = 1.0;
          matchedValue = `${typo.fontFamily} (ref: ${typo.tokenReference})`;
          matchType = 'reference';
        } else if (normalizedRef.includes(normalizedToken) || normalizedToken.includes(normalizedRef)) {
          confidence = 0.8;
          matchedValue = `${typo.fontFamily} (ref: ${typo.tokenReference})`;
          matchType = 'reference';
        }
      }

      // PRIORITY 2: Fall back to value matching
      if (confidence === 0) {
        if (token.type === 'fontFamily') {
          const tokenValue = String(token.value).toLowerCase().trim();
          const componentFamily = typo.fontFamily.toLowerCase().trim();

          if (tokenValue === componentFamily) {
            confidence = 0.9;
            matchedValue = typo.fontFamily;
          }
        } else if (token.type === 'fontWeight') {
          const tokenValue = this.normalizeFontWeight(token.value);
          const componentWeight = typo.fontWeight;

          if (tokenValue === componentWeight) {
            confidence = 0.9;
            matchedValue = String(componentWeight);
          }
        } else if (token.type === 'typography') {
          // For typography composite tokens
          if (typeof token.value === 'object' && token.value !== null) {
            const tokenObj = token.value as any;
            let hasMatch = false;
            let typoConfidence = 0;
            const matchedProps: string[] = [];

            // Check fontFamily
            if (tokenObj.fontFamily) {
              const tokenFamily = String(tokenObj.fontFamily).toLowerCase().trim();
              const componentFamily = typo.fontFamily.toLowerCase().trim();
              if (tokenFamily === componentFamily) {
                hasMatch = true;
                typoConfidence += 0.4;
                matchedProps.push(`fontFamily: ${typo.fontFamily}`);
              }
            }

            // Check fontSize
            if (tokenObj.fontSize) {
              const tokenSize = Number(tokenObj.fontSize);
              const componentSize = typo.fontSize;
              if (Math.abs(tokenSize - componentSize) < 0.5) {
                hasMatch = true;
                typoConfidence += 0.3;
                matchedProps.push(`fontSize: ${componentSize}`);
              }
            }

            // Check fontWeight
            if (tokenObj.fontWeight) {
              const tokenWeight = this.normalizeFontWeight(tokenObj.fontWeight);
              if (tokenWeight === typo.fontWeight) {
                hasMatch = true;
                typoConfidence += 0.3;
                matchedProps.push(`fontWeight: ${typo.fontWeight}`);
              }
            }

            if (hasMatch) {
              confidence = Math.min(typoConfidence, 1.0);
              matchedValue = matchedProps.join(', ');
            }
          }
        }
      }

      if (confidence > 0) {
        matches.push({
          property: `typography${matchType === 'reference' ? ' (token ref)' : ''}`,
          propertyType: 'typography',
          matchedValue,
          tokenValue: String(token.value),
          confidence
        });
      }
    }

    return matches;
  }

  /**
   * Match spacing/dimension tokens
   * @param filterType - Optional filter to only match specific spacing types (e.g., 'borderRadius', 'borderWidth')
   */
  private matchSpacing(token: ParsedToken, component: ComponentProperties, filterType?: string): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = this.normalizeDimension(token.value);

    // Filter spacing properties if a type filter is specified
    const spacingToCheck = filterType 
      ? component.spacing.filter(s => s.type === filterType)
      : component.spacing;

    // First pass: Match by token reference (Tokens Studio path matching)
    for (const spacing of spacingToCheck) {
      if (spacing.tokenReference) {
        // Clean up the token reference
        let refPath = spacing.tokenReference.trim();
        refPath = refPath.replace(/^["']|["']$/g, '');
        refPath = refPath.replace(/^[{]|[}]$/g, '');
        refPath = refPath.replace(/^\$/, '');
        // Remove context prefix like "[horizontal] " for path comparison
        refPath = refPath.replace(/^\[\w+\]\s*/, '');
        
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        // Format the property type for display - include the token reference for context
        const displayType = this.formatSpacingType(spacing.type);
        
        // Exact path match
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${displayType} (token ref)`,
            propertyType: 'spacing',
            // Include token reference in matchedValue for UI to parse direction from
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Partial path match
        else if (normalizedRef.includes(normalizedToken) || normalizedToken.includes(normalizedRef)) {
          matches.push({
            property: `${displayType} (token ref)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.85
          });
        }
      }
    }

    // If we found reference matches, return them
    if (matches.length > 0) {
      return matches;
    }

    // Second pass: Fall back to value matching
    if (tokenValue === null) return matches;

    for (const spacing of spacingToCheck) {
      const componentValue = spacing.value;
      const tolerance = 0.5; // Allow small differences for floating point

      if (Math.abs(tokenValue - componentValue) < tolerance) {
        const displayType = this.formatSpacingType(spacing.type);
        matches.push({
          property: displayType,
          propertyType: 'spacing',
          matchedValue: `${spacing.value}${spacing.unit}`,
          tokenValue: String(token.value),
          confidence: 0.7
        });
      }
    }

    return matches;
  }

  /**
   * Format spacing type for display
   */
  private formatSpacingType(type: string): string {
    switch (type) {
      case 'borderRadius':
        return 'border-radius';
      case 'borderWidth':
        return 'border-width';
      case 'gap':
        return 'gap/spacing';
      default:
        return type;
    }
  }

  /**
   * Match effect/shadow tokens
   */
  private matchEffects(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');

    // First pass: Match by token reference (Tokens Studio path matching)
    for (const effect of component.effects) {
      if (effect.tokenReference) {
        // Clean up the token reference
        let refPath = effect.tokenReference.trim();
        refPath = refPath.replace(/^["']|["']$/g, '');
        refPath = refPath.replace(/^[{]|[}]$/g, '');
        refPath = refPath.replace(/^\$/, '');
        
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        // Exact path match
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${effect.type} (token ref)`,
            propertyType: 'effect',
            matchedValue: `${effect.type} ← ${effect.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Partial path match
        else if (normalizedRef.includes(normalizedToken) || normalizedToken.includes(normalizedRef)) {
          matches.push({
            property: `${effect.type} (token ref)`,
            propertyType: 'effect',
            matchedValue: `${effect.type} ← ${effect.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.85
          });
        }
      }
    }

    // If we found reference matches, return them
    if (matches.length > 0) {
      return matches;
    }

    // Second pass: Fall back to value matching for shadow tokens
    if (typeof token.value !== 'object' || token.value === null) {
      return matches;
    }

    const tokenObj = token.value as any;

    for (const effect of component.effects) {
      if (effect.type === 'drop-shadow' || effect.type === 'inner-shadow') {
        let confidence = 0;
        const matchedProps: string[] = [];

        // Check radius/blur
        const tokenRadius = tokenObj.blur || tokenObj.radius || tokenObj.spreadRadius;
        if (tokenRadius !== undefined && effect.radius !== undefined) {
          const radiusDiff = Math.abs(Number(tokenRadius) - effect.radius);
          if (radiusDiff < 1) {
            confidence += 0.4;
            matchedProps.push(`radius: ${effect.radius}px`);
          }
        }

        // Check color
        if (tokenObj.color && effect.color) {
          const tokenColor = this.normalizeColor(tokenObj.color);
          const effectRgba = this.rgbaToString(effect.color);
          if (tokenColor && this.colorsMatch(tokenColor, effectRgba)) {
            confidence += 0.4;
            matchedProps.push(`color: ${effectRgba}`);
          }
        }

        // Check offset
        if (tokenObj.offset && effect.offset) {
          const tokenX = Number(tokenObj.offset.x || 0);
          const tokenY = Number(tokenObj.offset.y || 0);
          const effectX = effect.offset.x || 0;
          const effectY = effect.offset.y || 0;

          if (Math.abs(tokenX - effectX) < 1 && Math.abs(tokenY - effectY) < 1) {
            confidence += 0.2;
            matchedProps.push(`offset: ${effectX}, ${effectY}`);
          }
        }

        if (confidence > 0) {
          matches.push({
            property: effect.type,
            propertyType: 'effect',
            matchedValue: matchedProps.join(', '),
            tokenValue: JSON.stringify(token.value),
            confidence: Math.min(confidence, 0.7) // Lower confidence for value-only matches
          });
        }
      }
    }

    return matches;
  }

  /**
   * Try to match by inferring type from value
   */
  private matchByValue(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];

    // Try color matching
    if (this.looksLikeColor(token.value)) {
      matches.push(...this.matchColor(token, component));
    }

    // Try dimension matching
    if (this.looksLikeDimension(token.value)) {
      matches.push(...this.matchSpacing(token, component));
    }

    return matches;
  }

  // Helper methods

  /**
   * Normalize color value to a standard format
   */
  private normalizeColor(value: any): string | null {
    if (typeof value !== 'string') return null;
    const str = value.trim().toLowerCase();

    // Already in a recognizable format
    if (str.match(/^#[0-9a-f]{3,8}$/) || str.match(/^rgba?\(/) || str.match(/^hsla?\(/)) {
      return str;
    }

    return null;
  }

  /**
   * Normalize hex color (remove #, lowercase, expand shorthand)
   */
  private normalizeHex(hex: string): string | null {
    if (!hex) return null;
    let normalized = hex.trim().toLowerCase().replace('#', '');

    // Expand shorthand (e.g., #fff -> #ffffff)
    if (normalized.length === 3) {
      normalized = normalized
        .split('')
        .map(c => c + c)
        .join('');
    }

    return normalized.length === 6 ? normalized : null;
  }

  /**
   * Normalize rgba string
   */
  private normalizeRgba(rgba: string): string | null {
    if (!rgba) return null;
    const match = rgba.match(/rgba?\(([^)]+)\)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Parse rgba values from string
   */
  private parseRgba(rgba: string): { r: number; g: number; b: number; a: number } | null {
    const normalized = this.normalizeRgba(rgba);
    if (!normalized) return null;

    const parts = normalized.split(',').map(p => parseFloat(p.trim()));
    if (parts.length >= 3) {
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts.length > 3 ? parts[3] : 1
      };
    }

    return null;
  }

  /**
   * Convert RGBAColor to rgba string
   */
  private rgbaToString(color: { r: number; g: number; b: number; a: number }): string {
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a.toFixed(2)})`;
  }

  /**
   * Check if two color strings match (with tolerance)
   */
  private colorsMatch(color1: string, color2: string): boolean {
    const rgba1 = this.parseRgba(color1);
    const rgba2 = this.parseRgba(color2);

    if (rgba1 && rgba2) {
      return (
        Math.abs(rgba1.r - rgba2.r) < 2 &&
        Math.abs(rgba1.g - rgba2.g) < 2 &&
        Math.abs(rgba1.b - rgba2.b) < 2 &&
        Math.abs(rgba1.a - rgba2.a) < 0.01
      );
    }

    const hex1 = this.normalizeHex(color1);
    const hex2 = this.normalizeHex(color2);
    return hex1 !== null && hex2 !== null && hex1 === hex2;
  }

  /**
   * Normalize font weight value
   */
  private normalizeFontWeight(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 400;

    const weightMap: Record<string, number> = {
      thin: 100,
      extralight: 200,
      light: 300,
      regular: 400,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900
    };

    const lower = value.toLowerCase().trim();
    if (weightMap[lower]) return weightMap[lower];

    const num = parseInt(value, 10);
    return isNaN(num) ? 400 : num;
  }

  /**
   * Normalize dimension value to number (removes units)
   */
  private normalizeDimension(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;

    // Remove units and parse
    const cleaned = value.replace(/px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Check if value looks like a color
   */
  private looksLikeColor(value: any): boolean {
    if (typeof value !== 'string') return false;
    const str = value.trim().toLowerCase();
    return (
      str.match(/^#[0-9a-f]{3,8}$/) !== null ||
      str.match(/^rgba?\(/) !== null ||
      str.match(/^hsla?\(/) !== null
    );
  }

  /**
   * Check if value looks like a dimension
   */
  private looksLikeDimension(value: any): boolean {
    if (typeof value === 'number') return true;
    if (typeof value !== 'string') return false;
    return /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/.test(value.trim());
  }

  /**
   * Check if token path suggests it's a spacing/dimension token
   */
  private looksLikeSpacingToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const spacingKeywords = [
      'spacing', 'space', 'size', 'sizing', 'dimension',
      'width', 'height', 'padding', 'margin', 'gap',
      'radius', 'border', 'inset', 'offset',
      // Additional keywords for common token naming patterns
      'corner', 'round', 'stroke', 'weight',
      // Numeric patterns like "1x", "2x", "4x" are common for spacing
      '1x', '2x', '3x', '4x', '5x', '6x', '8x', '10x', '12x', '16x'
    ];
    return spacingKeywords.some(keyword => pathStr.includes(keyword));
  }

  /**
   * Check if token path suggests it's a border-radius token
   */
  private looksLikeBorderRadiusToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const radiusKeywords = [
      'radius', 'corner', 'round', 'rounded', 'borderradius'
    ];
    return radiusKeywords.some(keyword => pathStr.includes(keyword));
  }

  /**
   * Check if token path suggests it's a border/stroke token
   */
  private looksLikeBorderToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const borderKeywords = [
      'border', 'stroke', 'outline', 'line'
    ];
    // Exclude borderRadius which is handled separately
    if (pathStr.includes('radius')) return false;
    return borderKeywords.some(keyword => pathStr.includes(keyword));
  }

  /**
   * Check if token path suggests it's an effect/shadow token
   */
  private looksLikeEffectToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const effectKeywords = [
      'shadow', 'effect', 'blur', 'elevation', 'drop'
    ];
    return effectKeywords.some(keyword => pathStr.includes(keyword));
  }
}

