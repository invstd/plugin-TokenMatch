# TokenMatch Documentation

Welcome to the TokenMatch plugin documentation.

## 📘 What is TokenMatch?

TokenMatch is a Figma plugin that helps you discover which components in your Figma file are using specific design tokens from your GitHub repository. It bridges the gap between your token system and your Figma components.

## 🚀 Quick Start

### For Users

1. **Install the plugin** in Figma
2. **Configure GitHub connection** in Settings
   - Add your repository URL
   - Provide a GitHub Personal Access Token
   - Select your branch
3. **Search for a token** and select it
4. **Choose scan scope** (All pages, Current page, or Selection)
5. **Click "Match"** to find components using that token

### For Developers

See the [Development Guide](./DEVELOPMENT.md) for:
- Project structure
- Build instructions
- Architecture overview
- Contributing guidelines

## 📚 Documentation

### Getting Started
- **[README.md](./README.md)** - This file, general overview

### Core Features
- **[TOKEN-FETCHING.md](./TOKEN-FETCHING.md)** - How to connect to GitHub and fetch design tokens
- **[TOKEN-MATCHING.md](./TOKEN-MATCHING.md)** - How token matching works, confidence scoring, and strategies
- **[COMPONENT-PASTING.md](./COMPONENT-PASTING.md)** - How to paste matching components to the canvas

### Technical Reference
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development and architecture guide
- **[API.md](./API.md)** - Technical API documentation

### Creating New Figma Plugins
- **[FIGMA-PLUGIN-QUICK-START.md](./FIGMA-PLUGIN-QUICK-START.md)** - 5-minute quick start template for new plugins ⚡
- **[FIGMA-PLUGIN-INFRASTRUCTURE-SETUP.md](./FIGMA-PLUGIN-INFRASTRUCTURE-SETUP.md)** - Complete infrastructure setup guide with detailed explanations 📘

## 🔑 Key Features

- ✅ Search through design tokens from your GitHub repository
- ✅ Match tokens to component properties (colors, spacing, typography, effects)
- ✅ Filter results by direct matches (excluding nested components)
- ✅ View and navigate to matching components in Figma
- ✅ Paste matching components to canvas
- ✅ Optimized for large files with persistent caching

## 🎯 Use Cases

- **Token Adoption Tracking** - See which components use specific tokens
- **Impact Analysis** - Understand what will change when you update a token
- **Design System Audits** - Verify token usage across your design file
- **Component Discovery** - Find all variants using a particular token value

## 🛠️ Technical Stack

- **Runtime**: Figma Plugin API
- **UI**: Preact + TypeScript
- **Styling**: Tailwind CSS v4
- **Build**: @create-figma-plugin/build
- **Token Integration**: Tokens Studio for Figma format

## 📖 How It Works

1. **Token Fetching**: Connects to your GitHub repository and parses token files (JSON, JS, TS)
2. **Component Scanning**: Scans Figma components and extracts properties with Tokens Studio plugin data
3. **Matching**: Uses priority-based matching:
   - Token reference matching (highest confidence)
   - Semantic token resolution
   - Value-based matching (fallback)
4. **Deduplication**: Filters out parent components that only match via nested children
5. **Results**: Displays grouped results with component variants

## 🔒 Privacy & Security

- All processing happens locally in Figma
- GitHub token stored securely in Figma's client storage
- No data sent to external servers (except GitHub API)
- Network access restricted to `api.github.com` only

## 📦 Project Structure

```
/Users/mschultz/FigmaTokensChecker/v1/
├── documentation/        # This folder
├── src/                 # Source code
│   ├── ui.tsx          # UI components
│   ├── main.ts         # Plugin logic
│   └── input.css       # Tailwind input
├── services/           # Core business logic
│   ├── figma-component-service-optimized.ts
│   ├── github-token-service.ts
│   ├── token-matching-service.ts
│   └── token-parser.ts
├── types/             # TypeScript types
├── build/             # Compiled output
└── roadmap/           # Feature roadmap
```
## 🐛 Troubleshooting

### Plugin won't connect to GitHub
- Verify your repository URL is correct
- Check that your GitHub token has `repo` access
- Ensure you have access to the repository

### No matches found
- Verify components have Tokens Studio plugin data applied
- Check that you're scanning the correct pages
- Try "All pages" mode instead of "Current page"

### Slow performance
- Use "Current page" for faster iterations
- Enable persistent caching (default)
- Consider scanning specific pages only

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/invstd/plugin-tokenmatcher/issues)
- **Documentation**: This folder
- **Email**: [Your support email]

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Made with ❤️ for design systems teams**
