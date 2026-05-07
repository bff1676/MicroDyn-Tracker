# MicroDyn Medicare Advantage Release Tracker

This is a small SQLite-backed application for tracking versions, dates, release status, reports, and document attachments for the seven MicroDyn Medicare Advantage claim types.

## Run

```powershell
npm.cmd start
```

Open <http://localhost:3000>.

If your PowerShell execution policy allows npm scripts, `npm start` works too.

## Database

The schema is in `schema.sql`. The app initializes `data/microdyn_tracker.sqlite` automatically on startup.

The seeded defaults include seven claim types. The first four include Editor, Grouper, and Pricer components. The last three are Pricer-only. Rename the placeholder claim types from the Claim Types tab.

## Reports

The Reports tab supports browser printing plus:

- CSV export: `/api/reports/releases.csv`
- JSON export: `/api/reports/releases.json`

## Attachments

Uploaded documents are stored in `uploads/`. Attachment metadata is stored in SQLite and linked to a release.

## Component Availability

Use the Claim Types tab to turn individual components on or off. Inactive components are hidden from the dashboard and release form, but historical release records stay in the database.

Outpatient Grouper and ESRD Grouper are automatically marked inactive when the app starts.

## Last Update Date

Each component has a system-maintained last update date. The app updates this field automatically whenever a release is inserted or edited for that component.

## Editing Releases

The Announce Date defines a release for each component. If you save a component update with the same Announce Date later, the app updates that existing release record instead of creating a duplicate. Blank fields retain the previously saved values for that component and Announce Date, so adding a later milestone does not wipe out version, Dev, PPMO, PROD, notes, or status values. You can also use the Release tab's Load Existing Release field, or pick the same component and Announce Date, to pull a saved row back into the form and edit it directly.

## Installation Package

Build a portable package with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-package.ps1
```

The package is created at `dist\MicroDynReleaseTracker.zip`. On another Windows system, unzip it and run `start-tracker.bat`. The target system needs Node.js 24 or newer because the app uses built-in SQLite support.
