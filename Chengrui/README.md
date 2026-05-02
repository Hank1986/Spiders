# Case Data Exporter

This Node.js application fetches case data from an API and exports it to an Excel file.

## Features

- Fetches case list with pagination
- Retrieves detailed information for each case
- Combines data from both APIs
- Exports to Excel with proper formatting
- Handles rate limiting with delays between requests
- Provides progress feedback in console

## Setup

1. Make sure you have Node.js installed (version 14 or higher)

2. Install dependencies:
```bash
npm install
```

## Usage

Run the application:
```bash
npm start
```

The application will:
1. Fetch all cases from the list API
2. Get details for each case
3. Combine the data
4. Export to an Excel file named `cases_export_YYYY-MM-DD.xlsx`

Progress will be shown in the console as cases are processed.
