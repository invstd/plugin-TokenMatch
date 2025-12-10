/**
 * Type definitions for Figma Component Analysis
 */

export interface ColorProperty {
  type: 'fill' | 'stroke';
  color: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  hex: string;
  rgba: string;
  opacity?: number;
}

export interface TypographyProperty {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  lineHeight?: number | string;
  letterSpacing?: number;
  textDecoration?: string;
  textCase?: string;
}

export interface SpacingProperty {
  type: 'padding' | 'gap' | 'margin' | 'width' | 'height';
  value: number;
  unit: 'px';
}

export interface EffectProperty {
  type: 'drop-shadow' | 'inner-shadow' | 'layer-blur' | 'background-blur';
  visible: boolean;
  radius: number;
  color?: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  offset?: {
    x: number;
    y: number;
  };
  spread?: number;
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
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  width?: number;
  height?: number;
  children?: ComponentProperties[];
}

export interface ComponentScanResult {
  components: ComponentProperties[];
  totalComponents: number;
  totalInstances: number;
  pagesScanned: number;
  errors: ScanError[];
}

export interface ScanError {
  componentId: string;
  componentName: string;
  error: string;
}

