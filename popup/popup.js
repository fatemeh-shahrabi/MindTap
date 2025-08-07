document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const purposeBtns = document.querySelectorAll('.purpose-btn');
    const timeOptions = document.querySelectorAll('.time-option');
    const customMinutesInput = document.getElementById('customMinutes');
    const startTimerBtn = document.getElementById('startTimer');
    const stopTimerBtn = document.getElementById('stopTimer');
    const snoozeTimerBtn = document.getElementById('snoozeTimer');
    const timerDisplay = document.getElementById('timerDisplay');
    const promptSection = document.getElementById('promptSection');
    const timeSelection = document.getElementById('timeSelection');
    const successAnimation = document.getElementById('successAnimation');
    const progressCircle = document.querySelector('.progress-ring__circle');
    const countdownDisplay = document.getElementById('countdown');
    
    // State
    let selectedPurpose = null;
    let selectedMinutes = null;
    let currentTimer = null;
    
    // Initialize
    initProgressRing();
    checkActiveTimer();
    
    // Event Listeners
    purposeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPurpose = btn.dataset.purpose;
        purposeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        timeSelection.classList.remove('hidden');
        
        // Default time selection based on purpose
        if (selectedPurpose === 'work') {
          selectTimeOption(15);
        } else {
          selectTimeOption(5);
        }
      });
    });
    
    timeOptions.forEach(option => {
      option.addEventListener('click', () => {
        selectTimeOption(parseInt(option.dataset.minutes));
      });
    });
    
    customMinutesInput.addEventListener('input', () => {
      if (customMinutesInput.value) {
        selectTimeOption(parseInt(customMinutesInput.value));
      }
    });
    
    startTimerBtn.addEventListener('click', startTimer);
    stopTimerBtn.addEventListener('click', stopTimer);
    snoozeTimerBtn.addEventListener('click', snoozeTimer);
    
    // Functions
    function initProgressRing() {
      const radius = progressCircle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
      progressCircle.style.strokeDashoffset = circumference;
    }
    
    function selectTimeOption(minutes) {
      timeOptions.forEach(opt => {
        opt.classList.toggle('active', parseInt(opt.dataset.minutes) === minutes);
      });
      selectedMinutes = minutes;
    }
    
    function checkActiveTimer() {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        
        const site = new URL(tabs[0].url).hostname;
        chrome.storage.local.get('mindtap', (data) => {
          const siteData = data.mindtap?.[site] || {};
          
          if (siteData.startTime && Date.now() - siteData.startTime <= siteData.mins * 60 * 1000) {
            // Show active timer
            promptSection.classList.add('hidden');
            timerDisplay.classList.remove('hidden');
            startCountdown(siteData.startTime, siteData.mins * 60 * 1000);
          }
        });
      });
    }
    
    function startCountdown(startTime, duration) {
      if (currentTimer) clearInterval(currentTimer);
      
      const updateCountdown = () => {
        const elapsed = Date.now() - startTime;
        const remaining = duration - elapsed;
        
        if (remaining <= 0) {
          clearInterval(currentTimer);
          timerDisplay.classList.add('hidden');
          promptSection.classList.remove('hidden');
          return;
        }
        
        // Update display
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        countdownDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Update progress ring
        const radius = progressCircle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (elapsed / duration) * circumference;
        progressCircle.style.strokeDashoffset = offset;
        
        // Change color based on remaining time
        const percentage = remaining / duration;
        if (percentage > 0.5) {
          progressCircle.style.stroke = '#22c55e'; // Green
        } else if (percentage > 0.2) {
          progressCircle.style.stroke = '#f59e0b'; // Orange
        } else {
          progressCircle.style.stroke = '#ef4444'; // Red
        }
      };
      
      updateCountdown();
      currentTimer = setInterval(updateCountdown, 1000);
    }
    
    function startTimer() {
      if (!selectedPurpose || !selectedMinutes) {
        alert('Please select both purpose and time!');
        return;
      }
      
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        
        const site = new URL(tabs[0].url).hostname;
        const timerData = {
          startTime: Date.now(),
          mins: selectedMinutes,
          purpose: selectedPurpose
        };
        
        chrome.storage.local.get(['mindtap', 'mindtap_points'], (data) => {
          const mindtapData = data.mindtap || {};
          mindtapData[site] = timerData;
          
          // Award points for work mode
          const points = data.mindtap_points || 0;
          const newPoints = selectedPurpose === 'work' ? points + selectedMinutes : points;
          
          chrome.storage.local.set({
            mindtap: mindtapData,
            mindtap_points: newPoints
          }, () => {
            showSuccessAnimation();
            
            // Switch to timer display
            promptSection.classList.add('hidden');
            timerDisplay.classList.remove('hidden');
            startCountdown(timerData.startTime, timerData.mins * 60 * 1000);
            
            // Close popup after delay
            setTimeout(() => window.close(), 1500);
          });
        });
      });
    }
    
    function stopTimer() {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        
        const site = new URL(tabs[0].url).hostname;
        chrome.storage.local.get('mindtap', (data) => {
          const mindtapData = data.mindtap || {};
          delete mindtapData[site];
          
          chrome.storage.local.set({mindtap: mindtapData}, () => {
            clearInterval(currentTimer);
            timerDisplay.classList.add('hidden');
            promptSection.classList.remove('hidden');
          });
        });
      });
    }
    
    function snoozeTimer() {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        
        const site = new URL(tabs[0].url).hostname;
        chrome.storage.local.get('mindtap', (data) => {
          const mindtapData = data.mindtap || {};
          if (mindtapData[site]) {
            mindtapData[site].mins += 5;
            mindtapData[site].startTime = Date.now();
            
            chrome.storage.local.set({mindtap: mindtapData}, () => {
              startCountdown(mindtapData[site].startTime, mindtapData[site].mins * 60 * 1000);
              showSuccessAnimation();
            });
          }
        });
      });
    }
    
    function showSuccessAnimation() {
      successAnimation.classList.add('active');
      setTimeout(() => {
        successAnimation.classList.remove('active');
      }, 2000);
    }
  });