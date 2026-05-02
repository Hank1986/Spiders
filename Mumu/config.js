require('dotenv').config();

module.exports = {
    // API Configuration
    apiBaseUrl: process.env.API_BASE_URL,
    apiToken: process.env.API_TOKEN,
    tokenEndpoint: process.env.TOKEN_ENDPOINT || '/auth/login',
    username: process.env.API_USERNAME,
    password: process.env.API_PASSWORD,
    caseListEndpoint: process.env.CASE_LIST_ENDPOINT,
    caseDetailEndpoint: process.env.CASE_DETAIL_ENDPOINT,
    
    // Parallel Processing Configuration
    parallel: {
        // Maximum number of concurrent page requests
        maxConcurrentPages: parseInt(process.env.MAX_CONCURRENT_PAGES) || 2,
        
        // Maximum number of concurrent detail requests (API limit: 10 per second)
        maxConcurrentDetails: parseInt(process.env.MAX_CONCURRENT_DETAILS) || 8,
        
        // Number of retry attempts for failed requests
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
        
        // Base delay between requests (milliseconds)
        baseDelay: parseInt(process.env.BASE_DELAY) || 150,
        
        // Maximum delay for exponential backoff (milliseconds)
        maxDelay: parseInt(process.env.MAX_DELAY) || 5000,
        
        // Request timeout (milliseconds)
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
        
        // Enable/disable parallel processing
        enabled: process.env.PARALLEL_ENABLED !== 'false',
        
        // API rate limit for detail requests per second
        detailRateLimitPerSecond: parseInt(process.env.DETAIL_RATE_LIMIT_PER_SECOND) || 10
    },
    
    // Logging Configuration
    logging: {
        // Log progress every N processed items
        progressInterval: parseInt(process.env.PROGRESS_INTERVAL) || 50,
        
        // Enable detailed logging
        verbose: process.env.VERBOSE_LOGGING === 'true'
    }
};
