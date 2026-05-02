const axios = require('axios');
const xlsx = require('xlsx');
const config = require('./config');

// Create axios instance with common configuration (will be updated with token)
let api;

// Configuration for parallel processing
const PARALLEL_CONFIG = {
    maxConcurrentPages: config.parallel.maxConcurrentPages,
    maxConcurrentDetails: config.parallel.maxConcurrentDetails,
    retryAttempts: config.parallel.retryAttempts,
    baseDelay: config.parallel.baseDelay,
    maxDelay: config.parallel.maxDelay,
    requestTimeout: config.parallel.requestTimeout,
    enabled: config.parallel.enabled,
    detailRateLimitPerSecond: config.parallel.detailRateLimitPerSecond
};

// Progress tracking
let progressState = {
    totalPages: 0,
    completedPages: 0,
    totalCases: 0,
    completedCases: 0,
    failedCases: 0
};

async function getTokenFromAPI() {
    try {
        // Create a temporary axios instance for token request
        const tokenApi = axios.create({
            baseURL: config.apiBaseUrl
        });

        const response = await tokenApi.post(config.tokenEndpoint, {
            username: config.username,
            password: config.password,
            rememberMe: false,
            code: "Px/Ybi6QHkukLVwunCN8UwridqXYWJPT4S4uKY1NMWTbBAdsXSoVH8t4ahGKXB3JfdTXJBwZsrbbzS0Ka+0Z5qcIuUdFYmgUgyT8YI1pdTU="
        });

        console.log('Token API response:', JSON.stringify(response.data, null, 2));

        if (response.data && response.data.token) {
            console.log('Successfully obtained token from API');
            return response.data.token;
        } else {
            throw new Error('Token not found in API response');
        }
    } catch (error) {
        console.error('Failed to get token from API:', error.message);
        if (error.response) {
            console.error('API Response status:', error.response.status);
            console.error('API Response data:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

async function initializeAPI() {
    try {
        // First try to get token from API
        let token = await getTokenFromAPI();
        
        if (!token) {
            console.log('Falling back to token from config file');
            token = config.apiToken;
        }

        if (!token) {
            throw new Error('No token available from API or config file');
        }

        // Create axios instance with the obtained token
        api = axios.create({
            baseURL: config.apiBaseUrl,
            timeout: PARALLEL_CONFIG.requestTimeout,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('API instance initialized successfully');
    } catch (error) {
        console.error('Failed to initialize API:', error.message);
        throw error;
    }
}

// Utility function for exponential backoff delay
function getRetryDelay(attempt) {
    const delay = Math.min(
        PARALLEL_CONFIG.baseDelay * Math.pow(2, attempt),
        PARALLEL_CONFIG.maxDelay
    );
    return delay + Math.random() * 1000; // Add jitter
}

// Utility function to sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Worker pool for controlling concurrency
class WorkerPool {
    constructor(maxWorkers = 10) {
        this.maxWorkers = maxWorkers;
        this.activeWorkers = 0;
        this.queue = [];
    }

    async execute(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) {
            return;
        }

        this.activeWorkers++;
        const { task, resolve, reject } = this.queue.shift();

        try {
            const result = await task();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.activeWorkers--;
            this.processQueue();
        }
    }
}

// Rate limiter for API calls
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
        
        // If we're at the limit, wait
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.windowMs - (now - oldestRequest) + 50; // Add 50ms buffer
            
            if (waitTime > 0) {
                console.log(`⏳ Rate limit reached, waiting ${waitTime}ms...`);
                await sleep(waitTime);
                return this.waitForSlot(); // Recursive call to check again
            }
        }
        
        // Record this request
        this.requests.push(now);
    }
}

// Create rate limiter for detail requests (10 requests per second)
const detailRateLimiter = new RateLimiter(PARALLEL_CONFIG.detailRateLimitPerSecond, 1000);

// Enhanced fetch function with retry logic
async function fetchWithRetry(requestFn, context = '', maxRetries = PARALLEL_CONFIG.retryAttempts) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            
            // Check if this is a rate limit error
            const isRateLimitError = error.response?.status === 500 && 
                                   error.response?.data?.msg?.includes('1s内只能查询');
            
            if (attempt === maxRetries) {
                console.error(`${context}: Final attempt failed after ${maxRetries + 1} tries`);
                break;
            }
            
            // For rate limit errors, wait longer
            let delay;
            if (isRateLimitError) {
                delay = 1200 + Math.random() * 300; // Wait 1.2-1.5 seconds for rate limit
                console.warn(`${context}: Rate limit hit, waiting ${Math.round(delay)}ms before retry...`);
            } else {
                delay = getRetryDelay(attempt);
                console.warn(`${context}: Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
            }
            
            await sleep(delay);
        }
    }
    
    throw lastError;
}

// Progress logging function
function logProgress() {
    const pagesProgress = progressState.totalPages > 0 
        ? `${progressState.completedPages}/${progressState.totalPages}` 
        : '0/0';
    const casesProgress = progressState.totalCases > 0 
        ? `${progressState.completedCases}/${progressState.totalCases}` 
        : '0/0';
    
    console.log(`Progress - Pages: ${pagesProgress}, Cases: ${casesProgress}, Failed: ${progressState.failedCases}`);
}

async function fetchCaseList(pageNum = 1, pageSize = 100) {
    const context = `Page ${pageNum}`;
    
    return await fetchWithRetry(async () => {
        console.log(`Making request to: ${config.apiBaseUrl}${config.caseListEndpoint}`);
        console.log(`Request payload for page ${pageNum}:`, JSON.stringify({
            pageNum,
            pageSize,
            orderByColumn: 'createTime',
            isAsc: 'desc'
        }, null, 2));

        const response = await api.post(config.caseListEndpoint, {
            pageNum,
            pageSize,
            orderByColumn: 'createTime',
            isAsc: 'desc'
        });

        console.log(`Case list API response for page ${pageNum}:`, JSON.stringify(response.data, null, 2));

        if (!response.data || typeof response.data.total === 'undefined') {
            throw new Error('Invalid response format: missing total count');
        }

        console.log(`Page ${pageNum}: Retrieved ${response.data.rows?.length || 0} records`);
        return response.data;
    }, context);
}

async function fetchCaseDetail(caseId) {
    const context = `Case Detail ${caseId}`;
    
    try {
        return await fetchWithRetry(async () => {
            // Wait for rate limiter slot before making the request
            await detailRateLimiter.waitForSlot();
            
            // Using the direct endpoint with the caseId
            const response = await api.get(`${config.caseDetailEndpoint}/${caseId}`);
            console.log(`Detail response for case ${caseId}:`, JSON.stringify(response.data, null, 2));
            return response.data;
        }, context);
    } catch (error) {
        console.error(`Error fetching case detail for ID ${caseId}:`, {
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            url: error.config?.url
        });
        progressState.failedCases++;
        return null;  // Return null instead of throwing to allow other cases to be processed
    }
}

async function getAllCasesWithDetails() {
    try {
        console.log('🚀 Starting parallel data collection...');
        
        // Fetch the first page to get total records
        const firstPageResponse = await fetchCaseList(1, 100);
        const totalRecords = firstPageResponse.total || 0;
        const pageSize = 100;
        const totalPages = Math.ceil(totalRecords / pageSize);
        
        // Update progress state
        progressState.totalPages = totalPages;
        progressState.totalCases = totalRecords;
        
        console.log(`📊 Total records: ${totalRecords}, Total pages: ${totalPages}`);
        logProgress();
        
        // Create worker pool for page fetching
        const pageWorkerPool = new WorkerPool(PARALLEL_CONFIG.maxConcurrentPages);
        
        // Array to store all cases from all pages
        let allCases = [];
        
        // Create tasks for parallel page fetching
        const pageTasks = [];
        for (let page = 1; page <= totalPages; page++) {
            if (page === 1) {
                // We already have the first page
                allCases = allCases.concat(firstPageResponse.rows || []);
                progressState.completedPages++;
                continue;
            }
            
            const pageTask = pageWorkerPool.execute(async () => {
                try {
                    const caseListResponse = await fetchCaseList(page, pageSize);
                    progressState.completedPages++;
                    
                    if (progressState.completedPages % 5 === 0 || progressState.completedPages === totalPages) {
                        logProgress();
                    }
                    
                    return caseListResponse.rows || [];
                } catch (error) {
                    console.error(`Failed to fetch page ${page}:`, error.message);
                    progressState.completedPages++;
                    return [];
                }
            });
            
            pageTasks.push(pageTask);
        }
        
        // Wait for all page fetches to complete
        console.log('📥 Fetching all pages in parallel...');
        const pageResults = await Promise.all(pageTasks);
        
        // Combine all cases
        for (const pageData of pageResults) {
            allCases = allCases.concat(pageData);
        }
        
        console.log(`✅ Page fetching completed. Found ${allCases.length} total cases.`);
        logProgress();
        
        if (allCases.length === 0) {
            console.log('⚠️ No cases found to process');
            return [];
        }
        
        // Now fetch details for each case in parallel
        console.log('🔍 Fetching case details in parallel...');
        
        // Create worker pool for detail fetching
        const detailWorkerPool = new WorkerPool(PARALLEL_CONFIG.maxConcurrentDetails);
        
        // Create detail fetch tasks
        const detailTasks = allCases.map((caseItem, index) => {
            return detailWorkerPool.execute(async () => {
                try {
                    const details = await fetchCaseDetail(caseItem.id);
                    progressState.completedCases++;
                    
                    // Log progress every N cases or at the end
                    if (progressState.completedCases % config.logging.progressInterval === 0 || 
                        progressState.completedCases === allCases.length) {
                        logProgress();
                    }
                    
                    if (details) {
                        return {
                            ...caseItem,
                            details: details.data || details
                        };
                    }
                    return null;
                } catch (error) {
                    console.error(`Failed to fetch details for case ${caseItem.id}:`, error.message);
                    progressState.completedCases++;
                    progressState.failedCases++;
                    return null;
                }
            });
        });
        
        // Execute all detail fetches with progress tracking
        const detailResults = await Promise.all(detailTasks);
        
        // Filter out null results (failed cases)
        const casesWithDetails = detailResults.filter(caseItem => caseItem !== null);
        
        console.log(`✅ Parallel processing completed!`);
        console.log(`📈 Successfully processed ${casesWithDetails.length} out of ${allCases.length} cases`);
        console.log(`❌ Failed cases: ${progressState.failedCases}`);
        logProgress();
        
        return casesWithDetails;
    } catch (error) {
        console.error('❌ Error in parallel processing:', error.message);
        throw error;
    }
}

function exportToExcel(data) {
    try {
        // Create a new workbook and worksheet
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(data);

        // Add the worksheet to the workbook
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Cases');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `case_data_${timestamp}.xlsx`;

        // Write the workbook to a file
        xlsx.writeFile(workbook, filename);
        console.log(`Data exported successfully to ${filename}`);
    } catch (error) {
        console.error('Error exporting to Excel:', error.message);
        throw error;
    }
}

// Main execution
async function main() {
    const startTime = Date.now();
    
    try {
        console.log('🔧 Initializing API connection...');
        await initializeAPI();  // Initialize API before fetching data
        
        console.log('🎯 Starting parallel data collection...');
        console.log(`⚡ Configuration: ${PARALLEL_CONFIG.maxConcurrentPages} concurrent pages, ${PARALLEL_CONFIG.maxConcurrentDetails} concurrent details`);
        console.log(`🚦 Rate limiting: Max ${PARALLEL_CONFIG.detailRateLimitPerSecond} detail requests per second`);
        
        const casesWithDetails = await getAllCasesWithDetails();
        
        if (casesWithDetails.length === 0) {
            console.log('⚠️ No data to export');
            return;
        }

        // Format data for Excel export
        console.log('📝 Formatting data for export...');
        const formattedData = casesWithDetails.map(caseItem => {
            // Ensure details exist and extract them properly
            const details = caseItem.details || {};
            
            return {
                ID: caseItem.id,
                UserId: caseItem.userId,
                UserName: caseItem.userName,
                Phone: caseItem.phone,
                Gender: caseItem.gender,
                IdNo: caseItem.userIdNo,
                Birthday: caseItem.birthday,
                Address: caseItem.registerAddr,
                OverdueDays: caseItem.maxOverdueDays,
                TotalAmount: caseItem.orgOverdueTotalamt,
                Principal: caseItem.orgOverduePrincipal,
                Interest: caseItem.orgOverdueInterest,
                AssignedDate: caseItem.assignedDate,
                ExpireDate: caseItem.expireDate,
                CaseStatus: caseItem.caseStatus,
                // Add any additional fields from details if needed
                ...details
            };
        });

        // Export to Excel
        console.log('💾 Exporting to Excel...');
        exportToExcel(formattedData);
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        console.log('🎉 Data collection and export completed successfully!');
        console.log(`⏱️ Total execution time: ${duration} seconds`);
        console.log(`📊 Final stats:`);
        console.log(`   - Total cases processed: ${casesWithDetails.length}`);
        console.log(`   - Failed cases: ${progressState.failedCases}`);
        console.log(`   - Success rate: ${Math.round((casesWithDetails.length / progressState.totalCases) * 100)}%`);
        
    } catch (error) {
        console.error('💥 Application error:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the application
main();
