# Event Inventory Tracker (GitHub Pages + Google Calendar + Google Sheets)

A simple, beginner-friendly web app for managing event inventory assignments and preventing overbooking during overlapping event times.

## Architecture

This project is designed for **GitHub Pages hosting**:
- Front-end only: HTML/CSS/JavaScript
- Google Calendar API: source of confirmed events
- Google Sheets API: source of inventory + assignments data

### Important security note
Using only GitHub Pages means your browser-facing API key is public. Reading public data is straightforward, but writing to Google Sheets requires OAuth tokens in-browser.

**Safer/easier alternative**: add a small Google Apps Script backend to keep write credentials server-side. That is usually easier to secure and maintain for multi-user teams.

## Google Sheet setup
Create one sheet with tabs:

### Inventory tab columns (row 1)
`ItemID, ItemName, Category, TotalQuantity, Notes, Active`

### Assignments tab columns (row 1)
`AssignmentID, CalendarEventID, EventName, EventDate, StartTime, EndTime, ItemID, ItemName, QuantityAssigned, Notes, CreatedAt, UpdatedAt`

### Settings tab columns (row 1)
`SettingName, SettingValue`

## Google Calendar setup
- Use one calendar ID.
- App filters to `status = confirmed`.
- Supports timed events and all-day/multi-day events.

## API setup
1. In Google Cloud Console:
   - Enable **Google Calendar API** and **Google Sheets API**.
   - Create a browser API key (restrict by HTTP referrer when deployed).
   - (For writing) configure OAuth client and scopes:
     - `https://www.googleapis.com/auth/spreadsheets`
2. Make sure target sheet is accessible to intended users.

## App configuration
1. Copy `config.example.js` to `config.js`.
2. Fill values:
   - `calendarId`
   - `googleApiKey`
   - `spreadsheetId`
   - `timezone` (`America/Toronto` for Eastern Time)

## Local run
Open `index.html` in a browser or use a simple static server.

## GitHub Pages deployment
1. Push repository to GitHub.
2. Go to **Settings → Pages**.
3. Source: deploy from `main` branch root.
4. Save and open the published URL.

## Overbooking prevention logic
For a selected event + item:
1. Read item `TotalQuantity` from Inventory.
2. Find assignments for the same `ItemID`.
3. Keep only overlapping assignments using:
   - `ExistingStart < NewEnd AND ExistingEnd > NewStart`
4. Sum overlapping assigned quantity.
5. `Available = TotalQuantity - OverlappingAssigned`
6. If requested quantity exceeds available, block save and show clear error.

## User experience features
- Dashboard sections: Today, Upcoming, Warnings, Overbookings
- Event cards with “Manage Items” button
- Assignment form shows live availability
- Friendly save and error messages
- Setup list in two views: By Event and By Item
- Responsive layout and print-friendly setup view

## Known limitations in pure GitHub Pages mode
- Writing to Google Sheets requires OAuth token handling in browser.
- Without a backend, token management and access control are harder.

