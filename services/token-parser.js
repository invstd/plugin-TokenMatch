/**
 * Token Parser Service
 * Parses design token files following W3C Design Tokens Format
 */
export class TokenParser {
    constructor() {
        this.tokens = [];
        this.errors = [];
        this.tokenMap = new Map();
    }
    /**
     * Parse a token file (JSON object)
     */
    parse(tokenFile, filePath = '') {
        this.tokens = [];
        this.errors = [];
        this.tokenMap = new Map();
        // First pass: collect all tokens
        this.collectTokens(tokenFile, []);
        // Second pass: resolve aliases and references
        this.resolveAliases();
        // Third pass: validate tokens
        this.validateTokens();
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
     */
    collectTokens(obj, path) {
        if (this.isDesignToken(obj)) {
            // This is a token
            const tokenName = path[path.length - 1] || 'unnamed';
            const tokenType = this.inferTokenType(obj, path);
            const parsedToken = {
                name: tokenName,
                value: obj.$value,
                type: tokenType,
                path: [...path],
                description: obj.$description,
                extensions: obj.$extensions,
                rawValue: obj.$value
            };
            // Check for alias/reference
            if (typeof obj.$value === 'string' && obj.$value.startsWith('{')) {
                parsedToken.aliases = this.extractAliases(obj.$value);
            }
            this.tokens.push(parsedToken);
            this.tokenMap.set(path.join('.'), parsedToken);
        }
        else {
            // This is a group, recurse
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    this.collectTokens(obj[key], [...path, key]);
                }
            }
        }
    }
    /**
     * Check if an object is a DesignToken
     */
    isDesignToken(obj) {
        return obj && typeof obj === 'object' && '$value' in obj;
    }
    /**
     * Infer token type from value or path
     */
    inferTokenType(token, path) {
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
            if (pathStr.includes('weight'))
                return 'fontWeight';
            if (pathStr.includes('family'))
                return 'fontFamily';
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
     * Format: {path.to.token} or {path.to.token, fallback}
     */
    extractAliases(value) {
        const aliases = [];
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
     */
    resolveAliases() {
        for (const token of this.tokens) {
            if (token.aliases && token.aliases.length > 0) {
                for (const aliasPath of token.aliases) {
                    const referencedToken = this.tokenMap.get(aliasPath);
                    if (referencedToken) {
                        // Resolve the alias
                        token.value = referencedToken.value;
                        // Keep track of the reference
                        if (!token.aliases)
                            token.aliases = [];
                    }
                    else {
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
    validateTokens() {
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
    validateTokenValue(token) {
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
    validateColor(value) {
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
    validateDimension(value) {
        if (typeof value === 'string') {
            const dimensionPattern = /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/;
            if (!dimensionPattern.test(value)) {
                return { valid: false, message: `Invalid dimension format: ${value}`, severity: 'error' };
            }
        }
        else if (typeof value === 'number') {
            // Numbers are acceptable for dimensions
            return { valid: true };
        }
        else {
            return { valid: false, message: 'Dimension value must be a string or number', severity: 'error' };
        }
        return { valid: true };
    }
    validateFontWeight(value) {
        if (typeof value === 'string') {
            const validWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'];
            if (!validWeights.includes(value)) {
                return { valid: false, message: `Invalid font weight: ${value}`, severity: 'warning' };
            }
        }
        else if (typeof value === 'number') {
            if (value < 1 || value > 1000) {
                return { valid: false, message: 'Font weight must be between 1 and 1000', severity: 'error' };
            }
        }
        else {
            return { valid: false, message: 'Font weight must be a string or number', severity: 'error' };
        }
        return { valid: true };
    }
    validateDuration(value) {
        if (typeof value !== 'string') {
            return { valid: false, message: 'Duration value must be a string', severity: 'error' };
        }
        const durationPattern = /^\d+(\.\d+)?(ms|s)$/;
        if (!durationPattern.test(value)) {
            return { valid: false, message: `Invalid duration format: ${value}`, severity: 'error' };
        }
        return { valid: true };
    }
    validateTypography(value) {
        if (typeof value !== 'object' || Array.isArray(value)) {
            return { valid: false, message: 'Typography value must be an object', severity: 'error' };
        }
        // Typography should have fontFamily and fontSize at minimum
        if (!value.fontFamily) {
            return { valid: false, message: 'Typography token missing fontFamily', severity: 'warning' };
        }
        return { valid: true };
    }
    validateShadow(value) {
        if (typeof value !== 'object' || Array.isArray(value)) {
            return { valid: false, message: 'Shadow value must be an object', severity: 'error' };
        }
        // Shadow should have color and offset
        if (!value.color) {
            return { valid: false, message: 'Shadow token missing color', severity: 'warning' };
        }
        return { valid: true };
    }
    /**
     * Get all tokens of a specific type
     */
    getTokensByType(type) {
        return this.tokens.filter(token => token.type === type);
    }
    /**
     * Get token by path
     */
    getTokenByPath(path) {
        return this.tokenMap.get(path.join('.'));
    }
    /**
     * Get all validation errors
     */
    getErrors() {
        return this.errors;
    }
}
