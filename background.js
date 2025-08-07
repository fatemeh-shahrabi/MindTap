// Enhanced background script with better state management
class MindTapManager {
    constructor() {
      this.activeTimers = {};
      this.distractingSites = [
        "*://www.youtube.com/*",
        "*://m.youtube.com/*",
        "*://www.tiktok.com/*",
        "*://www.instagram.com/*",
        "*://www.snapchat.com/*",
        "*://www.tumblr.com/*",
        "*://www.pinterest.com/*",
        "*://www.discord.com/*",
        "*://discord.com/*",
        "*://web.whatsapp.com/*",
        "*://www.reddit.com/*",
        "*://www.twitch.tv/*"
      ];
      
      this.initListeners();
    }
    
    initListeners() {
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
      chrome.tabs.onRemoved.addListener(this.handleTabClosed.bind(this));
      chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
      chrome.notifications.onButtonClicked.addListener(this.handleNotificationClick.bind(this));
    }
    
    handleMessage(message, sender, sendResponse) {
      switch (message.action) {
        case 'check_timer':
          this.checkTimerStatus(message.url, sendResponse);
          return true;
        
        case 'open_popup':
          this.openPopup(message.url);
          break;
          
        case 'snooze_timer':
          this.snoozeTimer(message.url);
          break;
          
        case 'get_points':
          chrome.storage.local.get('mindtap_points', (data) => {
            sendResponse({ points: data.mindtap_points || 0 });
          });
          return true;
      }
    }
    
    checkTimerStatus(url, sendResponse) {
      chrome.storage.local.get('mindtap', (data) => {
        const siteData = data.mindtap?.[url] || {};
        
        if (siteData.startTime && Date.now() - siteData.startTime <= siteData.mins * 60 * 1000) {
          const remaining = siteData.mins * 60 * 1000 - (Date.now() - siteData.startTime);
          sendResponse({
            active: true,
            remaining,
            total: siteData.mins * 60 * 1000
          });
        } else {
          sendResponse({ active: false });
        }
      });
    }
    
    openPopup(url) {
      chrome.windows.getLastFocused({ populate: true }, (window) => {
        const tab = window.tabs.find(t => 
          t.active && this.distractingSites.includes(new URL(t.url).hostname));
        
        if (tab) {
          chrome.windows.update(window.id, { focused: true });
          chrome.tabs.update(tab.id, { active: true }, () => {
            chrome.action.openPopup();
          });
        }
      });
    }
    
    snoozeTimer(url) {
      chrome.storage.local.get('mindtap', (data) => {
        const mindtapData = data.mindtap || {};
        if (mindtapData[url]) {
          mindtapData[url].mins += 5;
          mindtapData[url].startTime = Date.now();
          
          chrome.storage.local.set({ mindtap: mindtapData }, () => {
            this.createOrUpdateTimer(url, mindtapData[url]);
            
            // Send update to content script
            chrome.tabs.query({ url: `*://${url}/*` }, (tabs) => {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'timer_updated',
                  url,
                  remaining: mindtapData[url].mins * 60 * 1000,
                  total: mindtapData[url].mins * 60 * 1000
                });
              });
            });
          });
        }
      });
    }
    
    handleTabClosed(tabId) {
      chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.url) {
          const site = new URL(tab.url).hostname;
          this.clearTimer(site);
        }
      });
    }
    
    handleStorageChange(changes, namespace) {
      if (namespace === 'local' && changes.mindtap?.newValue) {
        const mindtapData = changes.mindtap.newValue;
        
        for (const [site, siteData] of Object.entries(mindtapData)) {
          if (this.distractingSites.includes(site) && siteData.startTime) {
            this.createOrUpdateTimer(site, siteData);
          }
        }
      }
    }
    
    handleNotificationClick(notificationId, buttonIndex) {
      if (buttonIndex === 0) {
        // Open popup
        chrome.storage.local.get('mindtap', (data) => {
          const mindtapData = data.mindtap || {};
          const site = Object.keys(mindtapData).find(s => 
            this.distractingSites.includes(s));
          
          if (site) {
            this.openPopup(site);
          }
        });
      } else if (buttonIndex === 1) {
        // Snooze
        chrome.storage.local.get('mindtap', (data) => {
          const mindtapData = data.mindtap || {};
          const site = Object.keys(mindtapData).find(s => 
            this.distractingSites.includes(s));
          
          if (site) {
            this.snoozeTimer(site);
          }
        });
      }
    }
    
    createOrUpdateTimer(site, siteData) {
      // Clear existing timer if any
      this.clearTimer(site);
      
      const remainingTime = siteData.mins * 60 * 1000 - (Date.now() - siteData.startTime);
      
      if (remainingTime <= 0) {
        this.triggerTimerCompletion(site, siteData);
        return;
      }
      
      // Set new timer
      this.activeTimers[site] = {
        timeout: setTimeout(() => {
          this.triggerTimerCompletion(site, siteData);
        }, remainingTime),
        
        interval: setInterval(() => {
          const elapsed = (Date.now() - siteData.startTime) / 60000; // in minutes
          
          if (elapsed >= 20 && elapsed < 30 && !this.activeTimers[site].warned20) {
            this.sendWarningNotification(site, 20);
            this.activeTimers[site].warned20 = true;
          } else if (elapsed >= 30 && !this.activeTimers[site].warned30) {
            this.sendWarningNotification(site, 30);
            this.activeTimers[site].warned30 = true;
          }
        }, 60000) // Check every minute
      };
    }
    
    clearTimer(site) {
      if (this.activeTimers[site]) {
        clearTimeout(this.activeTimers[site].timeout);
        clearInterval(this.activeTimers[site].interval);
        delete this.activeTimers[site];
      }
    }
    
    triggerTimerCompletion(site, siteData) {
      // Create notification
      const message = siteData.purpose === 'work'
        ? `Time's up! You said this was for work on ${site}. You sure? 😅`
        : `Hey, you! Ready to get back to your grind or what? 🚀`;
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'MindTap Nudge',
        message,
        buttons: [
          { title: 'Open MindTap' },
          { title: 'Snooze 5 min' }
        ],
        priority: 2
      });
      
      // Log completion
      chrome.storage.local.get('mindtap_logs', (data) => {
        const logs = data.mindtap_logs || [];
        logs.push({
          site,
          purpose: siteData.purpose,
          mins: siteData.mins,
          timestamp: new Date().toISOString()
        });
        chrome.storage.local.set({ mindtap_logs: logs });
      });
      
      // Remove from storage
      chrome.storage.local.get('mindtap', (data) => {
        const mindtapData = data.mindtap || {};
        delete mindtapData[site];
        chrome.storage.local.set({ mindtap: mindtapData });
      });
      
      // Trigger popup in all tabs for this site
      chrome.tabs.query({ url: `*://${site}/*` }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'trigger_popup',
            url: site
          });
        });
      });
      
      // Clear timer
      this.clearTimer(site);
    }
    
    sendWarningNotification(site, mins) {
      const messages = {
        20: `You've been on ${site} for 20 mins. Time to wrap up? ⏳`,
        30: `30 mins on ${site}! Your future self will thank you for focusing. 💪`
      };
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'MindTap Reminder',
        message: messages[mins],
        buttons: [
          { title: 'Open MindTap' },
          { title: 'Snooze 5 min' }
        ]
      });
    }
  }
  
  // Initialize
  const mindTapManager = new MindTapManager();