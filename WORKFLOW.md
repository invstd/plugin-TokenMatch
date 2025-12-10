# Development Workflow

## Local Development

1. **Make changes locally** to your code files
2. **Test in Figma**:
   ```bash
   npm run build
   ```
   Then reload the plugin in Figma to test your changes

3. **When ready to push**:
   ```bash
   # Check what changed
   git status
   
   # Review your changes
   git diff
   
   # Stage your changes
   git add .
   
   # Commit with a descriptive message
   git commit -m "Description of your changes"
   
   # Push to GitHub
   git push
   ```

## Quick Commands

```bash
# Build the plugin
npm run build

# Check git status
git status

# See what changed
git diff

# Stage all changes
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push

# Pull latest from GitHub (if working with others)
git pull
```

## Best Practices

- Always run `npm run build` before committing to ensure `code.js` is up to date
- Write clear commit messages describing what changed
- Test in Figma before pushing
- Pull before pushing if others are working on the repo: `git pull` then `git push`


