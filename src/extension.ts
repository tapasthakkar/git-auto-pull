import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execPromise = promisify(exec);
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

// Cache for git repository status (path -> isGitRepo)
const gitRepoCache = new Map<string, boolean>();
// Track if a pull is in progress
let isPullInProgress = false;
// Cancellation token source for cancelling operations
let cancellationTokenSource: vscode.CancellationTokenSource;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Git Auto Pull");

  // Always show the output panel
  outputChannel.show();

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "git-auto-pull.cancelOperation";
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("git-auto-pull.cancelOperation", () => {
      if (isPullInProgress && cancellationTokenSource) {
        cancellationTokenSource.cancel();
        updateStatusBar("$(sync-ignored) Git Pull Cancelled", "");
        setTimeout(() => {
          hideStatusBar();
        }, 3000);
      }
    })
  );

  const config = vscode.workspace.getConfiguration("gitAutoPull");
  if (config.get<boolean>("enabled")) {
    // Initial check when extension activates
    handleGitFetchAndPull();

    // Setup continuous pull if enabled
    setupContinuousPull(context);
  }
}

function setupContinuousPull(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("gitAutoPull");
  if (config.get<boolean>("continuousPull.enabled")) {
    const interval = config.get<number>("continuousPull.interval") || 60000;
    const intervalId = setInterval(() => {
      handleGitFetchAndPull();
    }, interval);

    // Clear interval when extension is deactivated
    context.subscriptions.push({
      dispose: () => clearInterval(intervalId),
    });
  }
}

/**
 * Checks if a directory is a git repository
 * Uses caching to improve performance
 */
async function isGitRepository(folderPath: string): Promise<boolean> {
  // Check cache first
  if (gitRepoCache.has(folderPath)) {
    return gitRepoCache.get(folderPath)!;
  }

  try {
    const gitDir = path.join(folderPath, ".git");
    const isRepo = fs.existsSync(gitDir);
    // Cache the result
    gitRepoCache.set(folderPath, isRepo);
    return isRepo;
  } catch (error) {
    gitRepoCache.set(folderPath, false);
    return false;
  }
}

/**
 * Gets immediate subfolders of the given folder path (one level deep only)
 * Does NOT recursively traverse directories
 */
async function getSubfolders(folderPath: string): Promise<string[]> {
  try {
    // Get only immediate subfolders (no recursion)
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(folderPath, entry.name));
  } catch (error) {
    outputChannel.appendLine(
      `Error reading immediate subfolders in ${folderPath}: ${error}`
    );
    return [];
  }
}

function updateStatusBar(text: string, tooltip: string) {
  statusBarItem.text = text;
  statusBarItem.tooltip = tooltip;
  statusBarItem.show();
}

function hideStatusBar() {
  statusBarItem.hide();
}

