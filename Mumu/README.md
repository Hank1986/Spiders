# Case Data Collector

# Mumu Spider - Enhanced with Parallel Processing

This Node.js application fetches case data from a REST API and exports it to an Excel file. The application has been enhanced with parallel processing capabilities to significantly improve performance.

## Features

- **Parallel Page Fetching**: Fetches multiple pages of case lists concurrently
- **Parallel Detail Fetching**: Fetches case details concurrently with configurable concurrency limits
- **Smart Rate Limiting**: Built-in rate limiter that respects API limits (10 detail requests per second)
- **Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Rate Limit Detection**: Special handling for API rate limit errors with appropriate backoff
- **Progress Tracking**: Real-time progress monitoring and reporting
- **Error Handling**: Robust error handling that continues processing even when some requests fail
- **Configurable Settings**: Easy configuration through environment variables

## API Rate Limits

The target API has specific rate limits that the application automatically handles:

- **Detail endpoint**: Maximum 10 requests per second
- **Rate limit error**: "详情页1s内只能查询10次!!" 

The application includes:
- Built-in rate limiter that tracks request timing
- Automatic detection of rate limit errors (HTTP 500 with specific message)
- Special retry logic for rate limit situations (longer wait times)
- Configurable rate limits through environment variables

### Recommended Settings for API Rate Limits

```env
MAX_CONCURRENT_DETAILS=8        # Stay below the 10/second limit
BASE_DELAY=150                  # Add spacing between requests
DETAIL_RATE_LIMIT_PER_SECOND=10 # Match API limit
```

## Performance Improvements

The enhanced version provides significant performance improvements:

- **Up to 10x faster** for large datasets
- **Configurable concurrency** to balance speed vs. API load
- **Intelligent retry logic** to handle temporary failures
- **Progress tracking** to monitor execution

## Configuration

### Environment Variables

The application supports the following configuration options in the `.env` file:

#### API Configuration
- `API_BASE_URL`: Base URL for the API
- `API_TOKEN`: Authentication token
- `TOKEN_ENDPOINT`: Token endpoint for authentication
- `API_USERNAME`: Username for authentication
- `API_PASSWORD`: Password for authentication
- `CASE_LIST_ENDPOINT`: Endpoint for case list
- `CASE_DETAIL_ENDPOINT`: Endpoint for case details

#### Parallel Processing Configuration
- `MAX_CONCURRENT_PAGES`: Maximum number of concurrent page requests (default: 2)
- `MAX_CONCURRENT_DETAILS`: Maximum number of concurrent detail requests (default: 8)
- `RETRY_ATTEMPTS`: Number of retry attempts for failed requests (default: 3)
- `BASE_DELAY`: Base delay between requests in milliseconds (default: 150)
- `MAX_DELAY`: Maximum delay for exponential backoff in milliseconds (default: 5000)
- `REQUEST_TIMEOUT`: Request timeout in milliseconds (default: 30000)
- `PARALLEL_ENABLED`: Enable/disable parallel processing (default: true)
- `DETAIL_RATE_LIMIT_PER_SECOND`: API rate limit for detail requests per second (default: 10)

#### Logging Configuration
- `PROGRESS_INTERVAL`: Log progress every N processed items (default: 50)
- `VERBOSE_LOGGING`: Enable detailed logging (default: false)

### Performance Tuning

You can adjust the performance characteristics by modifying these settings:

1. **For faster processing** (if your API can handle it):
   ```
   MAX_CONCURRENT_PAGES=5
   MAX_CONCURRENT_DETAILS=20
   BASE_DELAY=50
   ```

2. **For more conservative processing** (to avoid overloading the API):
   ```
   MAX_CONCURRENT_PAGES=2
   MAX_CONCURRENT_DETAILS=5
   BASE_DELAY=200
   ```

3. **To disable parallel processing** (fallback to sequential):
   ```
   PARALLEL_ENABLED=false
   ```

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure your environment variables in the `.env` file

3. Run the application:
   ```bash
   node index.js
   ```

## Output

The application will:
1. Fetch all case pages in parallel
2. Fetch case details in parallel with progress tracking
3. Export the combined data to an Excel file with timestamp
4. Display comprehensive execution statistics

## Error Handling

The enhanced version includes robust error handling:
- Failed requests are automatically retried with exponential backoff
- Failed cases are logged but don't stop the overall process
- Final statistics show success/failure rates
- Detailed error logging for troubleshooting

## Architecture

### Worker Pool Pattern
The application uses a worker pool pattern to control concurrency:
- Separate pools for page fetching and detail fetching
- Configurable maximum workers to prevent API overload
- Automatic queuing and processing of tasks

### Retry Logic
Implements intelligent retry with:
- Exponential backoff with jitter
- Configurable retry attempts
- Different strategies for different types of failures

### Progress Tracking
Real-time progress monitoring includes:
- Page fetching progress
- Case detail fetching progress
- Failed request tracking
- Performance metrics

## Dependencies

- `axios`: HTTP client for API requests
- `xlsx`: Excel file generation
- `dotenv`: Environment variable management

## Features

- Fetches case list and detailed information from the API
- Combines data from both endpoints
- Exports combined data to Excel format
- Configuration management using environment variables

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure the environment variables in `.env` file:
   - API_BASE_URL: Base URL for the API
   - API_TOKEN: Authorization token
   - CASE_LIST_ENDPOINT: Endpoint for case list
   - CASE_DETAIL_ENDPOINT: Endpoint for case details

## Usage

Run the application:
```bash
node index.js
```

The application will:
1. Fetch the list of cases
2. Fetch details for each case
3. Combine the data
4. Export to an Excel file named `case_data_[timestamp].xlsx`

## Configuration

To update the API endpoints or token:
1. Open the `.env` file
2. Modify the required values
3. Save the file and run the application again
