(() => {
  // services/token-parser.ts
  var TokenParser = class {
    constructor() {
      this.tokens = [];
      this.errors = [];
      this.tokenMap = /* @__PURE__ */ new Map();
    }
    /**
     * Parse a token file (JSON object)
     */
    parse(tokenFile, filePath = "") {
      this.tokens = [];
      this.errors = [];
      this.tokenMap = /* @__PURE__ */ new Map();
      try {
        console.log(`[TokenParser] Starting to collect tokens from ${filePath || "root"}`);
        console.log(`[TokenParser] Input structure:`, JSON.stringify(Object.keys(tokenFile || {})).substring(0, 200));
        this.collectTokens(tokenFile, []);
        console.log(`[TokenParser] Collected ${this.tokens.length} tokens`);
        if (this.tokens.length === 0) {
          console.warn(`[TokenParser] No tokens found! File structure might not match expected format.`);
          console.warn(`[TokenParser] Expected: Objects with $value or value property`);
          console.warn(`[TokenParser] Sample of file structure:`, JSON.stringify(tokenFile).substring(0, 500));
        }
        console.log(`[TokenParser] Resolving aliases...`);
        this.resolveAliases();
        console.log(`[TokenParser] Alias resolution complete`);
        console.log(`[TokenParser] Validating tokens...`);
        this.validateTokens();
        const errorCategories = {};
        for (const error of this.errors) {
          const category = error.message.split(":")[0] || error.message;
          errorCategories[category] = (errorCategories[category] || 0) + 1;
        }
        console.log(`[TokenParser] Validation complete. ${this.errors.length} errors found:`);
        console.log(`[TokenParser] Error breakdown:`, errorCategories);
      } catch (error) {
        console.error(`[TokenParser] Error parsing ${filePath}:`, error);
        this.errors.push({
          path: [],
          message: `Parser error: ${error instanceof Error ? error.message : "Unknown error"}`,
          severity: "error"
        });
      }
      return {
        tokens: this.tokens,
        metadata: {
          filePath,
          format: "w3c-design-tokens",
          errors: this.errors
        }
      };
    }
    /**
     * Collect all tokens from the token file structure
     * @param maxDepth Maximum nesting depth to prevent stack overflow
     */
    collectTokens(obj, path, maxDepth = 50, currentDepth = 0) {
      if (currentDepth >= maxDepth) {
        this.errors.push({
          path,
          message: `Maximum nesting depth ${maxDepth} exceeded`,
          severity: "error"
        });
        return;
      }
      if (path.length > 0) {
        const pathStr = path.join(".");
        if (path.length > 100) {
          this.errors.push({
            path,
            message: "Token path too long, possible circular reference",
            severity: "error"
          });
          return;
        }
      }
      if (this.isDesignToken(obj)) {
        const tokenName = path[path.length - 1] || "unnamed";
        const tokenValue = "$value" in obj ? obj.$value : obj.value;
        const tokenType = this.inferTokenType(obj, path);
        const parsedToken = {
          name: tokenName,
          value: tokenValue,
          type: tokenType,
          path: [...path],
          description: "$description" in obj ? obj.$description : obj.description || void 0,
          extensions: "$extensions" in obj ? obj.$extensions : void 0,
          rawValue: tokenValue
        };
        if (typeof tokenValue === "string" && tokenValue.startsWith("{")) {
          parsedToken.aliases = this.extractAliases(tokenValue);
        }
        this.tokens.push(parsedToken);
        this.tokenMap.set(path.join("."), parsedToken);
      } else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const keys = Object.keys(obj);
        if (keys.length > 1e3) {
          this.errors.push({
            path,
            message: `Object has too many keys (${keys.length}), skipping`,
            severity: "warning"
          });
          return;
        }
        for (const key of keys) {
          try {
            this.collectTokens(obj[key], [...path, key], maxDepth, currentDepth + 1);
          } catch (error) {
            this.errors.push({
              path: [...path, key],
              message: `Error processing key "${key}": ${error instanceof Error ? error.message : "Unknown error"}`,
              severity: "error"
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
    isDesignToken(obj) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return false;
      }
      if ("$value" in obj) {
        return true;
      }
      if ("value" in obj) {
        return true;
      }
      return false;
    }
    /**
     * Infer token type from value or path
     */
    inferTokenType(token, path) {
      if (token.$type) {
        return token.$type;
      }
      if (token.type && typeof token.type === "string") {
        return token.type;
      }
      const pathStr = path.join(".").toLowerCase();
      if (pathStr.includes("color") || pathStr.includes("colour")) {
        return "color";
      }
      if (pathStr.includes("font") || pathStr.includes("typography") || pathStr.includes("text")) {
        if (pathStr.includes("weight")) return "fontWeight";
        if (pathStr.includes("family")) return "fontFamily";
        return "typography";
      }
      if (pathStr.includes("spacing") || pathStr.includes("size") || pathStr.includes("gap")) {
        return "dimension";
      }
      if (pathStr.includes("shadow")) {
        return "shadow";
      }
      if (pathStr.includes("border")) {
        return "border";
      }
      const value = "$value" in token ? token.$value : token.value;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        if (value.fontFamily || value.fontSize) {
          return "typography";
        }
        if (value.color || value.offset || value.radius) {
          return "shadow";
        }
        if (value.width || value.style) {
          return "border";
        }
      }
      if (typeof value === "string") {
        if (value.match(/^#[0-9A-Fa-f]{3,8}$/) || value.match(/^rgba?\(/) || value.match(/^hsla?\(/)) {
          return "color";
        }
        if (value.match(/^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/)) {
          return "dimension";
        }
        if (value.match(/^\d+(\.\d+)?(ms|s)$/)) {
          return "duration";
        }
      }
      if (typeof value === "number") {
        return "number";
      }
      if (typeof value === "boolean") {
        return "boolean";
      }
      return "string";
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
        const aliasPath = match[1].split(",").map((s) => s.trim())[0];
        aliases.push(aliasPath);
      }
      return aliases;
    }
    /**
     * Resolve token aliases and references
     * Prevents circular references
     */
    resolveAliases() {
      const resolving = /* @__PURE__ */ new Set();
      for (const token of this.tokens) {
        if (token.aliases && token.aliases.length > 0) {
          const tokenPath = token.path.join(".");
          if (resolving.has(tokenPath)) {
            this.errors.push({
              path: token.path,
              message: `Circular alias reference detected: ${tokenPath}`,
              severity: "error"
            });
            continue;
          }
          resolving.add(tokenPath);
          try {
            for (const aliasPath of token.aliases) {
              const referencedToken = this.tokenMap.get(aliasPath);
              if (referencedToken) {
                if (referencedToken.path.join(".") === tokenPath) {
                  this.errors.push({
                    path: token.path,
                    message: `Token references itself: ${tokenPath}`,
                    severity: "error"
                  });
                  continue;
                }
                token.value = referencedToken.value;
              } else {
                this.errors.push({
                  path: token.path,
                  message: `Unresolved alias: ${aliasPath}`,
                  severity: "error"
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
      if (value === null || value === void 0) {
        return { valid: false, message: "Token value cannot be null or undefined", severity: "error" };
      }
      switch (type) {
        case "color":
          return this.validateColor(value);
        case "dimension":
          return this.validateDimension(value);
        case "fontWeight":
          return this.validateFontWeight(value);
        case "duration":
          return this.validateDuration(value);
        case "typography":
          return this.validateTypography(value);
        case "shadow":
          return this.validateShadow(value);
        default:
          return { valid: true };
      }
    }
    validateColor(value) {
      if (typeof value !== "string") {
        return { valid: false, message: "Color value must be a string", severity: "error" };
      }
      const colorPatterns = [
        /^#[0-9A-Fa-f]{3,8}$/,
        // Hex
        /^rgba?\([^)]+\)$/,
        // RGB/RGBA
        /^hsla?\([^)]+\)$/
        // HSL/HSLA
      ];
      const isValid = colorPatterns.some((pattern) => pattern.test(value));
      if (!isValid) {
        return { valid: false, message: `Invalid color format: ${value}`, severity: "error" };
      }
      return { valid: true };
    }
    validateDimension(value) {
      if (typeof value === "string") {
        const dimensionPattern = /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)?$/;
        if (!dimensionPattern.test(value)) {
          return { valid: true, message: `Unusual dimension format: ${value}`, severity: "warning" };
        }
      } else if (typeof value === "number") {
        return { valid: true };
      } else {
        return { valid: true, message: "Dimension value is not a string or number", severity: "warning" };
      }
      return { valid: true };
    }
    validateFontWeight(value) {
      if (typeof value === "string") {
        const validWeights = ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold", "lighter", "bolder"];
        if (!validWeights.includes(value.toLowerCase())) {
          return { valid: true, message: `Unusual font weight: ${value}`, severity: "warning" };
        }
      } else if (typeof value === "number") {
        if (value < 1 || value > 1e3) {
          return { valid: false, message: "Font weight must be between 1 and 1000", severity: "error" };
        }
      } else {
        return { valid: true, message: "Font weight is not a string or number", severity: "warning" };
      }
      return { valid: true };
    }
    validateDuration(value) {
      if (typeof value !== "string") {
        return { valid: false, message: "Duration value must be a string", severity: "error" };
      }
      const durationPattern = /^\d+(\.\d+)?(ms|s)$/;
      if (!durationPattern.test(value)) {
        return { valid: false, message: `Invalid duration format: ${value}`, severity: "error" };
      }
      return { valid: true };
    }
    validateTypography(value) {
      if (typeof value !== "object" || Array.isArray(value) || value === null) {
        return { valid: true, message: "Typography value is not an object", severity: "warning" };
      }
      if (!value.fontFamily && !value.fontSize) {
        return { valid: true, message: "Typography token missing fontFamily or fontSize", severity: "warning" };
      }
      return { valid: true };
    }
    validateShadow(value) {
      if (typeof value !== "object" || Array.isArray(value) || value === null) {
        return { valid: true, message: "Shadow value is not an object", severity: "warning" };
      }
      if (!value.color && !value.offset && !value.radius) {
        return { valid: true, message: "Shadow token missing color, offset, or radius", severity: "warning" };
      }
      return { valid: true };
    }
    /**
     * Get all tokens of a specific type
     */
    getTokensByType(type) {
      return this.tokens.filter((token) => token.type === type);
    }
    /**
     * Get token by path
     */
    getTokenByPath(path) {
      return this.tokenMap.get(path.join("."));
    }
    /**
     * Get all validation errors
     */
    getErrors() {
      return this.errors;
    }
  };

  // services/github-token-service.ts
  var GitHubTokenService = class {
    constructor() {
      this.parser = new TokenParser();
    }
    /**
     * Parse GitHub URL to extract owner and repo
     */
    parseGitHubUrl(url) {
      const patterns = [
        /github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?$/,
        /github\.com\/([^\/]+)\/([^\/]+)/
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return { owner: match[1], repo: match[2] };
        }
      }
      return null;
    }
    /**
     * Fetch branches from GitHub repository
     */
    async fetchBranches(owner, repo, token) {
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
        console.log(`[GitHubService] Fetching branches from: ${url}`);
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });
        console.log(`[GitHubService] Response status: ${response.status}`);
        if (!response.ok) {
          let errorMessage = "";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || "";
          } catch (e) {
            errorMessage = response.statusText;
          }
          if (response.status === 401) {
            throw new Error("Authentication failed. Please check your personal access token.");
          } else if (response.status === 404) {
            throw new Error("Repository not found. Please check the repository URL.");
          } else if (response.status === 403) {
            throw new Error(`Access forbidden: ${errorMessage || "The token may not have the required permissions."}`);
          } else {
            throw new Error(`GitHub API error (${response.status}): ${errorMessage || response.statusText}`);
          }
        }
        const branches = await response.json();
        console.log(`[GitHubService] Successfully fetched ${branches.length} branches`);
        return branches.map((branch) => branch.name);
      } catch (error) {
        console.error("[GitHubService] Error fetching branches:", error);
        if (error instanceof Error) {
          if (error.message.includes("fetch") || error.message.includes("network")) {
            throw new Error("Network error. Please check your internet connection.");
          }
          throw error;
        }
        throw new Error(`Failed to fetch branches: ${String(error)}`);
      }
    }
    /**
     * Fetch file contents from GitHub
     */
    async fetchFileContents(owner, repo, branch, token, path) {
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        throw new Error(`Failed to fetch file contents: ${error}`);
      }
    }
    /**
     * Fetch directory contents from GitHub
     */
    async fetchDirectoryContents(owner, repo, branch, token, path = "") {
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }
        const contents = await response.json();
        return Array.isArray(contents) ? contents : [contents];
      } catch (error) {
        throw new Error(`Failed to fetch directory contents: ${error}`);
      }
    }
    /**
     * Decode base64 content from GitHub API
     * Note: Figma plugins don't have atob, so we implement it manually
     */
    decodeBase64Content(encodedContent) {
      try {
        let cleanContent = encodedContent.replace(/\s/g, "");
        cleanContent = cleanContent.replace(/[^A-Za-z0-9\+\/=]/g, "");
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let result = "";
        let i = 0;
        while (i < cleanContent.length) {
          const char1 = cleanContent.charAt(i++);
          const char2 = i < cleanContent.length ? cleanContent.charAt(i++) : "=";
          const char3 = i < cleanContent.length ? cleanContent.charAt(i++) : "=";
          const char4 = i < cleanContent.length ? cleanContent.charAt(i++) : "=";
          const encoded1 = chars.indexOf(char1);
          const encoded2 = chars.indexOf(char2);
          const encoded3 = char3 === "=" ? -1 : chars.indexOf(char3);
          const encoded4 = char4 === "=" ? -1 : chars.indexOf(char4);
          if (encoded1 === -1 || encoded2 === -1) {
            throw new Error(`Invalid base64 character at position ${i - 4}`);
          }
          const bitmap = encoded1 << 18 | encoded2 << 12 | (encoded3 >= 0 ? encoded3 : 0) << 6 | (encoded4 >= 0 ? encoded4 : 0);
          result += String.fromCharCode(bitmap >> 16 & 255);
          if (encoded3 >= 0) {
            result += String.fromCharCode(bitmap >> 8 & 255);
          }
          if (encoded4 >= 0) {
            result += String.fromCharCode(bitmap & 255);
          }
          if (char3 === "=" || char4 === "=") {
            break;
          }
        }
        return result;
      } catch (error) {
        throw new Error(`Failed to decode base64 content: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    /**
     * Remove comments from JSON (JSONC/JSON5 support)
     * Supports both // and block style comments
     */
    stripJSONComments(jsonString) {
      let result = "";
      let inString = false;
      let stringChar = "";
      let i = 0;
      while (i < jsonString.length) {
        const char = jsonString[i];
        const nextChar = i + 1 < jsonString.length ? jsonString[i + 1] : "";
        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
          result += char;
          i++;
          continue;
        }
        if (inString && jsonString[i] === stringChar && jsonString[i - 1] !== "\\") {
          inString = false;
          stringChar = "";
          result += char;
          i++;
          continue;
        }
        if (inString) {
          result += char;
          i++;
          continue;
        }
        if (char === "/" && nextChar === "/") {
          while (i < jsonString.length && jsonString[i] !== "\n" && jsonString[i] !== "\r") {
            i++;
          }
          continue;
        }
        if (char === "/" && nextChar === "*") {
          i += 2;
          while (i < jsonString.length) {
            if (jsonString[i] === "*" && i + 1 < jsonString.length && jsonString[i + 1] === "/") {
              i += 2;
              break;
            }
            i++;
          }
          continue;
        }
        result += char;
        i++;
      }
      return result;
    }
    /**
     * Parse JSON content from GitHub file
     * Supports JSON, JSONC (with comments), and JSON5 formats
     */
    parseJSONContent(content) {
      try {
        return JSON.parse(content);
      } catch (error) {
        try {
          const cleaned = this.stripJSONComments(content);
          return JSON.parse(cleaned);
        } catch (commentError) {
          const preview = content.substring(0, 200).replace(/\n/g, "\\n");
          throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}. Content preview: ${preview}...`);
        }
      }
    }
    /**
     * Fetch and parse design tokens from GitHub
     */
    async fetchTokens(owner, repo, branch, token, filePath) {
      const fileContent = await this.fetchFileContents(owner, repo, branch, token, filePath);
      if (fileContent.type !== "file") {
        throw new Error(`Path is not a file: ${filePath}`);
      }
      if (!fileContent.content) {
        throw new Error("File content is empty");
      }
      const decodedContent = this.decodeBase64Content(fileContent.content);
      let tokenFile;
      try {
        tokenFile = this.parseJSONContent(decodedContent);
      } catch (error) {
        throw new Error(`Failed to parse JSON from ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
      const contentSize = decodedContent.length;
      if (contentSize > 5 * 1024 * 1024) {
        throw new Error(`File ${filePath} is too large (${Math.round(contentSize / 1024)}KB). Maximum size is 5MB.`);
      }
      let parsedTokens;
      try {
        parsedTokens = this.parser.parse(tokenFile, filePath);
      } catch (error) {
        throw new Error(`Failed to parse tokens from ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
      return parsedTokens;
    }
    /**
     * Auto-detect token files in a directory
     * @param maxDepth Maximum recursion depth (default: 5)
     * @param currentDepth Current recursion depth (internal use)
     * @param visitedPaths Set of visited paths to prevent cycles (internal use)
     */
    async detectTokenFiles(owner, repo, branch, token, directoryPath = "", maxDepth = 5, currentDepth = 0, visitedPaths = /* @__PURE__ */ new Set()) {
      if (currentDepth >= maxDepth) {
        console.warn(`Max depth ${maxDepth} reached for ${directoryPath}`);
        return [];
      }
      if (visitedPaths.has(directoryPath)) {
        console.warn(`Cycle detected: ${directoryPath}`);
        return [];
      }
      visitedPaths.add(directoryPath);
      try {
        const contents = await this.fetchDirectoryContents(owner, repo, branch, token, directoryPath);
        const excludePatterns = [
          /package\.json$/i,
          /package-lock\.json$/i,
          /yarn\.lock$/i,
          /tsconfig\.json$/i,
          /jsconfig\.json$/i,
          /\.config\.json$/i,
          /\.eslintrc\.json$/i,
          /\.prettierrc\.json$/i,
          /node_modules/i,
          /\.git/i,
          /dist/i,
          /build/i
        ];
        const tokenFilePatterns = [
          /\.json$/i
          // Match all JSON files
        ];
        const tokenFiles = [];
        const MAX_FILES_PER_DIR = 20;
        let fileCount = 0;
        for (const item of contents) {
          if (excludePatterns.some((pattern) => pattern.test(item.path))) {
            continue;
          }
          if (item.type === "file") {
            fileCount++;
            if (fileCount > MAX_FILES_PER_DIR) {
              console.warn(`Too many files in ${directoryPath}, limiting to ${MAX_FILES_PER_DIR}`);
              break;
            }
            const fileName = item.name.toLowerCase();
            if (tokenFilePatterns.some((pattern) => pattern.test(fileName))) {
              tokenFiles.push(item.path);
            }
          } else if (item.type === "dir") {
            if (!excludePatterns.some((pattern) => pattern.test(item.path))) {
              try {
                const branchVisited = new Set(visitedPaths);
                const subFiles = await this.detectTokenFiles(owner, repo, branch, token, item.path, maxDepth, currentDepth + 1, branchVisited);
                tokenFiles.push(...subFiles);
                if (tokenFiles.length > 100) {
                  console.warn(`Found ${tokenFiles.length} files, stopping search to prevent memory issues`);
                  return tokenFiles.slice(0, 100);
                }
              } catch (error) {
                console.warn(`Failed to search directory ${item.path}:`, error);
              }
            }
          }
        }
        return tokenFiles;
      } catch (error) {
        console.error(`Error scanning directory ${directoryPath}:`, error);
        return [];
      }
    }
    /**
     * Fetch and parse multiple token files from a directory
     * If filePath is empty, searches from repository root
     */
    async fetchTokensFromDirectory(owner, repo, branch, token, directoryPath = "", progressCallback) {
      var _a;
      if (progressCallback) {
        progressCallback(`Scanning ${directoryPath || "repository root"}...`);
      }
      const tokenFiles = await this.detectTokenFiles(owner, repo, branch, token, directoryPath);
      if (tokenFiles.length === 0) {
        throw new Error(`No token files found in ${directoryPath || "repository root"}`);
      }
      if (progressCallback) {
        progressCallback(`Found ${tokenFiles.length} token file${tokenFiles.length === 1 ? "" : "s"}. Parsing...`);
      }
      console.log(`Found ${tokenFiles.length} token files in ${directoryPath || "root"}:`, tokenFiles);
      if (tokenFiles.length === 0) {
        throw new Error(`No token files found in ${directoryPath || "repository root"}`);
      }
      const MAX_FILES = 20;
      const filesToProcess = tokenFiles.slice(0, MAX_FILES);
      if (tokenFiles.length > MAX_FILES) {
        console.warn(`Found ${tokenFiles.length} files, processing first ${MAX_FILES}`);
        if (progressCallback) {
          progressCallback(`Found ${tokenFiles.length} files, processing first ${MAX_FILES}...`);
        }
      }
      const allTokens = [];
      const allErrors = [];
      const filePaths = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const filePath = filesToProcess[i];
        try {
          if (progressCallback) {
            progressCallback(`Parsing file ${i + 1}/${filesToProcess.length}: ${filePath.split("/").pop()}...`);
          }
          console.log(`[GitHubService] Fetching and parsing: ${filePath}`);
          const startTime = Date.now();
          const parsedTokens = await this.fetchTokens(owner, repo, branch, token, filePath);
          const duration = Date.now() - startTime;
          console.log(`[GitHubService] Completed ${filePath} in ${duration}ms (${parsedTokens.tokens.length} tokens)`);
          allTokens.push(...parsedTokens.tokens);
          if ((_a = parsedTokens.metadata) == null ? void 0 : _a.errors) {
            allErrors.push(...parsedTokens.metadata.errors);
          }
          filePaths.push(filePath);
          if (i > 0 && i % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        } catch (error) {
          allErrors.push({
            path: [filePath],
            message: error instanceof Error ? error.message : "Failed to parse file",
            severity: "error"
          });
        }
      }
      const mergedTokens = [];
      const seenPaths = /* @__PURE__ */ new Set();
      for (const token2 of allTokens) {
        const tokenPath = token2.path.join(".");
        if (!seenPaths.has(tokenPath)) {
          seenPaths.add(tokenPath);
          mergedTokens.push(token2);
        } else {
          allErrors.push({
            path: token2.path,
            message: `Duplicate token found in multiple files: ${tokenPath}`,
            severity: "warning"
          });
        }
      }
      const mergedTokenFile = {};
      for (const token2 of mergedTokens) {
        let current = mergedTokenFile;
        for (let i = 0; i < token2.path.length - 1; i++) {
          const key = token2.path[i];
          if (!current[key]) {
            current[key] = {};
          }
          current = current[key];
        }
        const lastKey = token2.path[token2.path.length - 1];
        current[lastKey] = {
          $type: token2.type,
          $value: token2.rawValue || token2.value,
          $description: token2.description,
          $extensions: token2.extensions
        };
      }
      const finalParsed = this.parser.parse(mergedTokenFile, directoryPath || "root");
      finalParsed.metadata.errors = [...allErrors, ...finalParsed.metadata.errors];
      finalParsed.metadata.filePath = filePaths.length === 1 ? filePaths[0] : `${filePaths.length} files from ${directoryPath || "root"}`;
      return finalParsed;
    }
  };

  // services/figma-component-service.ts
  var FigmaComponentService = class {
    constructor() {
      this.errors = [];
    }
    /**
     * Scan all components in the document
     */
    scanAllComponents() {
      this.errors = [];
      const components = [];
      let totalInstances = 0;
      const pages = figma.root.children;
      for (const page of pages) {
        if (page.type === "PAGE") {
          const pageComponents = page.findAll(
            (node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET"
          );
          const instances = page.findAll((node) => node.type === "INSTANCE");
          totalInstances += instances.length;
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
                error: error instanceof Error ? error.message : "Unknown error"
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
    scanCurrentPage() {
      this.errors = [];
      const components = [];
      const currentPage = figma.currentPage;
      let totalInstances = 0;
      const pageComponents = currentPage.findAll(
        (node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET"
      );
      const instances = currentPage.findAll((node) => node.type === "INSTANCE");
      totalInstances += instances.length;
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
            error: error instanceof Error ? error.message : "Unknown error"
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
    extractComponentProperties(node, pageName) {
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET" && node.type !== "INSTANCE") {
        return null;
      }
      const properties = {
        id: node.id,
        name: node.name,
        type: node.type,
        pageName,
        colors: [],
        typography: [],
        spacing: [],
        effects: []
      };
      properties.colors = this.extractColors(node);
      properties.typography = this.extractTypography(node);
      properties.spacing = this.extractSpacing(node);
      properties.effects = this.extractEffects(node);
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        const frame = node;
        if ("layoutMode" in frame && frame.layoutMode) {
          properties.layoutMode = frame.layoutMode;
          properties.itemSpacing = frame.itemSpacing;
          properties.paddingTop = frame.paddingTop;
          properties.paddingRight = frame.paddingRight;
          properties.paddingBottom = frame.paddingBottom;
          properties.paddingLeft = frame.paddingLeft;
        }
        properties.width = frame.width;
        properties.height = frame.height;
      } else if (node.type === "INSTANCE") {
        const instance = node;
        properties.width = instance.width;
        properties.height = instance.height;
      }
      if ("children" in node) {
        const childProperties = [];
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
    extractColors(node) {
      var _a, _b, _c, _d, _e, _f;
      const colors = [];
      if ("fills" in node && Array.isArray(node.fills)) {
        for (const fill of node.fills) {
          if (fill.type === "SOLID") {
            const color = this.rgbaToColor(fill.color, (_a = fill.opacity) != null ? _a : 1);
            colors.push({
              type: "fill",
              color: {
                r: fill.color.r,
                g: fill.color.g,
                b: fill.color.b,
                a: (_b = fill.opacity) != null ? _b : 1
              },
              hex: color.hex,
              rgba: color.rgba,
              opacity: (_c = fill.opacity) != null ? _c : 1
            });
          }
        }
      }
      if ("strokes" in node && Array.isArray(node.strokes)) {
        for (const stroke of node.strokes) {
          if (stroke.type === "SOLID") {
            const color = this.rgbaToColor(stroke.color, (_d = stroke.opacity) != null ? _d : 1);
            colors.push({
              type: "stroke",
              color: {
                r: stroke.color.r,
                g: stroke.color.g,
                b: stroke.color.b,
                a: (_e = stroke.opacity) != null ? _e : 1
              },
              hex: color.hex,
              rgba: color.rgba,
              opacity: (_f = stroke.opacity) != null ? _f : 1
            });
          }
        }
      }
      return colors;
    }
    /**
     * Extract typography properties from text nodes
     */
    extractTypography(node) {
      const typography = [];
      if (node.type === "TEXT") {
        const textNode = node;
        const fontName = textNode.fontName;
        typography.push({
          fontFamily: fontName.family,
          fontSize: typeof textNode.fontSize === "number" ? textNode.fontSize : 16,
          fontWeight: typeof fontName.style === "string" ? this.parseFontWeight(fontName.style) : 400,
          lineHeight: typeof textNode.lineHeight === "number" || typeof textNode.lineHeight === "string" ? textNode.lineHeight : void 0,
          letterSpacing: typeof textNode.letterSpacing === "number" ? textNode.letterSpacing : void 0,
          textDecoration: typeof textNode.textDecoration === "string" ? textNode.textDecoration : void 0,
          textCase: typeof textNode.textCase === "string" ? textNode.textCase : void 0
        });
      }
      if ("children" in node) {
        for (const child of node.children) {
          typography.push(...this.extractTypography(child));
        }
      }
      return typography;
    }
    /**
     * Extract spacing properties
     */
    extractSpacing(node) {
      const spacing = [];
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        const frame = node;
        spacing.push({
          type: "width",
          value: frame.width,
          unit: "px"
        });
        spacing.push({
          type: "height",
          value: frame.height,
          unit: "px"
        });
        if ("paddingTop" in frame && typeof frame.paddingTop === "number") {
          if (frame.paddingTop) {
            spacing.push({
              type: "padding",
              value: frame.paddingTop,
              unit: "px"
            });
          }
          if (frame.paddingRight) {
            spacing.push({
              type: "padding",
              value: frame.paddingRight,
              unit: "px"
            });
          }
          if (frame.paddingBottom) {
            spacing.push({
              type: "padding",
              value: frame.paddingBottom,
              unit: "px"
            });
          }
          if (frame.paddingLeft) {
            spacing.push({
              type: "padding",
              value: frame.paddingLeft,
              unit: "px"
            });
          }
        }
        if ("itemSpacing" in frame && typeof frame.itemSpacing === "number" && frame.itemSpacing) {
          spacing.push({
            type: "gap",
            value: frame.itemSpacing,
            unit: "px"
          });
        }
      } else if (node.type === "INSTANCE") {
        const instance = node;
        spacing.push({
          type: "width",
          value: instance.width,
          unit: "px"
        });
        spacing.push({
          type: "height",
          value: instance.height,
          unit: "px"
        });
      }
      return spacing;
    }
    /**
     * Extract effect properties (shadows, blurs)
     */
    extractEffects(node) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const effects = [];
      if ("effects" in node && Array.isArray(node.effects)) {
        for (const effect of node.effects) {
          if (effect.visible) {
            switch (effect.type) {
              case "DROP_SHADOW":
                effects.push({
                  type: "drop-shadow",
                  visible: effect.visible,
                  radius: effect.radius,
                  color: effect.color ? {
                    r: effect.color.r,
                    g: effect.color.g,
                    b: effect.color.b,
                    a: effect.color.a
                  } : void 0,
                  offset: {
                    x: (_b = (_a = effect.offset) == null ? void 0 : _a.x) != null ? _b : 0,
                    y: (_d = (_c = effect.offset) == null ? void 0 : _c.y) != null ? _d : 0
                  },
                  spread: effect.spread
                });
                break;
              case "INNER_SHADOW":
                effects.push({
                  type: "inner-shadow",
                  visible: effect.visible,
                  radius: effect.radius,
                  color: effect.color ? {
                    r: effect.color.r,
                    g: effect.color.g,
                    b: effect.color.b,
                    a: effect.color.a
                  } : void 0,
                  offset: {
                    x: (_f = (_e = effect.offset) == null ? void 0 : _e.x) != null ? _f : 0,
                    y: (_h = (_g = effect.offset) == null ? void 0 : _g.y) != null ? _h : 0
                  },
                  spread: effect.spread
                });
                break;
              case "LAYER_BLUR":
                effects.push({
                  type: "layer-blur",
                  visible: effect.visible,
                  radius: effect.radius
                });
                break;
              case "BACKGROUND_BLUR":
                effects.push({
                  type: "background-blur",
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
    rgbaToColor(color, opacity) {
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = opacity;
      const hex = `#${[r, g, b].map((x) => {
        const hex2 = x.toString(16);
        return hex2.length === 1 ? "0" + hex2 : hex2;
      }).join("")}`;
      const rgba = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
      return { hex, rgba };
    }
    /**
     * Parse font weight from font style name
     */
    parseFontWeight(style) {
      const weightMap = {
        "thin": 100,
        "extralight": 200,
        "light": 300,
        "regular": 400,
        "medium": 500,
        "semibold": 600,
        "bold": 700,
        "extrabold": 800,
        "black": 900
      };
      const lowerStyle = style.toLowerCase();
      for (const [key, value] of Object.entries(weightMap)) {
        if (lowerStyle.includes(key)) {
          return value;
        }
      }
      const match = style.match(/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return 400;
    }
    /**
     * Get component usage statistics
     */
    getComponentUsageStats(componentId) {
      const instances = [];
      const pages = /* @__PURE__ */ new Set();
      for (const page of figma.root.children) {
        if (page.type === "PAGE") {
          const pageInstances = page.findAll(
            (node) => {
              var _a;
              return node.type === "INSTANCE" && ((_a = node.mainComponent) == null ? void 0 : _a.id) === componentId;
            }
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
  };

  // code.ts
  figma.showUI(__html__, { width: 400, height: 600 });
  var isDarkMode = true;
  figma.ui.postMessage({ type: "theme", theme: isDarkMode ? "dark" : "light" });
  var githubService = new GitHubTokenService();
  var figmaComponentService = new FigmaComponentService();
  var fetchedTokens = null;
  async function loadConfig() {
    try {
      const config = await figma.clientStorage.getAsync("repoConfig");
      return config || null;
    } catch (error) {
      console.error("Error loading config:", error);
      return null;
    }
  }
  async function saveConfig(config) {
    try {
      await figma.clientStorage.setAsync("repoConfig", config);
    } catch (error) {
      console.error("Error saving config:", error);
    }
  }
  figma.ui.onmessage = async (msg) => {
    var _a;
    if (msg.type === "load-config") {
      const config = await loadConfig();
      figma.ui.postMessage({
        type: "config-loaded",
        config
      });
    }
    if (msg.type === "test-connection") {
      console.log("[Code] Received test-connection message");
      const { repoUrl, token } = msg;
      if (!repoUrl || !token) {
        console.log("[Code] Missing repoUrl or token");
        figma.ui.postMessage({
          type: "connection-result",
          success: false,
          error: "Repository URL and token are required"
        });
        return;
      }
      const parsed = githubService.parseGitHubUrl(repoUrl);
      if (!parsed) {
        console.log("[Code] Invalid GitHub URL format");
        figma.ui.postMessage({
          type: "connection-result",
          success: false,
          error: "Invalid GitHub URL format. Expected: https://github.com/owner/repo"
        });
        return;
      }
      console.log(`[Code] Testing connection to ${parsed.owner}/${parsed.repo}`);
      try {
        const branches = await githubService.fetchBranches(parsed.owner, parsed.repo, token);
        console.log(`[Code] Successfully fetched ${branches.length} branches`);
        figma.ui.postMessage({
          type: "connection-result",
          success: true,
          branches,
          owner: parsed.owner,
          repo: parsed.repo
        });
        console.log("[Code] Sent connection-result success message");
      } catch (error) {
        console.error("[Code] Error fetching branches:", error);
        figma.ui.postMessage({
          type: "connection-result",
          success: false,
          error: error instanceof Error ? error.message : "Connection failed. Please check your internet connection and token permissions."
        });
        console.log("[Code] Sent connection-result error message");
      }
    }
    if (msg.type === "save-config") {
      const config = {
        repoUrl: msg.repoUrl,
        token: msg.token,
        branch: msg.branch,
        filePath: msg.filePath
      };
      await saveConfig(config);
      figma.ui.postMessage({
        type: "config-saved",
        success: true
      });
    }
    if (msg.type === "fetch-tokens") {
      const { repoUrl, token, branch, filePath } = msg;
      const parsed = githubService.parseGitHubUrl(repoUrl);
      if (!parsed) {
        figma.ui.postMessage({
          type: "tokens-result",
          success: false,
          error: "Invalid GitHub URL format"
        });
        return;
      }
      try {
        figma.ui.postMessage({
          type: "fetch-progress",
          message: "Starting token fetch..."
        });
        let parsedTokens;
        try {
          if (!filePath || filePath.trim() === "") {
            figma.ui.postMessage({
              type: "fetch-progress",
              message: "Scanning repository (including subfolders) for JSON token files..."
            });
            parsedTokens = await githubService.fetchTokensFromDirectory(
              parsed.owner,
              parsed.repo,
              branch,
              token,
              "",
              (message) => {
                figma.ui.postMessage({
                  type: "fetch-progress",
                  message
                });
              }
            );
          } else {
            try {
              figma.ui.postMessage({
                type: "fetch-progress",
                message: `Fetching ${filePath}...`
              });
              parsedTokens = await githubService.fetchTokens(
                parsed.owner,
                parsed.repo,
                branch,
                token,
                filePath
              );
            } catch (fileError) {
              try {
                figma.ui.postMessage({
                  type: "fetch-progress",
                  message: `Scanning directory ${filePath} (including subfolders)...`
                });
                const contents = await githubService.fetchDirectoryContents(
                  parsed.owner,
                  parsed.repo,
                  branch,
                  token,
                  filePath
                );
                if (Array.isArray(contents)) {
                  parsedTokens = await githubService.fetchTokensFromDirectory(
                    parsed.owner,
                    parsed.repo,
                    branch,
                    token,
                    filePath,
                    (message) => {
                      figma.ui.postMessage({
                        type: "fetch-progress",
                        message
                      });
                    }
                  );
                } else {
                  throw new Error(`Path "${filePath}" is not a valid file or directory`);
                }
              } catch (dirError) {
                throw new Error(`Path "${filePath}" is neither a valid file nor directory. File error: ${fileError instanceof Error ? fileError.message : "Unknown"}`);
              }
            }
          }
          figma.ui.postMessage({
            type: "fetch-progress",
            message: "Parsing tokens..."
          });
          fetchedTokens = parsedTokens;
          figma.ui.postMessage({
            type: "tokens-result",
            success: true,
            tokens: parsedTokens.tokens,
            metadata: parsedTokens.metadata,
            errors: ((_a = parsedTokens.metadata) == null ? void 0 : _a.errors) || []
          });
        } catch (innerError) {
          throw innerError;
        }
      } catch (error) {
        console.error("Token fetch error:", error);
        figma.ui.postMessage({
          type: "tokens-result",
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch tokens. The repository may be too large or have too many files."
        });
      }
    }
    if (msg.type === "detect-token-files") {
      const { repoUrl, token, branch, directoryPath } = msg;
      const parsed = githubService.parseGitHubUrl(repoUrl);
      if (!parsed) {
        figma.ui.postMessage({
          type: "token-files-result",
          success: false,
          error: "Invalid GitHub URL format"
        });
        return;
      }
      try {
        const tokenFiles = await githubService.detectTokenFiles(
          parsed.owner,
          parsed.repo,
          branch,
          token,
          directoryPath || ""
        );
        figma.ui.postMessage({
          type: "token-files-result",
          success: true,
          files: tokenFiles
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "token-files-result",
          success: false,
          error: error instanceof Error ? error.message : "Failed to detect token files"
        });
      }
    }
    if (msg.type === "scan-components") {
      try {
        const scanAll = msg.scanAll === true;
        figma.ui.postMessage({
          type: "scan-progress",
          message: scanAll ? "Scanning all pages..." : "Scanning current page..."
        });
        const result = scanAll ? figmaComponentService.scanAllComponents() : figmaComponentService.scanCurrentPage();
        figma.ui.postMessage({
          type: "scan-result",
          success: true,
          result
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "scan-result",
          success: false,
          error: error instanceof Error ? error.message : "Failed to scan components"
        });
      }
    }
    if (msg.type === "get-component-usage") {
      try {
        const { componentId } = msg;
        const stats = figmaComponentService.getComponentUsageStats(componentId);
        figma.ui.postMessage({
          type: "component-usage-result",
          success: true,
          stats
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "component-usage-result",
          success: false,
          error: error instanceof Error ? error.message : "Failed to get usage stats"
        });
      }
    }
    if (msg.type === "scan-token") {
      try {
        const { tokenName } = msg;
        if (!fetchedTokens) {
          figma.ui.postMessage({
            type: "scan-token-result",
            success: false,
            error: "No tokens fetched. Please fetch tokens first from settings."
          });
          return;
        }
        const tokenPath = tokenName.split(".");
        let foundToken = null;
        for (const token of fetchedTokens.tokens) {
          const tokenPathStr = token.path.join(".").toLowerCase();
          const searchPathStr = tokenPath.join(".").toLowerCase();
          if (tokenPathStr === searchPathStr || token.name.toLowerCase() === tokenName.toLowerCase()) {
            foundToken = token;
            break;
          }
        }
        if (!foundToken) {
          figma.ui.postMessage({
            type: "scan-token-result",
            success: true,
            tokenFound: false,
            tokenName
          });
          return;
        }
        figma.ui.postMessage({
          type: "scan-progress",
          message: "Scanning components for token usage..."
        });
        const pages = figma.root.children;
        const matchingComponents = [];
        for (const page of pages) {
          if (page.type === "PAGE") {
            const components = page.findAll((node) => node.type === "COMPONENT");
            for (const component of components) {
              try {
                const props = figmaComponentService.extractComponentProperties(component, page.name);
                if (props) {
                  const tokenValue = foundToken.value;
                  let matches = false;
                  const matchedProperties = [];
                  if (props.colors) {
                    for (const color of props.colors) {
                      if (matchesTokenValue(color.hex, tokenValue) || matchesTokenValue(color.rgba, tokenValue)) {
                        matches = true;
                        matchedProperties.push(`color: ${color.type} (${color.hex})`);
                      }
                    }
                  }
                  if (props.typography) {
                    for (const typo of props.typography) {
                      if (matchesTokenValue(typo.fontSize, tokenValue) || matchesTokenValue(typo.fontFamily, tokenValue) || matchesTokenValue(typo.fontWeight, tokenValue)) {
                        matches = true;
                        matchedProperties.push(`typography: ${typo.fontFamily} ${typo.fontSize}px`);
                      }
                    }
                  }
                  if (props.spacing) {
                    for (const spacing of props.spacing) {
                      if (matchesTokenValue(spacing.value, tokenValue)) {
                        matches = true;
                        matchedProperties.push(`spacing: ${spacing.type} (${spacing.value}px)`);
                      }
                    }
                  }
                  if (props.effects) {
                    for (const effect of props.effects) {
                      if (matchesTokenValue(effect.radius, tokenValue)) {
                        matches = true;
                        matchedProperties.push(`effect: ${effect.type} (${effect.radius}px)`);
                      }
                    }
                  }
                  if (matches) {
                    matchingComponents.push({
                      id: component.id,
                      name: component.name,
                      page: page.name,
                      matchedProperties
                    });
                  }
                }
              } catch (error) {
                console.error(`Error extracting properties from ${component.name}:`, error);
              }
            }
          }
        }
        figma.ui.postMessage({
          type: "scan-token-result",
          success: true,
          tokenFound: true,
          tokenName,
          tokenValue: foundToken.value,
          matchingComponents
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "scan-token-result",
          success: false,
          error: error instanceof Error ? error.message : "Failed to scan for token"
        });
      }
    }
    if (msg.type === "navigate-to-component") {
      try {
        const { componentId } = msg;
        const node = figma.getNodeById(componentId);
        if (node && "type" in node && (node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "INSTANCE")) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
          figma.notify(`Navigated to component: ${node.name}`);
        } else {
          figma.notify("Component not found");
        }
      } catch (error) {
        figma.notify(`Error navigating to component: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    if (msg.type === "cancel") {
      figma.closePlugin();
    }
  };
  function matchesTokenValue(componentValue, tokenValue) {
    const compStr = String(componentValue).toLowerCase().trim();
    const tokenStr = String(tokenValue).toLowerCase().trim();
    if (compStr === tokenStr) {
      return true;
    }
    if (typeof componentValue === "string" && typeof tokenValue === "string") {
      const compHex = compStr.replace("#", "");
      const tokenHex = tokenStr.replace("#", "");
      if (compHex === tokenHex) {
        return true;
      }
      const rgbMatch = /rgba?\(([^)]+)\)/;
      const compRgb = compStr.match(rgbMatch);
      const tokenRgb = tokenStr.match(rgbMatch);
      if (compRgb && tokenRgb && compRgb[1] === tokenRgb[1]) {
        return true;
      }
    }
    if (typeof componentValue === "number" && typeof tokenValue === "number") {
      return Math.abs(componentValue - tokenValue) < 0.01;
    }
    return false;
  }
})();
