# TokenMatch - Figma Plugin

A Figma plugin that connects to GitHub repositories to fetch and check design tokens. Match tokens in components.

## Features

- **GitHub Integration**: Connect to any GitHub repository using a personal access token
- **Branch Selection**: Browse and select from available branches
- **Token Fetching**: Fetch design token files from your repository (supports recursive directory scanning)
- **Token Parsing**: Supports W3C Design Tokens format with alias resolution
- **Component Scanning**: Scan all components in your Figma document
- **Token Matching**: Find which components use specific design tokens
- **Component Navigation**: Click to navigate to matching components in Figma
- **Configuration Persistence**: Save your repository settings for quick access
- **Dark/Light Theme**: Automatic theme detection with manual toggle option

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the plugin:
   ```bash
   npm run build
   ```

3. In Figma Desktop:
   - Go to Plugins → Development → Import plugin from manifest
   - Select the `manifest.json` file from this folder

## Development

To watch for changes while developing:
```bash
npm run watch
```

## Usage

1. **Get a GitHub Personal Access Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate a new token with `repo` scope
   - Copy the token (starts with `ghp_`)

2. **Configure GitHub Settings**:
   - Open the plugin from the Plugins menu
   - Click the "Settings" button (gear icon)
   - Enter your repository URL (e.g., `https://github.com/owner/repo`)
   - Enter your personal access token
   - Click "Test Connection" to verify access and load branches
   - Select a branch from the dropdown
   - Optionally enter a file/directory path (leave empty to fetch all token files)
   - Click "Save Configuration"

3. **Fetch Tokens**:
   - Click "Fetch Tokens" on the main view
   - Wait for tokens to be fetched and parsed

4. **Scan for Token Usage**:
   - Enter a token name (e.g., `color.primary.500`)
   - Click "Scan"
   - View matching components and click to navigate to them

## Supported File Formats

The plugin can fetch:
- JSON files (W3C Design Tokens format)
- JSONC/JSON5 files (JSON with comments)
- Recursive directory scanning for multiple token files
- Automatic token parsing with alias resolution

## Repository URL Formats

The plugin supports various GitHub URL formats:
- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `git@github.com:owner/repo.git`

## Security Notes

- Your personal access token is stored locally in Figma's client storage
- Tokens are never transmitted except to GitHub's API
- Use tokens with minimal required permissions (`repo` scope for private repos)

## Troubleshooting

- **Connection fails**: Verify your token has the correct permissions and the repository URL is correct
- **No branches found**: Ensure your token has access to the repository
- **File not found**: Check that the file path is correct relative to the repository root
- **Build errors**: Run `npm install` to ensure all dependencies are installed
- **Token parsing errors**: Ensure your token files follow W3C Design Tokens format

## License

MIT
