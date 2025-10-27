/**
 * Memory Tracking Utility for AWS Lambda
 * 
 * Tracks memory usage throughout Lambda function execution to help optimize
 * memory allocation and identify memory-intensive operations.
 * 
 * Features:
 * - Real-time memory usage tracking
 * - Memory usage snapshots at key points
 * - Memory statistics calculation
 * - Formatted output for logging and responses
 * - Memory leak detection
 */

/**
 * @typedef {Object} MemorySnapshot
 * @property {number} timestamp - Unix timestamp in milliseconds
 * @property {string} label - Description of when snapshot was taken
 * @property {number} heapUsed - Heap memory used in bytes
 * @property {number} heapTotal - Total heap size in bytes
 * @property {number} external - Memory used by C++ objects bound to JavaScript in bytes
 * @property {number} rss - Resident Set Size - total memory allocated in bytes
 * @property {number} arrayBuffers - Memory allocated for ArrayBuffers and SharedArrayBuffers in bytes
 */

/**
 * @typedef {Object} MemoryStatistics
 * @property {number} startHeapUsed - Initial heap usage in MB
 * @property {number} currentHeapUsed - Current heap usage in MB
 * @property {number} peakHeapUsed - Peak heap usage in MB
 * @property {number} heapUsedDelta - Change in heap usage from start in MB
 * @property {number} currentRss - Current RSS in MB
 * @property {number} peakRss - Peak RSS in MB
 * @property {number} rssDelta - Change in RSS from start in MB
 * @property {number} heapUtilization - Current heap utilization percentage
 * @property {number} peakHeapUtilization - Peak heap utilization percentage
 * @property {string} recommendation - Memory configuration recommendation
 * @property {number} snapshotCount - Number of snapshots taken
 * @property {number} durationMs - Duration of tracking in milliseconds
 */

class MemoryTracker {
    constructor() {
        this.snapshots = [];
        this.startTime = Date.now();
        this.lambdaMemoryLimit = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) || 256;
        
