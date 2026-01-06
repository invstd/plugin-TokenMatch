<<<<<<< HEAD
# TokenMatch - Figma Plugin

A Figma plugin that connects to GitHub repositories to fetch and check design tokens.

## Features

- **GitHub Integration**: Connect to any GitHub repository using a personal access token
- **Branch Selection**: Browse and select from available branches
- **Token Fetching**: Fetch design token files from your repository
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

2. **Run the plugin in Figma**:
   - Open the plugin from the Plugins menu
   - Enter your repository URL (e.g., `https://github.com/owner/repo`)
   - Enter your personal access token
   - Click "Test Connection" to verify access and load branches

3. **Configure and Fetch**:
   - Select a branch from the dropdown
   - Enter the path to your tokens file (e.g., `tokens.json` or `tokens/colors.json`)
   - Click "Save Configuration" to persist your settings
   - Click "Fetch Tokens" to retrieve the file contents

## Supported File Formats

The plugin can fetch:
- JSON files (automatically decoded and displayed)
- Directory listings (shows file structure)
- Any text-based token file format

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

## License

MIT
=======
# plugin-tokenmatcher
Figma Plugin to match tokens in components
>>>>>>> ae2352eba92befa361889fa48357ec89f81d58ef
