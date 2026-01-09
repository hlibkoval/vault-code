/**
 * Interface for accessing vault information.
 * Allows components to get vault path without coupling to the full plugin.
 */
export interface IVaultContext {
	getVaultPath(): string;
}
