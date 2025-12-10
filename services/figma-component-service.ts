/**
 * Figma Component Service
 * Scans and extracts properties from Figma components
 */

import {
  ComponentProperties,
  ComponentScanResult,
  ColorProperty,
  TypographyProperty,
  SpacingProperty,
  EffectProperty,
  ScanError
} from '../types/components';

export class FigmaComponentService {
  private errors: ScanError[] = [];

  /**
   * Scan all components in the document
   */
  scanAllComponents(): ComponentScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    let totalInstances = 0;
    const pages = figma.root.children;

    // Scan all pages
    for (const page of pages) {
      if (page.type === 'PAGE') {
        // Find all components and component sets
        const pageComponents = page.findAll(node => 
          node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
        );

        // Find all component instances
        const instances = page.findAll(node => node.type === 'INSTANCE');
        totalInstances += instances.length;

        // Process each component
        for (const component of pageComponents) {
          try {
            const props = this.extractComponentProperties(component, page.name);
            if (props) {
              components.push(props);
            }
          } catch (error) {
            this.errors.push({
              componentId: component.id,
              componentName: component.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: pages.length,
      errors: this.errors
    };
  }

  /**
   * Scan components on the current page only
   */
  scanCurrentPage(): ComponentScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    const currentPage = figma.currentPage;
    let totalInstances = 0;

    // Find all components and component sets on current page
    const pageComponents = currentPage.findAll(node => 
      node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
    );

    // Find all component instances
    const instances = currentPage.findAll(node => node.type === 'INSTANCE');
    totalInstances += instances.length;

    // Process each component
    for (const component of pageComponents) {
      try {
        const props = this.extractComponentProperties(component, currentPage.name);
        if (props) {
          components.push(props);
        }
      } catch (error) {
        this.errors.push({
          componentId: component.id,
          componentName: component.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: 1,
      errors: this.errors
    };
  }

  /**
   * Extract all properties from a component node
   */
  extractComponentProperties(node: SceneNode, pageName: string): ComponentProperties | null {
    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET' && node.type !== 'INSTANCE') {
      return null;
    }

    const properties: ComponentProperties = {
      id: node.id,
      name: node.name,
      type: node.type,
      pageName: pageName,
      colors: [],
      typography: [],
      spacing: [],
      effects: []
    };

    // Extract colors (fills and strokes)
    properties.colors = this.extractColors(node);

    // Extract typography
    properties.typography = this.extractTypography(node);

    // Extract spacing
    properties.spacing = this.extractSpacing(node);

    // Extract effects
    properties.effects = this.extractEffects(node);

    // Extract layout properties if it's a frame-like node
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const frame = node as ComponentNode | ComponentSetNode;
      if ('layoutMode' in frame && frame.layoutMode) {
        properties.layoutMode = frame.layoutMode as 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID';
        properties.itemSpacing = frame.itemSpacing;
        properties.paddingTop = frame.paddingTop;
        properties.paddingRight = frame.paddingRight;
        properties.paddingBottom = frame.paddingBottom;
        properties.paddingLeft = frame.paddingLeft;
      }
      properties.width = frame.width;
      properties.height = frame.height;
    } else if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      properties.width = instance.width;
      properties.height = instance.height;
    }

    // Recursively extract from children
    if ('children' in node) {
      const childProperties: ComponentProperties[] = [];
      for (const child of node.children) {
        const childProps = this.extractComponentProperties(child, pageName);
        if (childProps) {
          childProperties.push(childProps);
        }
      }
      if (childProperties.length > 0) {
        properties.children = childProperties;
      }
    }

    return properties;
  }

  /**
   * Extract color properties (fills and strokes)
   */
  private extractColors(node: SceneNode): ColorProperty[] {
    const colors: ColorProperty[] = [];

    // Extract fills
    if ('fills' in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID') {
          const color = this.rgbaToColor(fill.color, fill.opacity ?? 1);
          colors.push({
            type: 'fill',
            color: {
              r: fill.color.r,
              g: fill.color.g,
              b: fill.color.b,
              a: fill.opacity ?? 1
            },
            hex: color.hex,
            rgba: color.rgba,
            opacity: fill.opacity ?? 1
          });
        }
      }
    }

    // Extract strokes
    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID') {
          const color = this.rgbaToColor(stroke.color, stroke.opacity ?? 1);
          colors.push({
            type: 'stroke',
            color: {
              r: stroke.color.r,
              g: stroke.color.g,
              b: stroke.color.b,
              a: stroke.opacity ?? 1
            },
            hex: color.hex,
            rgba: color.rgba,
            opacity: stroke.opacity ?? 1
          });
        }
      }
    }

    return colors;
  }

  /**
   * Extract typography properties from text nodes
   */
  private extractTypography(node: SceneNode): TypographyProperty[] {
    const typography: TypographyProperty[] = [];

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      const fontName = textNode.fontName as FontName;
      
      typography.push({
        fontFamily: fontName.family,
        fontSize: typeof textNode.fontSize === 'number' ? textNode.fontSize : 16,
        fontWeight: typeof fontName.style === 'string' 
          ? this.parseFontWeight(fontName.style)
          : 400,
        lineHeight: typeof textNode.lineHeight === 'number' || typeof textNode.lineHeight === 'string'
          ? textNode.lineHeight
          : undefined,
        letterSpacing: typeof textNode.letterSpacing === 'number'
          ? textNode.letterSpacing
          : undefined,
        textDecoration: typeof textNode.textDecoration === 'string'
          ? textNode.textDecoration
          : undefined,
        textCase: typeof textNode.textCase === 'string'
          ? textNode.textCase
          : undefined
      });
    }

    // Recursively check children
    if ('children' in node) {
      for (const child of node.children) {
        typography.push(...this.extractTypography(child));
      }
    }

    return typography;
  }

  /**
   * Extract spacing properties
   */
  private extractSpacing(node: SceneNode): SpacingProperty[] {
    const spacing: SpacingProperty[] = [];

    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const frame = node as ComponentNode | ComponentSetNode;

      // Width and height
      spacing.push({
        type: 'width',
        value: frame.width,
        unit: 'px'
      });
      spacing.push({
        type: 'height',
        value: frame.height,
        unit: 'px'
      });

      // Padding (only for frames with auto-layout)
      if ('paddingTop' in frame && typeof frame.paddingTop === 'number') {
        if (frame.paddingTop) {
          spacing.push({
            type: 'padding',
            value: frame.paddingTop,
            unit: 'px'
          });
        }
        if (frame.paddingRight) {
          spacing.push({
            type: 'padding',
            value: frame.paddingRight,
            unit: 'px'
          });
        }
        if (frame.paddingBottom) {
          spacing.push({
            type: 'padding',
            value: frame.paddingBottom,
            unit: 'px'
          });
        }
        if (frame.paddingLeft) {
          spacing.push({
            type: 'padding',
            value: frame.paddingLeft,
            unit: 'px'
          });
        }
      }

      // Item spacing (for auto-layout)
      if ('itemSpacing' in frame && typeof frame.itemSpacing === 'number' && frame.itemSpacing) {
        spacing.push({
          type: 'gap',
          value: frame.itemSpacing,
          unit: 'px'
        });
      }
    } else if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      spacing.push({
        type: 'width',
        value: instance.width,
        unit: 'px'
      });
      spacing.push({
        type: 'height',
        value: instance.height,
        unit: 'px'
      });
    }

    return spacing;
  }

  /**
   * Extract effect properties (shadows, blurs)
   */
  private extractEffects(node: SceneNode): EffectProperty[] {
    const effects: EffectProperty[] = [];

    if ('effects' in node && Array.isArray(node.effects)) {
      for (const effect of node.effects) {
        if (effect.visible) {
          switch (effect.type) {
            case 'DROP_SHADOW':
              effects.push({
                type: 'drop-shadow',
                visible: effect.visible,
                radius: effect.radius,
                color: effect.color ? {
                  r: effect.color.r,
                  g: effect.color.g,
                  b: effect.color.b,
                  a: effect.color.a
                } : undefined,
                offset: {
                  x: effect.offset?.x ?? 0,
                  y: effect.offset?.y ?? 0
                },
                spread: effect.spread
              });
              break;
            case 'INNER_SHADOW':
              effects.push({
                type: 'inner-shadow',
                visible: effect.visible,
                radius: effect.radius,
                color: effect.color ? {
                  r: effect.color.r,
                  g: effect.color.g,
                  b: effect.color.b,
                  a: effect.color.a
                } : undefined,
                offset: {
                  x: effect.offset?.x ?? 0,
                  y: effect.offset?.y ?? 0
                },
                spread: effect.spread
              });
              break;
            case 'LAYER_BLUR':
              effects.push({
                type: 'layer-blur',
                visible: effect.visible,
                radius: effect.radius
              });
              break;
            case 'BACKGROUND_BLUR':
              effects.push({
                type: 'background-blur',
                visible: effect.visible,
                radius: effect.radius
              });
              break;
          }
        }
      }
    }

    return effects;
  }

  /**
   * Convert RGBA color to hex and rgba string
   */
  private rgbaToColor(color: RGB, opacity: number): { hex: string; rgba: string } {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = opacity;

    const hex = `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;

    const rgba = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;

    return { hex, rgba };
  }

  /**
   * Parse font weight from font style name
   */
  private parseFontWeight(style: string): number {
    const weightMap: { [key: string]: number } = {
      'thin': 100,
      'extralight': 200,
      'light': 300,
      'regular': 400,
      'medium': 500,
      'semibold': 600,
      'bold': 700,
      'extrabold': 800,
      'black': 900
    };

    const lowerStyle = style.toLowerCase();
    for (const [key, value] of Object.entries(weightMap)) {
      if (lowerStyle.includes(key)) {
        return value;
      }
    }

    // Try to extract number from style
    const match = style.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return 400; // Default
  }

  /**
   * Get component usage statistics
   */
  getComponentUsageStats(componentId: string): { instances: number; pages: string[] } {
    const instances: SceneNode[] = [];
    const pages = new Set<string>();

    for (const page of figma.root.children) {
      if (page.type === 'PAGE') {
        const pageInstances = page.findAll(node => 
          node.type === 'INSTANCE' && 
          (node as InstanceNode).mainComponent?.id === componentId
        );

        if (pageInstances.length > 0) {
          instances.push(...pageInstances);
          pages.add(page.name);
        }
      }
    }

    return {
      instances: instances.length,
      pages: Array.from(pages)
    };
  }
}

