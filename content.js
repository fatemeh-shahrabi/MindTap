class MindTapTimer {
    constructor() {
      this.timerElement = null;
      this.isDragging = false;
      this.offsetX = 0;
      this.offsetY = 0;
      this.isMinimized = false;
      this.init();
    }
    
    init() {
      console.log('MindTapTimer: Initializing for', window.location.hostname);
      this.createTimerElement();
      this.setupEventListeners();
      this.checkTimerStatus();
      setInterval(() => this.checkTimerStatus(), 1000); // Reduced interval for faster updates
    }
    
    createTimerElement() {
      if (document.getElementById('mindtap-timer')) {
        console.log('MindTapTimer: Timer element already exists');
        return;
      }
      
      console.log('MindTapTimer: Creating timer element');
      this.timerElement = document.createElement('div');
      this.timerElement.id = 'mindtap-timer';
      this.timerElement.className = 'mindtap-minimized';
      this.timerElement.innerHTML = `
        <div class="mindtap-header">
          <img src="${chrome.runtime.getURL('icons/the main.png')}" alt="MindTap Logo" class="mindtap-logo">
          <span class="mindtap-time">00:00</span>
          <div class="mindtap-controls">
            <button class="mindtap-minimize">−</button>
            <button class="mindtap-close">×</button>
          </div>
        </div>
        <div class="mindtap-body hidden">
          <div class="timer-circle">
            <svg viewBox="0 0 100 100">
              <circle class="progress-ring__circle" stroke="#22c55e" stroke-width="8" fill="white" r="40" cx="50" cy="50"/>
            </svg>
            <span class="mindtap-time-display">00:00</span>
          </div>
          <img src="${chrome.runtime.getURL('icons/stop button.png')}" alt="Pause Button" class="pause-btn">
        </div>
      `;
      
      document.body.appendChild(this.timerElement);
      console.log('MindTapTimer: Timer element appended to body');
      this.loadPosition();
    }
    
    setupEventListeners() {
      console.log('MindTapTimer: Setting up event listeners');
      const header = this.timerElement.querySelector('.mindtap-header');
      header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('mindtap-minimize') || 
            e.target.classList.contains('mindtap-close')) {
          console.log('MindTapTimer: Clicked on minimize/close button, ignoring drag');
          return;
        }
        
        console.log('MindTapTimer: Starting drag');
        this.isDragging = true;
        const rect = this.timerElement.getBoundingClientRect();
        this.offsetX = e.clientX - rect.left;
        this.offsetY = e.clientY - rect.top;
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        console.log('MindTapTimer: Dragging to', e.clientX, e.clientY);
        this.timerElement.style.left = `${e.clientX - this.offsetX}px`;
        this.timerElement.style.top = `${e.clientY - this.offsetY}px`;
        this.savePosition();
      });
      
      document.addEventListener('mouseup', () => {
        if (this.isDragging) {
          console.log('MindTapTimer: Drag ended');
          this.isDragging = false;
        }
      });
      
      this.timerElement.querySelector('.mindtap-minimize').addEventListener('click', () => {
        console.log('MindTapTimer: Toggling minimize state');
        this.toggleMinimize();
      });
      
      this.timerElement.querySelector('.mindtap-close').addEventListener('click', () => {
        console.log('MindTapTimer: Closing timer');
        this.timerElement.remove();
      });
      
      const pauseBtn = this.timerElement.querySelector('.pause-btn');
      if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
          console.log('MindTapTimer: Pause button clicked');
          chrome.runtime.sendMessage({
            action: 'stop_timer',
            url: window.location.hostname
          });
          this.timerElement.remove();
        });
      }
    }
    
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      this.timerElement.classList.toggle('mindtap-minimized', this.isMinimized);
      this.timerElement.querySelector('.mindtap-body').classList.toggle('hidden', this.isMinimized);
      console.log('MindTapTimer: Minimized state:', this.isMinimized);
      this.savePosition();
    }
    
    savePosition() {
      const rect = this.timerElement.getBoundingClientRect();
      chrome.storage.local.set({
        [`mindtap_position_${window.location.hostname}`]: {
          x: rect.left,
          y: rect.top,
          minimized: this.isMinimized
        }
      }, () => {
        console.log('MindTapTimer: Position saved', rect.left, rect.top);
      });
    }
    
    loadPosition() {
      chrome.storage.local.get(`mindtap_position_${window.location.hostname}`, (data) => {
        const pos = data[`mindtap_position_${window.location.hostname}`] || { x: 20, y: 20 };
        this.timerElement.style.left = `${pos.x}px`;
        this.timerElement.style.top = `${pos.y}px`;
        this.isMinimized = pos.minimized || false;
        this.timerElement.classList.toggle('mindtap-minimized', this.isMinimized);
        this.timerElement.querySelector('.mindtap-body').classList.toggle('hidden', this.isMinimized);
        console.log('MindTapTimer: Position loaded', pos.x, pos.y, 'Minimized:', this.isMinimized);
      });
    }
    
    checkTimerStatus() {
      if (!this.timerElement) {
        console.log('MindTapTimer: Timer element not found, recreating');
        this.createTimerElement();
        this.setupEventListeners();
      }
      
      console.log('MindTapTimer: Checking timer status for', window.location.hostname);
      chrome.runtime.sendMessage({
        action: 'check_timer',
        url: window.location.hostname
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('MindTapTimer: Error checking timer:', chrome.runtime.lastError);
          return;
        }
        
        console.log('MindTapTimer: Timer status response', response);
        if (response.active) {
          this.updateTimerDisplay(response.remaining, response.total);
        } else {
          this.timerElement.classList.add('hidden');
          console.log('MindTapTimer: No active timer, hiding');
        }
      });
    }
    
    updateTimerDisplay(remainingMs, totalMs) {
      this.timerElement.classList.remove('hidden');
      console.log('MindTapTimer: Updating display, remaining:', remainingMs, 'total:', totalMs);
      
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      this.timerElement.querySelector('.mindtap-time').textContent = timeText;
      this.timerElement.querySelector('.mindtap-time-display').textContent = timeText;
      
      const percentage = (remainingMs / totalMs) * 100;
      const radius = this.timerElement.querySelector('.progress-ring__circle').r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percentage / 100) * circumference;
      this.timerElement.querySelector('.progress-ring__circle').style.strokeDashoffset = offset;
      
      if (percentage > 50) {
        this.timerElement.querySelector('.progress-ring__circle').style.stroke = '#22c55e';
      } else if (percentage > 20) {
        this.timerElement.querySelector('.progress-ring__circle').style.stroke = '#f59e0b';
      } else {
        this.timerElement.querySelector('.progress-ring__circle').style.stroke = '#ef4444';
        this.timerElement.classList.add('pulse');
      }
    }
}

