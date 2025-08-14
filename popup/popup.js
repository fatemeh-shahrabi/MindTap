document.addEventListener("DOMContentLoaded", () => {
    const welcomeSection = document.getElementById('welcomeSection');
    const workSection = document.getElementById('workSection');
    const funSection = document.getElementById('funSection');
    const timerSection = document.getElementById('timerSection');
    const purposeBtns = document.querySelectorAll('.purpose-btn');
    const customMinutesInput = document.getElementById('customMinutes');
    const submitBtn = document.querySelector('.submit-btn');
    const closeBtn = document.querySelector('.close-btn');
    const pauseBtn = document.querySelector('.pause-btn');
    const countdownDisplay = document.getElementById('countdown');
    const progressCircle = document.querySelector('.progress-ring__circle');
    
    let selectedPurpose = null;
    let selectedMinutes = null;
    let currentTimer = null;
    
    initProgressRing();
    checkActiveTimer();
    
    purposeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPurpose = btn.dataset.purpose;
        welcomeSection.classList.add('hidden');
        if (selectedPurpose === 'work') {
          workSection.classList.remove('hidden');
        } else {
          funSection.classList.remove('hidden');
        }
      });
    });
    
    closeBtn.addEventListener('click', () => {
      window.close();
    });
    
    customMinutesInput.addEventListener('input', () => {
      if (customMinutesInput.value) {
        selectedMinutes = parseInt(customMinutesInput.value);
      }
    });
    
    submitBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', stopTimer);
    
    function initProgressRing() {
      const radius = progressCircle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
      progressCircle.style.strokeDashoffset = circumference;
    }
    
    function checkActiveTimer() {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        
        const site = new URL(tabs[0].url).hostname;
        chrome.storage.local.get('mindtap', (data) => {
          const siteData = data.mindtap?.[site] || {};
          
          if (siteData.startTime && Date.now() - siteData.startTime <= siteData.mins * 60 * 1000) {
            welcomeSection.classList.add('hidden');
            funSection.classList.add('hidden');
            timerSection.classList.remove('hidden');
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
          timerSection.classList.add('hidden');
          welcomeSection.classList.remove('hidden');
          return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        countdownDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const radius = progressCircle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (elapsed / duration) * circumference;
        progressCircle.style.strokeDashoffset = offset;
        
        const percentage = remaining / duration;
        if (percentage > 0.5) {
          progressCircle.style.stroke = '#22c55e';
        } else if (percentage > 0.2) {
          progressCircle.style.stroke = '#f59e0b';
        } else {
          progressCircle.style.stroke = '#ef4444';
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
          
          const points = data.mindtap_points || 0;
          const newPoints = selectedPurpose === 'work' ? points + selectedMinutes : points;
          
          chrome.storage.local.set({
            mindtap: mindtapData,
            mindtap_points: newPoints
          }, () => {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: '../icons/the main logo.png',
              title: 'MindTap',
              message: 'Have fun! I’ll remind you when it’s time.'
            });
            
            funSection.classList.add('hidden');
            timerSection.classList.remove('hidden');
            startCountdown(timerData.startTime, timerData.mins * 60 * 1000);
            
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
            timerSection.classList.add('hidden');
            welcomeSection.classList.remove('hidden');
          });
        });
      });
    }
});