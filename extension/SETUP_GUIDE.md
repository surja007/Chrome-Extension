# JobPilot setup guide

## Install

1. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
2. Click **Load unpacked** and select this `extension` directory.
3. Pin JobPilot if you want quick access.
4. After updating the source, click **Reload** on the extension card and refresh any job tabs that were already open.

## Set up your profile

Open the JobPilot popup, enter your name, email, and phone, then click **Save Profile**. The Settings page shares the same profile and local settings. Auto-submit is off by default.

## Apply to one LinkedIn job

Open a LinkedIn job detail page that has an Easy Apply button, open JobPilot, and click **Start**. Review the fields. If a required answer is unknown, fill it yourself. If auto-submit is enabled, JobPilot submits only after LinkedIn shows a confirmation or closes the application modal.

## Use the queue

Open a LinkedIn, Naukri, or Indeed search page, open **Queue**, and click **Scrape Jobs**. Listings from all three sites can be collected, but automatic form processing currently supports LinkedIn Easy Apply only. Start the queue to process pending LinkedIn jobs. With auto-submit off, JobPilot brings a review-needed job tab forward and pauses the queue; submit it manually, then start the queue again for remaining jobs.

## If a job page is not detected

- Reload the extension at `chrome://extensions/`.
- Refresh the job page to inject the updated content script.
- Confirm the tab is on a supported HTTPS job site and, for automatic application, a LinkedIn job detail page with Easy Apply.
- Open the extension's service-worker inspector from `chrome://extensions/` to see background/queue errors.