        // Take initial snapshot
        this.snapshot('init');
    }

    /**
     * Take a memory usage snapshot
     * @param {string} label - Description of when snapshot was taken
     * @returns {MemorySnapshot} The memory snapshot
     */
    snapshot(label = 'checkpoint') {
        const memUsage = process.memoryUsage();
        const snapshot = {
            timestamp: Date.now(),
            label,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss,
            arrayBuffers: memUsage.arrayBuffers || 0
        };
        
        this.snapshots.push(snapshot);
        return snapshot;
    }

    /**
     * Get current memory usage in a readable format
     * @returns {Object} Current memory usage
     */
    getCurrentUsage() {
        const memUsage = process.memoryUsage();
        return {
            heapUsedMB: this.bytesToMB(memUsage.heapUsed),
            heapTotalMB: this.bytesToMB(memUsage.heapTotal),
            rssMB: this.bytesToMB(memUsage.rss),
            externalMB: this.bytesToMB(memUsage.external),
            arrayBuffersMB: this.bytesToMB(memUsage.arrayBuffers || 0),
            lambdaLimitMB: this.lambdaMemoryLimit
        };
    }

    /**
     * Calculate comprehensive memory statistics
     * @returns {MemoryStatistics} Memory statistics
     */
    getStatistics() {
        if (this.snapshots.length === 0) {
            throw new Error('No memory snapshots available');
        }

        const startSnapshot = this.snapshots[0];
        const currentSnapshot = this.snapshots[this.snapshots.length - 1];
        
        // Find peak values
        const peakHeapUsed = Math.max(...this.snapshots.map(s => s.heapUsed));
        const peakHeapTotal = Math.max(...this.snapshots.map(s => s.heapTotal));
        const peakRss = Math.max(...this.snapshots.map(s => s.rss));
        
        // Calculate deltas
        const heapUsedDelta = currentSnapshot.heapUsed - startSnapshot.heapUsed;
        const rssDelta = currentSnapshot.rss - startSnapshot.rss;
        
        // Calculate utilization (percentage of heap used vs total)
        const currentHeapUtilization = (currentSnapshot.heapUsed / currentSnapshot.heapTotal) * 100;
        const peakHeapUtilization = (peakHeapUsed / peakHeapTotal) * 100;
        
        // Calculate recommendation based on peak RSS vs Lambda limit
        const peakRssMB = this.bytesToMB(peakRss);
        const recommendation = this.calculateRecommendation(peakRssMB);
        
        const durationMs = Date.now() - this.startTime;

        return {
            startHeapUsed: this.bytesToMB(startSnapshot.heapUsed),
            currentHeapUsed: this.bytesToMB(currentSnapshot.heapUsed),
            peakHeapUsed: this.bytesToMB(peakHeapUsed),
            heapUsedDelta: this.bytesToMB(heapUsedDelta),
            currentRss: this.bytesToMB(currentSnapshot.rss),
            peakRss: this.bytesToMB(peakRss),
            rssDelta: this.bytesToMB(rssDelta),
            heapUtilization: Math.round(currentHeapUtilization * 100) / 100,
            peakHeapUtilization: Math.round(peakHeapUtilization * 100) / 100,
            lambdaLimitMB: this.lambdaMemoryLimit,
            recommendation,
            snapshotCount: this.snapshots.length,
            durationMs
        };
    }

    /**
     * Calculate memory configuration recommendation
     * @param {number} peakRssMB - Peak RSS in MB
     * @returns {string} Recommendation
     */
    calculateRecommendation(peakRssMB) {
        const utilizationPercent = (peakRssMB / this.lambdaMemoryLimit) * 100;
        
        // Add safety margin (20% overhead recommended)
        const recommendedMemory = Math.ceil(peakRssMB * 1.2);
        
        if (utilizationPercent > 90) {
            return `CRITICAL: Increase to at least ${Math.max(recommendedMemory, this.lambdaMemoryLimit + 64)}MB (currently at ${Math.round(utilizationPercent)}%)`;
        } else if (utilizationPercent > 75) {
            return `WARNING: Consider increasing to ${recommendedMemory}MB (currently at ${Math.round(utilizationPercent)}%)`;
        } else if (utilizationPercent < 30) {
            // Can potentially reduce, but maintain minimum safe levels
            const potentialReduction = Math.max(128, recommendedMemory);
            if (potentialReduction < this.lambdaMemoryLimit) {
                return `OK: Can reduce to ${potentialReduction}MB (currently at ${Math.round(utilizationPercent)}%)`;
            } else {
                return `OK: Current allocation optimal (${Math.round(utilizationPercent)}% utilization)`;
            }
        } else {
            return `OK: Current allocation adequate (${Math.round(utilizationPercent)}% utilization)`;
        }
    }

    /**
     * Get detailed breakdown of all snapshots
     * @returns {Array} Array of formatted snapshots
     */
    getSnapshotBreakdown() {
        return this.snapshots.map((snapshot, index) => {
            const timeSinceStart = snapshot.timestamp - this.startTime;
            const heapUsedMB = this.bytesToMB(snapshot.heapUsed);
            const rssMB = this.bytesToMB(snapshot.rss);
            
            return {
                index,
                label: snapshot.label,
                timeSinceStartMs: timeSinceStart,
                heapUsedMB: Math.round(heapUsedMB * 100) / 100,
                rssMB: Math.round(rssMB * 100) / 100,
                heapUtilization: Math.round((snapshot.heapUsed / snapshot.heapTotal) * 100 * 100) / 100
            };
        });
    }

    /**
     * Get a formatted summary for logging
     * @returns {string} Formatted summary
     */
    getSummary() {
        const stats = this.getStatistics();
        
        return [
            `Memory Statistics:`,
            `  Duration: ${stats.durationMs}ms`,
            `  Heap: ${stats.startHeapUsed.toFixed(2)}MB → ${stats.currentHeapUsed.toFixed(2)}MB (peak: ${stats.peakHeapUsed.toFixed(2)}MB)`,
            `  RSS: ${stats.currentRss.toFixed(2)}MB (peak: ${stats.peakRss.toFixed(2)}MB)`,
            `  Heap Utilization: ${stats.heapUtilization}% (peak: ${stats.peakHeapUtilization}%)`,
            `  Lambda Limit: ${stats.lambdaLimitMB}MB`,
            `  Recommendation: ${stats.recommendation}`,
            `  Snapshots: ${stats.snapshotCount}`
        ].join('\n');
    }

    /**
     * Get memory data for response headers/metadata
     * @returns {Object} Memory data suitable for API responses
     */
    getResponseMetadata() {
        const stats = this.getStatistics();
        
        return {
            memory: {
                current: {
                    heapMB: Math.round(stats.currentHeapUsed * 100) / 100,
                    rssMB: Math.round(stats.currentRss * 100) / 100,
                    utilization: `${stats.heapUtilization}%`
                },
                peak: {
                    heapMB: Math.round(stats.peakHeapUsed * 100) / 100,
                    rssMB: Math.round(stats.peakRss * 100) / 100,
                    utilization: `${stats.peakHeapUtilization}%`
                },
                lambda: {
                    limitMB: stats.lambdaLimitMB,
                    peakUsagePercent: Math.round((stats.peakRss / stats.lambdaLimitMB) * 100)
                },
                recommendation: stats.recommendation,
                durationMs: stats.durationMs
            }
        };
    }

    /**
     * Check if memory usage is approaching limits
     * @param {number} thresholdPercent - Threshold percentage (default 80%)
     * @returns {boolean} True if memory usage is high
     */
    isMemoryHigh(thresholdPercent = 80) {
        const memUsage = process.memoryUsage();
        const rssMB = this.bytesToMB(memUsage.rss);
        const utilizationPercent = (rssMB / this.lambdaMemoryLimit) * 100;
        
        return utilizationPercent >= thresholdPercent;
    }

    /**
     * Force garbage collection if available (requires --expose-gc flag)
     * @returns {boolean} True if GC was triggered
     */
    forceGC() {
        if (global.gc) {
            const beforeRss = process.memoryUsage().rss;
            global.gc();
            const afterRss = process.memoryUsage().rss;
            const freedMB = this.bytesToMB(beforeRss - afterRss);
            console.log(`🗑️  Forced GC: freed ${freedMB.toFixed(2)}MB`);
            return true;
        }
        return false;
    }

    /**
     * Convert bytes to megabytes
     * @param {number} bytes - Bytes to convert
     * @returns {number} Megabytes
     */
    bytesToMB(bytes) {
        return bytes / (1024 * 1024);
    }

    /**
     * Reset the tracker (useful for long-running Lambda containers)
     */
    reset() {
        this.snapshots = [];
        this.startTime = Date.now();
        this.snapshot('reset');
    }

    /**
     * Export full tracking data for analysis
     * @returns {Object} Complete tracking data
     */
    exportData() {
        return {
            lambdaMemoryLimit: this.lambdaMemoryLimit,
            startTime: this.startTime,
            endTime: Date.now(),
            statistics: this.getStatistics(),
            snapshots: this.getSnapshotBreakdown(),
            rawSnapshots: this.snapshots
        };
    }
}

/**
 * Create a singleton instance for the Lambda function
 */
let globalMemoryTracker = null;

/**
 * Get or create the global memory tracker instance
 * @returns {MemoryTracker} The memory tracker instance
 */
function getMemoryTracker() {
    if (!globalMemoryTracker) {
        globalMemoryTracker = new MemoryTracker();
    }
    return globalMemoryTracker;
}

/**
 * Reset the global memory tracker (for new Lambda invocations)
 * @returns {MemoryTracker} New memory tracker instance
 */
function resetMemoryTracker() {
    globalMemoryTracker = new MemoryTracker();
    return globalMemoryTracker;
}

module.exports = {
    MemoryTracker,
    getMemoryTracker,
    resetMemoryTracker
};
