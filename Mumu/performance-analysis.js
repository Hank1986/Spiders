const config = require('./config');

/**
 * Performance Comparison Script
 * 
 * This script demonstrates the performance benefits of parallel processing
 * by calculating estimated execution times for different scenarios.
 */

function calculateExecutionTime(totalCases, scenario) {
    const { 
        maxConcurrentPages, 
        maxConcurrentDetails, 
        baseDelay 
    } = scenario;
    
    // Assumptions
    const casesPerPage = 100;
    const totalPages = Math.ceil(totalCases / casesPerPage);
    const avgPageRequestTime = 1000; // 1 second per page request
    const avgDetailRequestTime = 500; // 0.5 seconds per detail request
    
    // Sequential processing time
    const sequentialPageTime = totalPages * (avgPageRequestTime + baseDelay);
    const sequentialDetailTime = totalCases * (avgDetailRequestTime + baseDelay);
    const sequentialTotal = sequentialPageTime + sequentialDetailTime;
    
    // Parallel processing time
    const parallelPageTime = Math.ceil(totalPages / maxConcurrentPages) * (avgPageRequestTime + baseDelay);
    const parallelDetailTime = Math.ceil(totalCases / maxConcurrentDetails) * (avgDetailRequestTime + baseDelay);
    const parallelTotal = parallelPageTime + parallelDetailTime;
    
    return {
        sequential: {
            pages: sequentialPageTime / 1000,
            details: sequentialDetailTime / 1000,
            total: sequentialTotal / 1000
        },
        parallel: {
            pages: parallelPageTime / 1000,
            details: parallelDetailTime / 1000,
            total: parallelTotal / 1000
        },
        improvement: {
            factor: Math.round((sequentialTotal / parallelTotal) * 10) / 10,
            timeSaved: Math.round((sequentialTotal - parallelTotal) / 1000),
            percentageFaster: Math.round(((sequentialTotal - parallelTotal) / sequentialTotal) * 100)
        }
    };
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

function displayComparison(totalCases) {
    console.log(`\n🚀 Performance Comparison for ${totalCases} cases:`);
    console.log('=' .repeat(60));
    
    const currentConfig = {
        maxConcurrentPages: config.parallel.maxConcurrentPages,
        maxConcurrentDetails: config.parallel.maxConcurrentDetails,
        baseDelay: config.parallel.baseDelay
    };
    
    const result = calculateExecutionTime(totalCases, currentConfig);
    
    console.log(`📊 Sequential Processing:`);
    console.log(`   Pages:   ${formatTime(result.sequential.pages)}`);
    console.log(`   Details: ${formatTime(result.sequential.details)}`);
    console.log(`   Total:   ${formatTime(result.sequential.total)}`);
    
    console.log(`\n⚡ Parallel Processing (Current Config):`);
    console.log(`   Pages:   ${formatTime(result.parallel.pages)}`);
    console.log(`   Details: ${formatTime(result.parallel.details)}`);
    console.log(`   Total:   ${formatTime(result.parallel.total)}`);
    
    console.log(`\n📈 Performance Improvement:`);
    console.log(`   ${result.improvement.factor}x faster`);
    console.log(`   ${result.improvement.percentageFaster}% improvement`);
    console.log(`   Time saved: ${formatTime(result.improvement.timeSaved)}`);
}

// Display comparisons for different dataset sizes
console.log('Performance Analysis - Parallel vs Sequential Processing');
console.log('Current Configuration:');
console.log(`- Max Concurrent Pages: ${config.parallel.maxConcurrentPages}`);
console.log(`- Max Concurrent Details: ${config.parallel.maxConcurrentDetails}`);
console.log(`- Base Delay: ${config.parallel.baseDelay}ms`);

displayComparison(100);    // Small dataset
displayComparison(1000);   // Medium dataset  
displayComparison(5000);   // Large dataset
displayComparison(10000);  // Very large dataset

console.log('\n💡 Tips for optimization:');
console.log('- Increase MAX_CONCURRENT_DETAILS for faster detail fetching');
console.log('- Increase MAX_CONCURRENT_PAGES if your API can handle more load');
console.log('- Reduce BASE_DELAY if the API doesn\'t require rate limiting');
console.log('- Monitor your API\'s rate limits and adjust accordingly');
