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
      chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    }
    
    handleTabUpdated(tabId, changeInfo, tab) {
      if (changeInfo.status === 'complete' && tab.url) {
        const site = new URL(tab.url).hostname;
        if (this.distractingSites.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(tab.url);
        })) {
          console.log('MindTapManager: Detected distracting site, opening popup for', site);
          this.openPopup(site);
        }
      }
    }
    
    handleMessage(message, sender, sendResponse) {
      console.log('MindTapManager: Received message', message);
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
          
        case 'stop_timer':
          this.stopTimer(message.url);
          sendResponse({ success: true });
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
          console.log('MindTapManager: Timer active for', url, 'Remaining:', remaining);
          sendResponse({
            active: true,
            remaining,
            total: siteData.mins * 60 * 1000
          });
        } else {
          console.log('MindTapManager: No active timer for', url);
          sendResponse({ active: false });
        }
      });
    }
    
    openPopup(url) {
      chrome.windows.getLastFocused({ populate: true }, (window) => {
        const tab = window.tabs.find(t => 
          t.active && this.distractingSites.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(t.url);
          }));
        
        if (tab) {
          console.log('MindTapManager: Opening popup for tab', tab.id);
          chrome.windows.update(window.id, { focused: true });
          chrome.tabs.update(tab.id, { active: true }, () => {
            chrome.action.openPopup();
          });
        } else {
          console.log('MindTapManager: No matching tab found for', url);
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
            console.log('MindTapManager: Snoozed timer for', url);
            this.createOrUpdateTimer(url, mindtapData[url]);
            
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
    
    stopTimer(url) {
      chrome.storage.local.get('mindtap', (data) => {
        const mindtapData = data.mindtap || {};
        if (mindtapData[url]) {
          delete mindtapData[url];
          chrome.storage.local.set({ mindtap: mindtapData }, () => {
            console.log('MindTapManager: Timer stopped for', url);
            this.clearTimer(url);
            chrome.tabs.query({ url: `*://${url}/*` }, (tabs) => {
              tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'stop_timer',
                  url
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
          console.log('MindTapManager: Tab closed, clearing timer for', site);
          this.clearTimer(site);
        }
      });
    }
    
    handleStorageChange(changes, namespace) {
      if (namespace === 'local' && changes.mindtap?.newValue) {
        const mindtapData = changes.mindtap.newValue;
        
        for (const [site, siteData] of Object.entries(mindtapData)) {
          if (this.distractingSites.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(`http://${site}`);
          }) && siteData.startTime) {
            console.log('MindTapManager: Storage changed, updating timer for', site);
            this.createOrUpdateTimer(site, siteData);
          }
        }
      }
    }
    
    handleNotificationClick(notificationId, buttonIndex) {
      if (buttonIndex === 0) {
        chrome.storage.local.get('mindtap', (data) => {
          const mindtapData = data.mindtap || {};
          const site = Object.keys(mindtapData).find(s => 
            this.distractingSites.some(pattern => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(`http://${s}`);
            }));
          
          if (site) {
            console.log('MindTapManager: Notification clicked, opening popup for', site);
            this.openPopup(site);
          }
        });
      } else if (buttonIndex === 1) {
        chrome.storage.local.get('mindtap', (data) => {
          const mindtapData = data.mindtap || {};
          const site = Object.keys(mindtapData).find(s => 
            this.distractingSites.some(pattern => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(`http://${s}`);
            }));
          
          if (site) {
            console.log('MindTapManager: Notification clicked, snoozing for', site);
            this.snoozeTimer(site);
          }
        });
      }
    }
    
    createOrUpdateTimer(site, siteData) {
      this.clearTimer(site);
      
      const remainingTime = siteData.mins * 60 * 1000 - (Date.now() - siteData.startTime);
      
      if (remainingTime <= 0) {
        console.log('MindTapManager: Timer completed for', site);
        this.triggerTimerCompletion(site, siteData);
        return;
      }
      
      console.log('MindTapManager: Creating timer for', site, 'Remaining:', remainingTime);
      this.activeTimers[site] = {
        timeout: setTimeout(() => {
          this.triggerTimerCompletion(site, siteData);
        }, remainingTime),
        
        interval: setInterval(() => {
          const elapsed = (Date.now() - siteData.startTime) / 60000;
          
          if (elapsed >= 5 && !this.activeTimers[site].reminded) {
            console.log('MindTapManager: Sending reminder for', site);
            this.sendReminderNotification(site);
            this.activeTimers[site].reminded = true;
            setTimeout(() => {
              if (this.activeTimers[site]) {
                this.activeTimers[site].reminded = false;
              }
            }, 5 * 60 * 1000);
          }
        }, 60000)
      };
    }
    
    clearTimer(site) {
      if (this.activeTimers[site]) {
        clearTimeout(this.activeTimers[site].timeout);
        clearInterval(this.activeTimers[site].interval);
        delete this.activeTimers[site];
        console.log('MindTapManager: Timer cleared for', site);
      }
    }
    
    triggerTimerCompletion(site, siteData) {
      console.log('MindTapManager: Triggering timer completion for', site);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon16.png',
        title: 'MindTap Nudge',
        message: 'Break time is done. You’ve got this—let’s focus again!',
        buttons: [
          { title: 'Open MindTap' },
          { title: 'Snooze 5 min' }
        ],
        priority: 2
      });
      
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
      
      chrome.storage.local.get('mindtap', (data) => {
        const mindtapData = data.mindtap || {};
        delete mindtapData[site];
        chrome.storage.local.set({ mindtap: mindtapData });
      });
      
      chrome.tabs.query({ url: `*://${site}/*` }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'trigger_popup',
            url: site
          });
        });
      });
      
      this.clearTimer(site);
    }
    
    sendReminderNotification(site) {
      console.log('MindTapManager: Sending reminder notification for', site);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon16.png',
        title: 'MindTap Reminder',
        message: 'Break time is done. You’ve got this—let’s focus again!',
        buttons: [
          { title: 'Open MindTap' },
          { title: 'Snooze 5 min' }
        ]
      });
    }
}

const mindTapManager = new MindTapManager();