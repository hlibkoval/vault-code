/**
 * Convert relative Obsidian path to file:// URI.
 * MCP protocol requires file:// URI format for file paths.
 */
export function toFileUri(vaultPath: string, relativePath: string): string {
	if (vaultPath) {
		return `file://${vaultPath}/${relativePath}`;
	}
	return `file://${relativePath}`;
}
