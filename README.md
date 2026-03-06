# CAROL Cleaner

A web-based tool for cleaning and analyzing NTSB safety recommendation data from the CAROL database.

## Overview

The CAROL Cleaner transforms raw CSV exports from the NTSB's CAROL (Consensus Action Recommendation and Open‐Closed) database into clean, analysis-ready datasets. It handles multi-recipient recommendations, normalizes status data, and optionally enriches records with additional metadata from JSON files.

## Features

### Data Processing
- **CSV Cleaning**: Automatically processes raw CAROL exports
- **Multi-recipient Handling**: Splits recommendations with multiple recipients into separate rows
- **Status Parsing**: Extracts open/closed status and response details from addressee fields
- **Date Normalization**: Converts dates to YYYY-MM-DD format
- **Column Management**: Removes redundant fields and reorganizes data for analysis

### JSON Enrichment (Optional)
Add supplementary data from CAROL's full JSON export:
- Priority level and priority number
- Hazmat flag
- Most Wanted List status
- Reiteration status and count
- NPRM (Notice of Proposed Rulemaking) flag
- Keywords
- Recommendation letter URL

### Interactive Features
- **Real-time Search**: Filter across all columns
- **Status Filtering**: Filter by Open/Closed status
- **Sortable Columns**: Click headers to sort data
- **Paginated View**: Browse large datasets (50 rows per page)
- **Detail Modal**: Click any row to see full recommendation details
- **Visual Badges**: Color-coded status and boolean indicators
- **CSV Export**: Download filtered results with all enrichments

## Usage

### Quick Start

1. Open `index.html` in a web browser
2. Drop or select a CSV file from CAROL's query builder
3. (Optional) Add a JSON file for enrichment
4. Browse, search, and download your cleaned data

### Getting CAROL Data

**CSV Export:**
1. Visit [data.ntsb.gov/carol-main-public/query-builder](https://data.ntsb.gov/carol-main-public/query-builder)
2. Build your query and export as CSV
3. Upload to CAROL Cleaner

**JSON Export (Optional):**
1. Use the CAROL API to fetch full recommendation details
2. Save as a JSON array with at least the `srid` field for matching
3. Upload to enable enrichment features

### Output Structure

The cleaned CSV includes:
- `srid` - Safety Recommendation ID
- `reportno` - Report number
- `mkey` - Main key
- `ntsb_no` - NTSB number
- `recipient` - Individual recipient (split from multi-recipient records)
- `open or closed` - Recommendation status
- `response status` - Detailed response classification
- `date closed` - Closure date (if applicable)
- `date_issued` - Issuance date
- `event_date` - Incident date
- `city`, `state` - Location
- `recommendation` - Full recommendation text
- Plus any JSON enrichment fields

## Technical Details

### Files
- `index.html` - Main HTML structure
- `carol_cleaner.css` - Styling
- `carol_cleaner.js` - Data processing and interaction logic

### Browser Compatibility
Works in modern browsers with JavaScript enabled. No server required - runs entirely in the browser.

### Data Privacy
All processing happens locally in your browser. No data is uploaded to external servers.

## Development

The tool uses vanilla JavaScript with no external dependencies beyond Google Fonts (Inter and IBM Plex Mono).

### Key Functions
- `cleanCSV()` - Parses and processes CAROL CSV exports
- `cleanJSON()` - Processes optional JSON enrichment data
- `joinData()` - Matches CSV and JSON records by SRID
- `renderTable()` - Displays paginated, sortable data view
- `openModal()` - Shows detailed recommendation view

## Credits

Code by Cat Murphy  
Howard Center for Investigative Journalism · University of Maryland

## Repository

[github.com/catelizabethmurphy/nicar26](https://github.com/catelizabethmurphy/nicar26)

## License

MIT License - feel free to use and adapt for your own projects.
