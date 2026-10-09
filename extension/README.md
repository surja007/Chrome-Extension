# JobPilot Chrome Extension

JobPilot is a local Chrome extension for filling LinkedIn Easy Apply forms and keeping a queue/history of job listings. Profile data stays in Chrome storage; there is no remote account or application server.

## What is currently supported

- **LinkedIn Easy Apply:** fill common profile fields, move through application steps, and optionally submit after confirmation.
- **Manual review:** auto-submit is off by default. If a required question is unknown or needs a file upload, JobPilot stops safely and leaves the application open for you.
- **Job listing collection:** scrape listings from LinkedIn, Naukri, and Indeed into a local queue.
- **Queue processing:** LinkedIn Easy Apply jobs can be processed by the background service worker. The queue and progress survive closing the popup.
- **History and rate limit:** confirmed submissions are recorded locally and limited to 10 per hour by default.

**Important limitation:** Naukri and Indeed listings can be collected and opened, but automatic form-filling/submission for those sites is not implemented. Their queued jobs are marked unsupported rather than silently treated as applications.

## Install or update

1. Open `chrome://extensions/` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this repository's `extension` folder.
4. After updating an already-installed copy, click **Reload** on the extension card.
5. Refresh any LinkedIn, Naukri, or Indeed tabs that were open before installing/reloading. Chrome only injects the current content scripts into newly loaded pages.

## Quick start: one LinkedIn job

1. Open a LinkedIn job detail page that has an **Easy Apply** button.
2. Open the JobPilot popup and save your profile.
3. Click **Start**. JobPilot opens Easy Apply if it is not already open, fills fields it can confidently map, and advances through the form.
4. By default, JobPilot stops at review. You submit manually. To enable automatic submission, turn on **Auto-submit** in the popup or Settings page.

JobPilot does not guess answers to custom questions or bypass file-upload controls. If a required answer is missing, the popup flow waits for you; in queue processing, the job tab is brought forward for review and the queue pauses.

## Queue mode

1. Open a LinkedIn, Naukri, or Indeed job search page in a tab.
2. Open **Queue** from the popup and choose **Scrape Jobs**. LinkedIn scraping keeps Easy Apply listings only.
3. Start the queue. The background worker opens and processes LinkedIn job pages, even if the popup closes.
4. With auto-submit off, the queue stops at a review-required job and leaves its tab open. Review/submit it, then start the queue again to process remaining pending jobs.

The default between-application delay is 30–120 seconds, and the hourly cap is 10 confirmed submissions. These limits are intentional; speeding up typing does not remove platform rate limits.

## Profile and settings

The popup stores the fields most commonly used by LinkedIn forms: name, email, phone, LinkedIn URL, city, experience, current company, job title, and cover letter. The Settings page includes additional profile and filtering fields. Both pages share the same local profile and settings data.

If you previously used an older version, reload the extension and reopen the Settings page. Legacy profile keys and settings stored in Chrome Sync are migrated to the current local format.

## Troubleshooting

- **“Could not reach this page” / no content script:** reload the extension, then refresh the job tab. Confirm the URL is a supported site.
- **Easy Apply button not found:** open an actual job detail page, not just the search results, and confirm the listing has Easy Apply.
- **A field is left blank:** complete it yourself; JobPilot intentionally does not guess custom questions, demographic answers, or file uploads.
- **Queue job marked unsupported:** automatic application is currently LinkedIn Easy Apply only. Naukri/Indeed can be scraped and opened manually.
- **Extension changes do not appear:** click **Reload** on `chrome://extensions/`, then refresh the open job tabs.
- **Check runtime errors:** on `chrome://extensions/`, open the JobPilot **service worker** inspector for background/queue errors; inspect the job page console for content-script errors.

## Privacy

Profile, settings, queue, rate-limit timestamps, and application history are stored in `chrome.storage.local` (with one-time migration from older Sync settings). Job listings are read from the open job pages. The extension does not send profile data to a JobPilot server.

## Project files

- `manifest.json` — Manifest V3 permissions, service worker, commands, and content-script matches
- `background.js` — background message routing, tabs, alarms, and install-time migrations
- `auto-apply-orchestrator.js` — persistent queue processor
- `content.js` / `utils.js` — LinkedIn Easy Apply state machine and form helpers
- `job-scraper.js` / `job-queue-manager.js` — listing collection and local queue storage
- `popup.html` / `popup.js` — profile and quick actions
- `queue-manager.html` / `queue-manager.js` — queue UI
- `dashboard.html` / `dashboard.js` — application history and analytics
- `settings.html` / `settings.js` — profile and preferences
