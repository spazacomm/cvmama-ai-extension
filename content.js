// content-enhanced.js - Enhanced content script with floating UI

(function() {
  'use strict';
  
  if (window.CVMamaContentInjected) return;
  window.CVMamaContentInjected = true;

  class CVMamaContent {
    constructor() {
      this.currentJob = null;
      this.profile = null;
      this.processedJobs = new Set();
      this.floatingButton = null;
      this.init();
    }

    async init() {
      await this.loadProfile();
      this.detectJobBoard();
      this.observePageChanges();
      
      if (this.profile) {
        this.injectFloatingButton();
      }
    }

    async loadProfile() {
      try {
        const result = await chrome.storage.local.get(['profile', 'profileId']);
        if (result.profile && result.profile.parsed_json) {
          this.profile = result.profile;
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    }

    // ==================== Floating Button ====================
    
    injectFloatingButton() {
      if (this.floatingButton) return;

      this.floatingButton = document.createElement('div');
      this.floatingButton.id = 'cvmama-floating-container';
      this.floatingButton.innerHTML = `
        <div class="cvmama-floating-btn" id="cvmama-main-btn">
          <img src="${chrome.runtime.getURL('images/logo-white.png')}" alt="cvmama" class="cvmama-floating-icon">
        </div>
        <div class="cvmama-floating-menu" id="cvmama-floating-menu">
          <button class="cvmama-menu-btn" id="cvmama-scan-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>Match Score</span>
          </button>
          <button class="cvmama-menu-btn" id="cvmama-save-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Save Job</span>
          </button>
          <button class="cvmama-menu-btn" id="cvmama-profile-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>My Profile</span>
          </button>
          <button class="cvmama-menu-btn" id="cvmama-applications-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>Applications</span>
          </button>
        </div>
      `;

      document.body.appendChild(this.floatingButton);
      this.setupFloatingButtonEvents();
    }

    setupFloatingButtonEvents() {
      const mainBtn = document.getElementById('cvmama-main-btn');
      const menu = document.getElementById('cvmama-floating-menu');
      const scanBtn = document.getElementById('cvmama-scan-btn');
      const saveBtn = document.getElementById('cvmama-save-btn');
      const profileBtn = document.getElementById('cvmama-profile-btn');
      const applicationsBtn = document.getElementById('cvmama-applications-btn');

      let isMenuOpen = false;

      // Toggle menu
      mainBtn.addEventListener('click', () => {
        isMenuOpen = !isMenuOpen;
        menu.classList.toggle('cvmama-menu-open', isMenuOpen);
        mainBtn.classList.toggle('cvmama-btn-active', isMenuOpen);
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!this.floatingButton.contains(e.target) && isMenuOpen) {
          isMenuOpen = false;
          menu.classList.remove('cvmama-menu-open');
          mainBtn.classList.remove('cvmama-btn-active');
        }
      });

      // Scan button
      scanBtn.addEventListener('click', async () => {
        await this.handleScan();
        isMenuOpen = false;
        menu.classList.remove('cvmama-menu-open');
        mainBtn.classList.remove('cvmama-btn-active');
      });

      // Save button
      saveBtn.addEventListener('click', async () => {
        await this.handleSaveJob();
        isMenuOpen = false;
        menu.classList.remove('cvmama-menu-open');
        mainBtn.classList.remove('cvmama-btn-active');
      });

      // Profile button
      profileBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_PROFILE' });
        isMenuOpen = false;
        menu.classList.remove('cvmama-menu-open');
        mainBtn.classList.remove('cvmama-btn-active');
      });

      // Applications button
      applicationsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_APPLICATIONS' });
        isMenuOpen = false;
        menu.classList.remove('cvmama-menu-open');
        mainBtn.classList.remove('cvmama-btn-active');
      });
    }

    // ==================== Job Detection ====================
    
    detectJobBoard() {
      const hostname = window.location.hostname;
      
      if (hostname.includes('linkedin.com')) {
        this.detectLinkedInJob();
      } else if (hostname.includes('indeed.com')) {
        this.detectIndeedJob();
      } else if (hostname.includes('glassdoor.com')) {
        this.detectGlassdoorJob();
      } else if (hostname.includes('monster.com')) {
        this.detectMonsterJob();
      }
    }

    detectLinkedInJob() {
      // Check if we're on a job details page
      const isJobPage = window.location.pathname.includes('/jobs/');
      
      if (isJobPage) {
        this.currentJob = this.extractLinkedInJobData();
      }
    }

    detectIndeedJob() {
      const isJobPage = window.location.pathname.includes('/viewjob') || 
                        document.querySelector('.jobsearch-ViewJobLayout');
      
      if (isJobPage) {
        this.currentJob = this.extractIndeedJobData();
      }
    }

    detectGlassdoorJob() {
      const isJobPage = window.location.pathname.includes('/job-listing/');
      
      if (isJobPage) {
        this.currentJob = this.extractGlassdoorJobData();
      }
    }

    detectMonsterJob() {
      const isJobPage = window.location.pathname.includes('/job-opening/');
      
      if (isJobPage) {
        this.currentJob = this.extractMonsterJobData();
      }
    }

    // ==================== Job Data Extraction ====================
    
    extractLinkedInJobData() {
      try {
        const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1');
        const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name');
        const locationEl = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet');
        const descriptionEl = document.querySelector('.jobs-description, .jobs-description-content__text, .jobs-box__html-content');

        if (!titleEl) return null;

        const jobId = window.location.href.match(/\/jobs\/view\/(\d+)/)?.[1] || Date.now().toString();

        return {
          jobId: jobId,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          description: descriptionEl?.textContent.trim() || '',
          url: window.location.href.split('?')[0],
          source: 'linkedin',
          postedDate: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error extracting LinkedIn job:', error);
        return null;
      }
    }

    extractIndeedJobData() {
      try {
        const titleEl = document.querySelector('.jobsearch-JobInfoHeader-title, h1.jobTitle');
        const companyEl = document.querySelector('[data-company-name="true"], .jobsearch-InlineCompanyRating-companyHeader a');
        const locationEl = document.querySelector('[data-testid="job-location"], .jobsearch-JobInfoHeader-subtitle div');
        const descriptionEl = document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText');

        if (!titleEl) return null;

        const jobId = new URLSearchParams(window.location.search).get('jk') || Date.now().toString();

        return {
          jobId: jobId,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          description: descriptionEl?.textContent.trim() || '',
          url: window.location.href,
          source: 'indeed',
          postedDate: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error extracting Indeed job:', error);
        return null;
      }
    }

    extractGlassdoorJobData() {
      try {
        const titleEl = document.querySelector('[data-test="job-title"], h1');
        const companyEl = document.querySelector('[data-test="employer-name"]');
        const locationEl = document.querySelector('[data-test="location"]');
        const descriptionEl = document.querySelector('[data-test="job-description"], .desc');

        if (!titleEl) return null;

        const jobId = window.location.pathname.match(/job-listing\/([^?]+)/)?.[1]?.replace(/\.htm$/, '') || Date.now().toString();

        return {
          jobId: jobId,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          description: descriptionEl?.textContent.trim() || '',
          url: window.location.href,
          source: 'glassdoor',
          postedDate: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error extracting Glassdoor job:', error);
        return null;
      }
    }

    extractMonsterJobData() {
      try {
        const titleEl = document.querySelector('[data-testid="job-title"], h1');
        const companyEl = document.querySelector('[data-testid="company-name"]');
        const locationEl = document.querySelector('[data-testid="job-location"]');
        const descriptionEl = document.querySelector('[data-testid="job-description"]');

        if (!titleEl) return null;

        const jobId = window.location.pathname.match(/job-opening\/([^?]+)/)?.[1] || Date.now().toString();

        return {
          jobId: jobId,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          description: descriptionEl?.textContent.trim() || '',
          url: window.location.href,
          source: 'monster',
          postedDate: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error extracting Monster job:', error);
        return null;
      }
    }

    // ==================== Actions ====================
    
    async handleScan() {
      if (!this.currentJob) {
        this.showNotification('No job detected on this page', 'warning');
        return;
      }

      if (!this.profile) {
        this.showNotification('Please upload your resume first', 'error');
        return;
      }

      this.showNotification('Calculating match score...', 'info');

      try {
        // Open popup to show results
        chrome.runtime.sendMessage({
          type: 'SCAN_JOB',
          jobData: this.currentJob
        });
      } catch (error) {
        console.error('Scan error:', error);
        this.showNotification('Failed to scan job', 'error');
      }
    }

    async handleSaveJob() {
      if (!this.currentJob) {
        this.showNotification('No job detected on this page', 'warning');
        return;
      }

      this.showNotification('Saving job...', 'info');

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_JOB',
          jobData: this.currentJob
        });

        if (response && response.success) {
          this.showNotification('Job saved successfully!', 'success');
        } else {
          throw new Error(response?.error || 'Save failed');
        }
      } catch (error) {
        console.error('Save job error:', error);
        this.showNotification('Failed to save job', 'error');
      }
    }

    // ==================== UI Helpers ====================
    
    showNotification(message, type = 'info') {
      const existing = document.querySelector('.cvmama-toast');
      if (existing) existing.remove();

      const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
      };

      const toast = document.createElement('div');
      toast.className = `cvmama-toast cvmama-toast-${type}`;
      toast.innerHTML = `
        <div class="cvmama-toast-icon">${icons[type]}</div>
        <div class="cvmama-toast-message">${message}</div>
      `;

      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('cvmama-toast-show'), 10);
      setTimeout(() => {
        toast.classList.remove('cvmama-toast-show');
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }

    // ==================== Page Observer ====================
    
    observePageChanges() {
      let timeout;
      const observer = new MutationObserver(() => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.detectJobBoard();
        }, 500);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Listen for URL changes (SPA navigation)
      let lastUrl = location.href;
      new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          this.currentJob = null;
          setTimeout(() => this.detectJobBoard(), 1000);
        }
      }).observe(document, { 
        subtree: true, 
        childList: true 
      });
    }
  }

  // ==================== Message Listener ====================
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTRACT_JOB_DATA') {
      const detector = window.cvMamaContentInstance;
      if (detector && detector.currentJob) {
        sendResponse({ jobData: detector.currentJob });
      } else {
        sendResponse({ jobData: null });
      }
    }
    return true;
  });

// ======================= Left Panel ==============

  let panel;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "togglePanel") {
      if (panel) {
        panel.remove();
        panel = null;
        return;
      }
  
      panel = document.createElement("div");
      panel.id = "cvmama-sidepanel";
      panel.innerHTML = `
        <iframe
          src="${chrome.runtime.getURL("popup.html")}"
          style="border:none;width:100%;height:100%;"
        ></iframe>
      `;
      document.body.appendChild(panel);
    }
  });

  // ==================== Initialize ====================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.cvMamaContentInstance = new CVMamaContent();
    });
  } else {
    window.cvMamaContentInstance = new CVMamaContent();
  }

})();