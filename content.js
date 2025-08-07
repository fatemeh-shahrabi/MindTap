// Enhanced timer display with better UX
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
      this.createTimerElement();
      this.setupEventListeners();
      this.checkTimerStatus();
      setInterval(() => this.checkTimerStatus(), 2000);
    }
    
    createTimerElement() {
      if (document.getElementById('mindtap-timer')) return;
      
      this.timerElement = document.createElement('div');
      this.timerElement.id = 'mindtap-timer';
      this.timerElement.className = 'mindtap-minimized';
      this.timerElement.innerHTML = `
        <div class="mindtap-header">
          <span class="mindtap-time">00:00</span>
          <div class="mindtap-controls">
            <button class="mindtap-minimize">−</button>
            <button class="mindtap-close">×</button>
          </div>
        </div>
        <div class="mindtap-body hidden">
          <div class="mindtap-progress">
            <div class="mindtap-progress-bar"></div>
          </div>
          <div class="mindtap-message">Stay focused! You got this 💪</div>
          <button class="mindtap-action-btn">Extend Time</button>
        </div>
      `;
      
      document.body.appendChild(this.timerElement);
      this.loadPosition();
    }
    
    setupEventListeners() {
      // Header drag
      const header = this.timerElement.querySelector('.mindtap-header');
      header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('mindtap-minimize') || 
            e.target.classList.contains('mindtap-close')) return;
            
        this.isDragging = true;
        const rect = this.timerElement.getBoundingClientRect();
        this.offsetX = e.clientX - rect.left;
        this.offsetY = e.clientY - rect.top;
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        this.timerElement.style.left = `${e.clientX - this.offsetX}px`;
        this.timerElement.style.top = `${e.clientY - this.offsetY}px`;
        this.savePosition();
      });
      
      document.addEventListener('mouseup', () => {
        this.isDragging = false;
      });
      
      // Minimize button
      this.timerElement.querySelector('.mindtap-minimize').addEventListener('click', () => {
        this.toggleMinimize();
      });
      
      // Close button
      this.timerElement.querySelector('.mindtap-close').addEventListener('click', () => {
        this.timerElement.remove();
      });
      
      // Action button
      const actionBtn = this.timerElement.querySelector('.mindtap-action-btn');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: 'snooze_timer',
            url: window.location.hostname
          });
        });
      }
    }
    
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      this.timerElement.classList.toggle('mindtap-minimized', this.isMinimized);
      this.timerElement.querySelector('.mindtap-body').classList.toggle('hidden', this.isMinimized);
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
      });
    }
    
    checkTimerStatus() {
      if (!this.timerElement) return;
      
      chrome.runtime.sendMessage({
        action: 'check_timer',
        url: window.location.hostname
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error checking timer:', chrome.runtime.lastError);
          return;
        }
        
        if (response.active) {
          this.updateTimerDisplay(response.remaining, response.total);
        } else {
          this.timerElement.classList.add('hidden');
        }
      });
    }
    
    updateTimerDisplay(remainingMs, totalMs) {
      this.timerElement.classList.remove('hidden');
      
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      this.timerElement.querySelector('.mindtap-time').textContent = timeText;
      
      // Update progress bar
      const percentage = (remainingMs / totalMs) * 100;
      this.timerElement.querySelector('.mindtap-progress-bar').style.width = `${percentage}%`;
      
      // Update color based on remaining time
      if (percentage > 50) {
        this.timerElement.style.borderColor = '#22c55e'; // Green
        this.timerElement.querySelector('.mindtap-progress-bar').style.backgroundColor = '#22c55e';
      } else if (percentage > 20) {
        this.timerElement.style.borderColor = '#f59e0b'; // Orange
        this.timerElement.querySelector('.mindtap-progress-bar').style.backgroundColor = '#f59e0b';
      } else {
        this.timerElement.style.borderColor = '#ef4444'; // Red
        this.timerElement.querySelector('.mindtap-progress-bar').style.backgroundColor = '#ef4444';
        
        // Pulse animation when time is running out
        this.timerElement.classList.add('pulse');
      }
    }
  }
  
  // Initialize when page loads
  window.addEventListener('load', () => {
    const distractingSites = [
      'www.youtube.com',
      'www.instagram.com',
      'www.tiktok.com',
      'www.pinterest.com'
    ];
    
    if (distractingSites.includes(window.location.hostname)) {
      new MindTapTimer();
    }
  });
  
  // Handle messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'trigger_popup') {
      chrome.runtime.sendMessage({
        action: 'open_popup',
        url: message.url
      });
      
      sendResponse({ success: true });
    }
    
    if (message.action === 'update_timer') {
      sendResponse({ active: true, remaining: message.remaining, total: message.total });
    }
    
    return true;
  });