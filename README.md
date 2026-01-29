# TokenMatch

**Find which Figma components use your design tokens**

TokenMatch is a Figma plugin that bridges the gap between your design token repository and your Figma components. It helps you discover which components in your Figma file are using specific design tokens, making it easier to maintain consistency and track token usage across your design system.

## 🎯 What It Does

TokenMatch scans your Figma file and matches component properties (colors, spacing, typography, effects) against your design tokens stored in GitHub. This helps you:

- **Find token usage**: Discover which components use a specific token
- **Maintain consistency**: Ensure your components align with your token system
- **Track dependencies**: Understand which components will be affected by token changes
- **Validate implementations**: Verify that tokens are being used correctly

## ✨ Features

### 🔍 Token Matching
- Search through all your design tokens from your GitHub repository
- Match tokens to component properties (colors, spacing, typography, shadows, etc.)
- Filter results by direct matches (excluding nested component references)
- View all variants that use a specific token

### 📊 Smart Scanning
- **All pages**: Comprehensive scan of your entire Figma file
- **Current page**: Faster scan of just the active page
- **Selection only**: Quick scan of selected components
- Page filtering for targeted scanning

### 🎨 Visual Results
- See exactly which components use a token
- View token values with color previews for color tokens
- Display spacing values with clear labels (Padding, Gap, Radius, etc.)
- Navigate directly to components in your Figma file
- Paste matching components to canvas for quick comparison

### ⚡ Performance Optimized
- Efficient component scanning with progress tracking
- Intelligent caching for faster subsequent scans
- Handles large files with thousands of components

### 🔄 GitHub Integration
- Connect to any GitHub repository (public or private)
- Support for custom directory paths
- Branch selection for different token versions
- Automatic token parsing (supports JSON, JS, TS formats)

## 🚀 Getting Started

### 1. Configure GitHub Connection

1. Open the plugin settings (gear icon)
2. Enter your GitHub repository URL: `https://github.com/owner/repo`
3. Add your [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` access
4. (Optional) Specify a directory path if tokens are in a subfolder
5. Click "Test Connection & Scan Files"

### 2. Select a Branch

After connection is successful:
- Choose the branch containing your tokens
- The plugin will automatically fetch and parse tokens
- Token count will be displayed next to the branch name

### 3. Find Components Using Tokens

1. Use the search to find a specific token
2. Select the token from the dropdown
3. Choose your scan scope (all pages, current page, or selection)
4. Click "Match" to find components

### 4. Review Results

- Browse matching components with visual previews
- Click "View" to navigate to a component in Figma
- Click "Paste to canvas" to create instances of all matching components
- Results show which properties match and their values

## 🔑 GitHub Token Setup

To connect your repository, you'll need a GitHub Personal Access Token:

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "TokenMatch Plugin")
4. Select the `repo` scope (for private repos) or `public_repo` (for public repos only)
5. Click "Generate token"
6. Copy the token and paste it in the plugin settings

**Note**: Keep your token secure. The plugin stores it locally in Figma's client storage.

## 📁 Supported Token Formats

TokenMatch automatically parses tokens from:
- JSON files (`.json`)
- JavaScript files (`.js`)
- TypeScript files (`.ts`)

The plugin supports common token structures including:
- Flat token objects
- Nested token groups
- Design token standard formats
- Tokens Studio for Figma format

## 🎨 Supported Property Types

TokenMatch can match tokens for:
- **Colors**: Fill colors, stroke colors, backgrounds
- **Spacing**: Padding, gaps, margins, widths, heights
- **Border radius**: Corner radius values
- **Typography**: Font sizes, weights, line heights
- **Effects**: Shadows, blurs

## 💡 Tips

### Finding Specific Tokens
- Use the search to filter tokens by name or value
- Press Enter to quickly select the first result
- The plugin remembers your last selected token

### Efficient Scanning
- Use "Current page" mode for faster iterations during design work
- Use "Selection only" to check specific components quickly
- Use "All pages" with page filters for comprehensive but targeted scans

### Working with Results
- Results group components by their main component name
- Variants are shown separately when they use the same token
- Click "Paste to canvas" to see all matching variants at once

## 🔧 Technical Details

### Version
Current version: **1.0.0**

### Requirements
- Figma desktop app or browser version
- GitHub repository with design tokens
- GitHub Personal Access Token

### Performance
- Optimized for files with thousands of components
- Caches token data to reduce API calls
- Progress tracking for long-running operations

## 📝 Changelog

### 1.0.0 (Current)
- Initial release
- GitHub integration with token fetching
- Component scanning and matching
- Smart deduplication of nested components
- Variant preservation in results
- Visual token previews
- Paste to canvas functionality
- Configurable scan modes
- Performance optimizations

## 🐛 Troubleshooting

### "No tokens parsed"
- Check that your repository contains valid token files
- Verify the directory path is correct
- Ensure tokens are in JSON, JS, or TS format

### "Connection failed"
- Verify your repository URL is correct
- Check that your GitHub token has the right permissions
- Ensure you have access to the repository

### "No matching components found"
- Try scanning all pages instead of just the current page
- Verify the token value exists in your components
- Check that components aren't using hardcoded values

## 📚 Documentation

For comprehensive documentation, see the `/documentation` folder:

- **[Documentation Overview](./documentation/README.md)** - Start here for an overview
- **[Development Guide](./documentation/DEVELOPMENT.md)** - Architecture, setup, and contribution guide
- **[API Documentation](./documentation/API.md)** - Complete API reference for all services

### 🚀 Building Your Own Figma Plugin?

This project includes **reusable infrastructure guides** for creating production-ready Figma plugins:

- **[Quick Start Guide](./FIGMA-PLUGIN-STARTER-GUIDE.md)** - Overview of all available resources
- **[5-Minute Setup](./documentation/FIGMA-PLUGIN-QUICK-START.md)** - Rapid template for experienced developers
- **[Complete Setup Guide](./documentation/FIGMA-PLUGIN-INFRASTRUCTURE-SETUP.md)** - Detailed walkthrough with explanations
- **[Cheat Sheet](./FIGMA-PLUGIN-CHEAT-SHEET.md)** - Quick reference for commands and patterns

These guides cover everything from dependency installation to custom scrollbars, theming, and build configuration.

## 🤝 Contributing

This is an open-source project. Issues and pull requests are welcome!

For development setup, architecture details, and contribution guidelines, see the [Development Guide](./documentation/DEVELOPMENT.md).

## 📄 License

MIT License - feel free to use this plugin in your workflow.

---

**Made with ❤️ for design systems teams**

Need help? Found a bug? [Open an issue on GitHub](https://github.com/invstd/plugin-tokenmatcher/issues)