async function handleGitFetchAndPull() {
  // If already in progress, don't start a new operation
  if (isPullInProgress) {
    outputChannel.appendLine(
      "Git pull operation already in progress, skipping..."
    );
    return;
  }

  isPullInProgress = true;

  // Create cancellation token source
  cancellationTokenSource = new vscode.CancellationTokenSource();

  try {
    updateStatusBar("$(sync~spin) Git Pull in Progress", "Click to cancel");
    outputChannel.appendLine("Checking for Git updates...");

    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      outputChannel.appendLine("No workspace folders found.");
      isPullInProgress = false;
      hideStatusBar();
      return;
    }

    let reposFound = 0;
    let reposUpdated = 0;

    // Process workspace folders (find repositories)
    const repositories: { path: string; name: string }[] = [];

    for (const folder of workspaceFolders) {
      // Check for cancellation
      if (cancellationTokenSource.token.isCancellationRequested) {
        outputChannel.appendLine("Operation cancelled.");
        break;
      }

      // Check if the parent folder is a git repository
      if (await isGitRepository(folder.uri.fsPath)) {
        repositories.push({ path: folder.uri.fsPath, name: folder.name });
      } else {
        // If parent is not a git repository, check ONLY immediate subfolders (one level deep)
        outputChannel.appendLine(
          `${folder.name} is not a git repository. Checking immediate subfolders (one level deep)...`
        );
        const subfolders = await getSubfolders(folder.uri.fsPath);

        outputChannel.appendLine(
          `Found ${subfolders.length} immediate subfolders to check.`
        );

        // Check which subfolders are git repositories (in parallel)
        const repoChecks = await Promise.all(
          subfolders.map(async (subfolder) => {
            const isRepo = await isGitRepository(subfolder);
            return {
              path: subfolder,
              name: path.basename(subfolder),
              isRepo,
            };
          })
        );

        // Add git repositories to the list
        for (const check of repoChecks) {
          if (check.isRepo) {
            repositories.push({ path: check.path, name: check.name });
          }
        }

        outputChannel.appendLine(
          `Found ${repositories.length} git repository in ${folder.name}`
        );
      }
    }

    reposFound = repositories.length;
    updateStatusBar(
      `$(sync~spin) Processing ${reposFound} Git repositories`,
      "Click to cancel"
    );

    // Process all repositories in parallel
    if (repositories.length > 0) {
      const results = await Promise.allSettled(
        repositories.map((repo) =>
          processGitRepository(
            repo.path,
            repo.name,
            cancellationTokenSource.token
          )
        )
      );

      // Count updated repositories
      reposUpdated = results.filter(
        (result) => result.status === "fulfilled" && result.value === true
      ).length;
    }

    // Update status bar with results
    if (cancellationTokenSource.token.isCancellationRequested) {
      updateStatusBar("$(sync-ignored) Git Pull Cancelled", "");
    } else if (reposUpdated > 0) {
      updateStatusBar(
        `$(check) Updated ${reposUpdated} of ${reposFound} repositories`,
        "Git pull completed"
      );
    } else if (reposFound > 0) {
      updateStatusBar(
        `$(info) All ${reposFound} repositories up to date`,
        "No updates needed"
      );
    } else {
      updateStatusBar("$(info) No Git repositories found", "");
    }

    // Hide status bar after a delay
    setTimeout(() => {
      hideStatusBar();
    }, 5000);
  } catch (error) {
    outputChannel.appendLine(`Error in git pull operation: ${error}`);
    updateStatusBar(
      "$(error) Git Pull Error",
      error instanceof Error ? error.message : "Unknown error"
    );

    // Hide status bar after a delay
    setTimeout(() => {
      hideStatusBar();
    }, 5000);
  } finally {
    isPullInProgress = false;

    // Dispose cancellation token source
    if (cancellationTokenSource) {
      cancellationTokenSource.dispose();
    }
  }
}

/**
 * Processes a git repository (fetch and pull)
 * Returns true if changes were pulled, false otherwise
 */
async function processGitRepository(
  repoPath: string,
  repoName: string,
  cancellationToken?: vscode.CancellationToken
): Promise<boolean> {
  try {
    // Check for cancellation
    if (cancellationToken?.isCancellationRequested) {
      return false;
    }

    await execPromise(`git -C ${repoPath} fetch`);

    // Check for cancellation after fetch
    if (cancellationToken?.isCancellationRequested) {
      return false;
    }

    const currentBranch = await getCurrentBranch(repoPath);
    if (!currentBranch) {
      outputChannel.appendLine(`No current branch found for ${repoName}.`);
      return false;
    }

    const { stdout } = await execPromise(
      `git -C ${repoPath} rev-list HEAD...origin/${currentBranch} --count`
    );

    const newCommitsCount = parseInt(stdout.trim(), 10);

    // Check for cancellation before pull
    if (cancellationToken?.isCancellationRequested) {
      return false;
    }

    if (newCommitsCount > 0) {
      outputChannel.appendLine(
        `New commits found in ${repoName} (${currentBranch}): ${newCommitsCount}`
      );
      const { stdout: pullStdout, stderr: pullStderr } = await execPromise(
        `git -C ${repoPath} pull`
      );
      outputChannel.appendLine(
        `Pulled latest changes in ${repoName} (${currentBranch}): ${pullStdout}`
      );
      if (pullStderr) {
        outputChannel.appendLine(
          `Pull stderr in ${repoName} (${currentBranch}): ${pullStderr}`
        );
      }
      return true;
    } else {
      outputChannel.appendLine(
        `No new commits in ${repoName} (${currentBranch}).`
      );
      return false;
    }
  } catch (error) {
    if (error instanceof Error) {
      outputChannel.appendLine(
        `Error processing ${repoName}: ${error.message}`
      );
    } else {
      outputChannel.appendLine(
        `Unknown error occurred while processing ${repoName}`
      );
    }
    return false;
  }
}

async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execPromise(
      `git -C ${repoPath} rev-parse --abbrev-ref HEAD`
    );
    return stdout.trim();
  } catch (error) {
    if (error instanceof Error) {
      outputChannel.appendLine(
        `Error getting current branch: ${error.message}`
      );
    } else {
      outputChannel.appendLine(
        `Unknown error occurred while getting current branch`
      );
    }
    return null;
  }
}

export function deactivate() {
  // Clear any resources
  if (statusBarItem) {
    statusBarItem.dispose();
  }

  if (cancellationTokenSource) {
    cancellationTokenSource.dispose();
  }
}
