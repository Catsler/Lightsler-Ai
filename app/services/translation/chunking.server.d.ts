export interface ChunkOptions {
  isHtml?: boolean;
  maxChunkSize?: number;
}

export function isLikelyHtml(text: string): boolean;
export function chunkText(text: string, maxChunkSize?: number, options?: ChunkOptions): string[];
