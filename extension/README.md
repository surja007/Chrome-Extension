# 🚀 JobPilot - FastApply Clone

AI-powered job application automation. Apply to hundreds of jobs with one click across LinkedIn, Naukri, and Indeed.

## ✨ Features

**LinkedIn Easy Apply** - Multi-page form automation with intelligent field detection  
**Smart Form Filling** - AI analyzes fields and fills them correctly  
**Human-like Behavior** - Random delays, typing simulation, mouse movements  
**Answer Memory** - Remembers answers to questions and reuses them  
**Job Queue Manager** - Scrape jobs, add to queue, process automatically  
**Company Blacklist** - Skip companies you don't want  
**Rate Limiting** - Control speed with hourly/daily limits  
**Job Scraper** - Extract jobs from search pages with filters  
**Application Tracking** - Dashboard with statistics and insights  
**Stealth Mode** - Advanced detection avoidance techniques  

## 🎯 Installation

1. Download or clone this repo
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → Select `extension` folder
5. Pin the extension to your toolbar

## 🔥 Quick Start

### Setup Profile
- Click extension icon
- Fill your details (name, email, phone, LinkedIn, etc.)
- Check "Auto-submit after filling" for full automation
- Click **Save Profile**

### Fill Current Job
- Open any job posting
- Click **Fill Current Form** or press `Ctrl+Shift+F`
- Review and submit

### Auto-Apply Mode
- Go to LinkedIn jobs search page
- Click **Auto-Apply Mode** or press `Ctrl+Shift+A`
- Extension applies to jobs automatically

### Job Queue (Advanced)
- Click **Job Queue** in popup
- Click **Scrape Jobs** to extract jobs from page
- Add filters (keywords, exclude terms, platform)
- Click **Start Queue** to process
- Track progress in real-time

## ⚙️ Settings

**Profile**: Name, email, phone, LinkedIn URL, city, job title, experience, company  
**Auto-submit**: Automatically click submit after filling  
**Skip duplicates**: Don't apply to same job twice  
**Save answers**: Remember answers to questions  
**Rate limits**: Max applications per hour/day (default: 10/50)  
**Delays**: Random delay range between actions  

## 📋 How It Works

### LinkedIn Easy Apply
1. Click "Easy Apply" on job
2. Extension detects modal, analyzes fields
3. Fills fields page-by-page (up to 10 pages)
4. Clicks Next → Continue → Review → Submit
5. Handles "Save application?" dialog automatically
6. Tracks successful submission

### Queue Processing
1. Scrape jobs from search results
2. Add to queue with status tracking
3. Process queue with rate limiting
4. Open job → Fill → Submit → Close
5. Random delays between applications
6. Real-time statistics updates

### Answer Memory
- Pattern matching for common questions
- Categories: motivation, salary, relocation, visa, experience
- Auto-learns from responses
- Smart generation based on profile
- Export/import functionality

## 🎨 Keyboard Shortcuts

`Ctrl+Shift+F` - Fill current form  
`Ctrl+Shift+A` - Start auto-apply mode  

## 🛡️ Privacy

- **100% Local** - All data in your browser only
- **No tracking** - Zero external servers
- **Stealth mode** - Human-like behavior
- **Rate limiting** - Prevents spam/flags
- **Open source** - Review code yourself

## ⚠️ Disclaimer

Use responsibly:
- Only apply to relevant positions
- Review before submitting when possible
- Respect platform terms of service
- Use rate limiting to avoid detection
- Educational purposes

## 🆚 vs FastApply

| Feature | FastApply | JobPilot |
|---------|-----------|----------|
| Price | Paid | **Free** |
| LinkedIn Auto | ✅ | ✅ |
| Multi-platform | ✅ | ✅ |
| Job Queue | ✅ | ✅ |
| Answer Memory | ✅ | ✅ |
| Stealth Mode | ✅ | ✅ |
| Open Source | ❌ | **✅** |
| Privacy | Cloud | **Local** |
| Customizable | ❌ | **✅** |

## 🔧 Troubleshooting

**Form not filling?**
- Save profile first
- Refresh page and retry
- Check browser console

**Modal closes immediately?**
- Disable "Auto-submit" in settings
- Extension fills fields only
- You review and submit manually

**Too fast/getting flagged?**
- Increase rate limits
- Enable longer delays
- Use queue processing

## 📦 Structure

```
extension/
├── manifest.json           # Extension config
├── popup.html/js          # Main UI
├── content.js             # Page interaction
├── background.js          # Background tasks
├── linkedin-handler.js    # LinkedIn Easy Apply
├── job-queue-manager.js   # Queue system
├── answer-memory.js       # Answer learning
├── stealth-mode.js        # Human behavior
├── job-scraper.js         # Job extraction
├── queue-manager.html     # Queue UI
├── dashboard.html         # Analytics
└── settings.html          # Config
```

## 📄 License

MIT License - Free to use and modify

---

**Built to help job seekers worldwide. Good luck! 🎯**
