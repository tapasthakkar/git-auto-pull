# Git Auto Pull Extension for VS Code

![](./git-auto-pull.png)

## Overview

The **Git Auto Pull** extension for Visual Studio Code automatically fetches and pulls the latest changes from your Git repository whenever you open a project or detect changes. This helps streamline your workflow by ensuring you always have the latest code without manual intervention.

## Features

- Automatically performs `git fetch` and `git pull` when a workspace is opened.
- Option to enable or disable automatic pulls.
- Intelligent detection of git repositories:
  - Processes workspace folders that are git repositories
  - If a workspace folder is not a git repository, automatically checks **immediate** subfolders (one level deep only) for git repositories
- Continuous checking for changes at user-defined intervals.
- Parallel processing of multiple git repositories for improved performance.
- Visual status indicators:
  - Progress indicator in the status bar
  - Summary of updated repositories
- Operation control:
  - Ability to cancel running git operations
  - Automatic handling of concurrent operations

## Installation

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/tapasthakkar/git-auto-pull.git
   cd git-auto-pull

   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Build the Extension**:

   ```bash
   npm run compile
   ```

4. **Package the Extension**:

   ```bash
   vsce package
   ```

5. **Install the Extension**:

   ```
   Open Visual Studio Code.

   Go to the Extensions view (Ctrl+Shift+X).

   Click on the three dots in the top right corner and select

   Install from VSIX....

   Choose the generated .vsix file.
   ```

## Configuration

You can customize the extension behavior through VS Code settings. **If the extension doesn't work or provides an error, ensure that none of the parent directories have a space in them.**

Example Configuration:

```json
{
  "gitAutoPull.enabled": true,
  "gitAutoPull.continuousPull.enabled": true,
  "gitAutoPull.continuousPull.interval": 30000 // Check every 30 seconds
}
```

### Settings Explained

- **gitAutoPull.enabled**: Enable or disable the extension.
- **gitAutoPull.continuousPull.enabled**: Enable or disable continuous checking for git changes.
- **gitAutoPull.continuousPull.interval**: Interval in milliseconds between checks for git changes.

## Working with Multiple Git Repositories

The extension can handle workspaces containing multiple git repositories in several ways:

1. **Workspace with multiple git repositories as root folders**: All repositories will be processed automatically.

2. **Parent folder containing git repositories as immediate subfolders**: If you open a parent folder that is not itself a git repository, the extension will automatically scan **one level deep only** for git repositories in immediate subfolders and process them. The extension will **not** check for git repositories in deeper nested folders.

## User Interface

The extension provides visual feedback through the VS Code status bar:

- **During Operation**: A spinner icon with "Git Pull in Progress" message
- **After Completion**:
  - Success message showing the number of repositories updated
  - If no updates were needed, it shows "All repositories up to date"
- **Cancellation**: You can click on the status bar during operation to cancel the current git pull

## Performance Optimization

The extension includes several optimizations for better performance:

- **Parallel Processing**: Multiple repositories are processed simultaneously
- **Repository Caching**: Git repository detection results are cached to avoid redundant checks
- **Operation Control**: Prevents multiple simultaneous update operations from running

## Usage

Once installed, the extension will automatically fetch and pull updates from your Git repositories based on your configuration settings. You can monitor:

1. **Status Bar**: For quick visual feedback on operations
2. **Output Panel**: For detailed logs, open the "Git Auto Pull" output channel from the Output panel

## Commands

The extension provides the following commands:

- **Git Auto Pull: Cancel Git Pull Operation**: Cancels the current git pull operation

## Contributing

Contributions are welcome! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Thanks to the VS Code team for creating such an extensible platform!
