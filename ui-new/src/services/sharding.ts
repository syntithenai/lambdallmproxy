/**
 * Sharding Utilities
 * 
 * Splits large content across multiple rows for Google Sheets storage
 * Google Sheets has a max cell size of ~50,000 characters
 */

import type { ShardedRow } from '../types/persistence';

/**
 * Maximum characters per cell (leave buffer for safety)
 */
const SHARD_SIZE = 45000;

/**
 * Check if content needs sharding
 * 
 * @param content - Content to check
 * @param maxChars - Maximum characters per shard (default: 45000)
 * @returns True if content exceeds max chars
 */
export function needsSharding(content: string, maxChars: number = SHARD_SIZE): boolean {
  return content.length > maxChars;
}

/**
 * Split large content across multiple rows
 * 
 * @param record - Record with potentially large content field
 * @param maxChars - Maximum characters per shard (default: 45000)
 * @returns Array of sharded rows (1 row if no sharding needed)
 */
export function shardContent<T extends { id: string; content?: string }>(
  record: T,
  maxChars: number = SHARD_SIZE
): (T & Partial<ShardedRow>)[] {
  const content = record.content || '';
  
  // No sharding needed
  if (content.length <= maxChars) {
    return [record];
  }
  
  // Calculate number of shards
  const shardCount = Math.ceil(content.length / maxChars);
  const rows: (T & Partial<ShardedRow>)[] = [];
  
  console.log(`[Sharding] Splitting record ${record.id} into ${shardCount} shards (${content.length} chars)`);
  
  for (let i = 0; i < shardCount; i++) {
    const start = i * maxChars;
    const end = Math.min(start + maxChars, content.length);
    const contentShard = content.substring(start, end);
    
    if (i === 0) {
      // First row - include all metadata
      rows.push({
        ...record,
        content: contentShard,
        _shardCount: shardCount,
        _shardIndex: 1,
      });
    } else {
      // Continuation rows - only ID and content
      rows.push({
        id: record.id,
        content: contentShard,
        _shardCount: shardCount,
        _shardIndex: i + 1,
      } as T & Partial<ShardedRow>);
    }
  }
  
  return rows;
}

/**
 * Reassemble sharded rows back into complete records
 * 
 * @param rows - Array of potentially sharded rows
 * @returns Array of complete records with reassembled content
 */
export function reassembleShards<T extends { id: string; content?: string }>(
  rows: (T & Partial<ShardedRow>)[]
): T[] {
  const recordMap = new Map<string, T>();
  const shardMap = new Map<string, Map<number, string>>();
  
  // Group rows by ID
  for (const row of rows) {
    const id = row.id;
    const shardIndex = row._shardIndex || 1;
    const shardCount = row._shardCount || 1;
    
    // First shard or unsharded record
    if (shardIndex === 1) {
      const { _shardCount, _shardIndex, ...cleanRecord } = row;
      recordMap.set(id, cleanRecord as T);
      
      // If sharded, initialize shard map
      if (shardCount > 1) {
        const shards = new Map<number, string>();
        shards.set(1, row.content || '');
        shardMap.set(id, shards);
      }
    } else {
      // Continuation shard
      if (!shardMap.has(id)) {
        console.warn(`[Sharding] Found continuation shard ${shardIndex} for ${id} but no first shard - skipping`);
        continue;
      }
      
      const shards = shardMap.get(id)!;
      shards.set(shardIndex, row.content || '');
    }
  }
  
  // Reassemble sharded records
  const records: T[] = [];
  
  for (const [id, record] of recordMap.entries()) {
    if (shardMap.has(id)) {
      const shards = shardMap.get(id)!;
      const shardCount = (record as any)._shardCount || shards.size;
      
      // Check if all shards are present
      const missingShards: number[] = [];
      for (let i = 1; i <= shardCount; i++) {
        if (!shards.has(i)) {
          missingShards.push(i);
        }
      }
      
      if (missingShards.length > 0) {
        console.warn(`[Sharding] Missing shards for ${id}: ${missingShards.join(', ')} - using partial content`);
      }
      
      // Reassemble content in order
      const contentParts: string[] = [];
      for (let i = 1; i <= shardCount; i++) {
        if (shards.has(i)) {
          contentParts.push(shards.get(i)!);
        }
      }
      
      const fullContent = contentParts.join('');
      console.log(`[Sharding] Reassembled ${id}: ${contentParts.length}/${shardCount} shards, ${fullContent.length} chars`);
      
      records.push({
        ...record,
        content: fullContent,
      });
    } else {
      // Unsharded record
      records.push(record);
    }
  }
  
  return records;
}

/**
 * Get statistics about sharding for a set of records
 * 
 * @param records - Records to analyze
 * @returns Sharding statistics
 */
export function getShardingStats<T extends { id: string; content?: string }>(
  records: T[]
): {
  totalRecords: number;
  shardedRecords: number;
  totalRows: number;
  largestContent: number;
  averageContentSize: number;
} {
  let shardedRecords = 0;
  let totalRows = 0;
  let largestContent = 0;
  let totalContentSize = 0;
  
  for (const record of records) {
    const content = record.content || '';
    const contentSize = content.length;
    
    totalContentSize += contentSize;
    largestContent = Math.max(largestContent, contentSize);
    
    if (needsSharding(content)) {
      shardedRecords++;
      const shardCount = Math.ceil(contentSize / SHARD_SIZE);
      totalRows += shardCount;
    } else {
      totalRows++;
    }
  }
  
  return {
    totalRecords: records.length,
    shardedRecords,
    totalRows,
    largestContent,
    averageContentSize: records.length > 0 ? Math.round(totalContentSize / records.length) : 0,
  };
}
