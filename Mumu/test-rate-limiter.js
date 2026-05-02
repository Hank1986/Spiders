const config = require('./config');

// Test the rate limiter configuration
console.log('🧪 Rate Limiter Test Configuration:');
console.log('==================================');
console.log(`Max Concurrent Details: ${config.parallel.maxConcurrentDetails}`);
console.log(`Detail Rate Limit Per Second: ${config.parallel.detailRateLimitPerSecond}`);
console.log(`Base Delay: ${config.parallel.baseDelay}ms`);
console.log(`Retry Attempts: ${config.parallel.retryAttempts}`);

// Simulate rate limiter behavior
class RateLimiter {
    constructor(maxRequests = 10, windowMs = 1000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }

    async waitForSlot() {
        const now = Date.now();
        
        // Remove requests older than the window
        this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
        
        console.log(`🔍 Current requests in window: ${this.requests.length}/${this.maxRequests}`);
        
        // If we're at the limit, calculate wait time
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.windowMs - (now - oldestRequest) + 50;
            
            if (waitTime > 0) {
                console.log(`⏳ Rate limit reached, would wait ${waitTime}ms...`);
                return waitTime;
            }
        }
        
        // Record this request
        this.requests.push(now);
        console.log(`✅ Request allowed. Total in window: ${this.requests.length}`);
        return 0;
    }
}

async function testRateLimiter() {
    console.log('\n🚀 Testing Rate Limiter Behavior:');
    console.log('==================================');
    
    const limiter = new RateLimiter(config.parallel.detailRateLimitPerSecond, 1000);
    
    // Simulate 15 rapid requests
    for (let i = 1; i <= 15; i++) {
        console.log(`\nRequest #${i}:`);
        const waitTime = await limiter.waitForSlot();
        
        if (waitTime > 0) {
            console.log(`🛑 Would be blocked for ${waitTime}ms`);
        }
        
        // Small delay to simulate request processing
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

// Run the test
testRateLimiter().then(() => {
    console.log('\n✅ Rate limiter test completed');
}).catch(error => {
    console.error('❌ Test failed:', error);
});