window.addEventListener('load', () => {
  const distractingSites = [
    'www.youtube.com',
    'm.youtube.com',
    'www.tiktok.com',
    'www.instagram.com',
    'www.snapchat.com',
    'www.tumblr.com',
    'www.pinterest.com',
    'www.discord.com',
    'discord.com',
    'web.whatsapp.com',
    'www.reddit.com',
    'www.twitch.tv'
  ];
  
  console.log('MindTapTimer: Checking if', window.location.hostname, 'is a distracting site');
  if (distractingSites.includes(window.location.hostname)) {
    console.log('MindTapTimer: Initializing timer for distracting site');
    new MindTapTimer();
  } else {
    console.log('MindTapTimer: Not a distracting site, skipping initialization');
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('MindTapTimer: Received message', message);
  if (message.action === 'trigger_popup') {
    chrome.runtime.sendMessage({
      action: 'open_popup',
      url: message.url
    });
    sendResponse({ success: true });
  }
  
  if (message.action === 'timer_updated') {
    sendResponse({ active: true, remaining: message.remaining, total: message.total });
  }
  
  if (message.action === 'stop_timer') {
    const timerElement = document.getElementById('mindtap-timer');
    if (timerElement) {
      timerElement.remove();
      console.log('MindTapTimer: Timer stopped and removed');
    }
    sendResponse({ success: true });
  }
  
  return true;
});