// popup-enhanced.js - Improved and optimized popup logic

import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE_URL } from "./config.js";

class CVMamaPopup {
  constructor() {
    this.config = {
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_ANON_KEY,
      apiBaseUrl: API_BASE_URL,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      syncInterval: 5000, // 5 seconds
      requestTimeout: 30000 // 30 seconds
    };
    
    this.state = {
      profileId: null,
      profile: null,
      currentJob: null,
      matchResult: null,
      syncIntervalId: null
    };
    
    this.cache = new Map();
    this.pendingRequests = new Map();
    
    this.init();
  }

  async init() {
    try {
      await this.loadProfile();
      await this.detectCurrentJob();
      this.setupEventListeners();
      this.updateUI();
    } catch (error) {
      console.error('Initialization error:', error);
      this.showAlert('Failed to initialize extension', 'error');
    }
  }

  // ==================== Profile Management ====================
  
  async loadProfile() {
    try {
      const stored = await chrome.storage.local.get(['profileId', 'profile']);
      
      if (!stored.profileId) {
        this.showState('upload');
        return;
      }

      this.state.profileId = stored.profileId;
      
      // Check cache first
      const cacheKey = `profile-${stored.profileId}`;
      if (this.cache.has(cacheKey)) {
        this.state.profile = this.cache.get(cacheKey);
      } else {
        // Fetch from backend via background script
        this.state.profile = await this.sendMessage({
          type: 'GET_PROFILE',
          profileId: stored.profileId
        });
        
        if (this.state.profile) {
          this.cache.set(cacheKey, this.state.profile);
        }
      }

      // Check if profile is being processed
      if (!this.state.profile || !this.state.profile.parsed_json || 
          Object.keys(this.state.profile.parsed_json).length === 0) {
        this.showState('processing');
        this.startProfileSync();
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      throw error;
    }
  }

  startProfileSync() {
    if (this.state.syncIntervalId) {
      clearInterval(this.state.syncIntervalId);
    }

    this.state.syncIntervalId = setInterval(async () => {
      try {
        const profile = await this.sendMessage({
          type: 'SYNC_PROFILE',
          profileId: this.state.profileId
        });

        if (profile && profile.parsed_json && 
            Object.keys(profile.parsed_json).length > 0) {
          this.state.profile = profile;
          this.cache.set(`profile-${this.state.profileId}`, profile);
          await chrome.storage.local.set({ profile });
          
          this.stopProfileSync();
          this.showAlert('Resume processed successfully!', 'success');
          await this.detectCurrentJob();
          this.updateUI();
        }
      } catch (error) {
        console.error('Sync error:', error);
      }
    }, this.config.syncInterval);
  }

  stopProfileSync() {
    if (this.state.syncIntervalId) {
      clearInterval(this.state.syncIntervalId);
      this.state.syncIntervalId = null;
    }
  }

  // ==================== Job Detection ====================
  
  async detectCurrentJob() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        this.state.currentJob = null;
        return;
      }

      // Check if on supported job board
      const jobBoards = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'monster.com'];
      const isJobBoard = jobBoards.some(board => tab.url.includes(board));

      if (!isJobBoard) {
        this.state.currentJob = null;
        return;
      }

      // Extract job data from page
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { 
          type: 'EXTRACT_JOB_DATA' 
        });

        if (response && response.jobData) {
          this.state.currentJob = response.jobData;
        } else {
          this.state.currentJob = null;
        }
      } catch (error) {
        // Content script not loaded or no job detected
        this.state.currentJob = null;
      }
    } catch (error) {
      console.error('Error detecting job:', error);
      this.state.currentJob = null;
    }
  }

  // ==================== File Upload ====================
  
  async handleFileUpload(file) {
    if (!this.validateFile(file)) return;

    const button = document.getElementById('uploadBtn');
    
    try {
      await this.withButtonLoading(button, 'Uploading...', async () => {
        // Convert file to base64
        const fileData = await this.fileToBase64(file);
        
        // Send to background script for upload
        const result = await this.sendMessage({
          type: 'UPLOAD_RESUME',
          name: file.name,
          data: fileData
        });

        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        this.state.profileId = result.profileId;
        this.state.profile = result.profile;

        await chrome.storage.local.set({
          profileId: result.profileId,
          profile: result.profile
        });

        this.showAlert('Resume uploaded successfully!', 'success');
        this.showState('processing');
        this.startProfileSync();
      });
    } catch (error) {
      console.error('Upload error:', error);
      this.showAlert(error.message || 'Failed to upload resume', 'error');
    }
  }

  validateFile(file) {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    if (!allowedTypes.includes(file.type)) {
      this.showAlert('Please upload a PDF or DOCX file', 'error');
      return false;
    }

    if (file.size > this.config.maxFileSize) {
      this.showAlert('File size must be less than 5MB', 'error');
      return false;
    }

    return true;
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ==================== Match Score Calculation ====================
  
  async calculateMatchScore() {
    if (!this.state.profile) {
      this.showAlert('Profile not loaded', 'error');
      return;
    }

    if (!this.state.currentJob) {
      this.showAlert('No job detected on this page', 'warning');
      return;
    }

    const button = document.getElementById('calculateMatchBtn');

    try {
      await this.withButtonLoading(button, 'Calculating...', async () => {
        // Calculate match via background script
        const result = await this.sendMessage({
          type: 'CALCULATE_MATCH',
          profileId: this.state.profileId,
          jobData: this.state.currentJob
        });

        if (!result.success) {
          throw new Error(result.error || 'Match calculation failed');
        }

        this.state.matchResult = result.data;
        
        // Store match result
        await chrome.storage.local.set({ 
          lastMatchResult: result.data,
          lastMatchJob: this.state.currentJob
        });

        this.showState('matchResult');
        this.populateMatchResult();
      });
    } catch (error) {
      console.error('Match calculation error:', error);
      this.showAlert(error.message || 'Failed to calculate match', 'error');
    }
  }

  populateMatchResult() {
    if (!this.state.matchResult || !this.state.currentJob) return;

    // Job info
    document.getElementById('resultJobTitle').textContent = this.state.currentJob.title || 'N/A';
    document.getElementById('resultJobCompany').textContent = this.state.currentJob.company || 'N/A';
    
    const initial = (this.state.currentJob.company || 'C').charAt(0).toUpperCase();
    document.getElementById('resultCompanyInitial').textContent = initial;

    // Overall score
    const overallScore = Math.round(this.state.matchResult.overall_score || 0);
    document.getElementById('matchScore').textContent = overallScore;

    // Detailed scores
    const skills = Math.round(this.state.matchResult.skills_match?.score || 0);
    const experience = Math.round(this.state.matchResult.experience_match?.score || 0);
    const keywords = Math.round(this.state.matchResult.keywords_match?.score || 0);

    document.getElementById('skillsScore').textContent = skills + '%';
    document.getElementById('skillsProgress').style.width = skills + '%';

    document.getElementById('experienceScore').textContent = experience + '%';
    document.getElementById('experienceProgress').style.width = experience + '%';

    document.getElementById('keywordsScore').textContent = keywords + '%';
    document.getElementById('keywordsProgress').style.width = keywords + '%';
  }

  // ==================== Resume Optimization ====================
  
  async optimizeResume() {
    if (!this.state.profile || !this.state.currentJob || !this.state.matchResult) {
      this.showAlert('Missing required data for optimization', 'error');
      return;
    }

    const button = document.getElementById('optimizeBtn');

    try {
      await this.withButtonLoading(button, 'Starting Optimization...', async () => {
        // Create application entry and trigger optimization
        const result = await this.sendMessage({
          type: 'OPTIMIZE_RESUME',
          profileId: this.state.profileId,
          jobData: this.state.currentJob,
          matchResult: this.state.matchResult
        });

        if (!result.success) {
          throw new Error(result.error || 'Optimization failed');
        }

        // Store application ID
        await chrome.storage.local.set({
          currentApplication: result.data
        });

        this.showAlert('Optimization started! This may take 2-24 hours. You will be notified when ready.', 'success');
        
        // Open applications page
        setTimeout(() => {
          chrome.tabs.create({ 
            url: chrome.runtime.getURL('applications.html')
          });
        }, 2000);
      });
    } catch (error) {
      console.error('Optimization error:', error);
      this.showAlert(error.message || 'Failed to start optimization', 'error');
    }
  }

  // ==================== UI Management ====================
  
  updateUI() {
    if (!this.state.profile) {
      this.showState('upload');
      return;
    }

    if (!this.state.profile.parsed_json || 
        Object.keys(this.state.profile.parsed_json).length === 0) {
      this.showState('processing');
      return;
    }

    if (!this.state.currentJob) {
      this.showState('profileReady');
      this.showState('noJob');
      return;
    }

    // Check if we have a recent match for this job
    if (this.state.matchResult && 
        this.state.matchResult.job_id === this.state.currentJob.jobId) {
          this.showState('profileReady');
      this.showState('matchResult');
      this.populateMatchResult();
      return;
    }
    this.showState('profileReady');
    this.showState('jobAnalysis');
    this.populateJobInfo();
  }

  populateJobInfo() {
    if (!this.state.currentJob) return;

    const job = this.state.currentJob;

    document.getElementById('jobTitle').textContent = job.title || 'N/A';
    document.getElementById('jobCompany').textContent = job.company || 'N/A';
    document.getElementById('jobLocation').innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
      ${job.location || 'Remote'}
    `;

    const initial = (job.company || 'C').charAt(0).toUpperCase();
    document.getElementById('companyInitial').textContent = initial;

    // Add meta tags if available
    const metaContainer = document.getElementById('jobMeta');
    metaContainer.innerHTML = '';

    if (job.type) {
      metaContainer.innerHTML += `
        <span class="meta-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          ${job.type}
        </span>
      `;
    }

    if (job.source) {
      metaContainer.innerHTML += `
        <span class="meta-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
          ${this.capitalizeFirst(job.source)}
        </span>
      `;
    }
  }

  showState(stateName) {
    const states = ['upload', 'processing', 'noJob', 'jobAnalysis', 'matchResult', 'profileReady'];
    states.forEach(state => {
      const element = document.getElementById(`${state}State`);
      if (element) {
        element.classList.toggle('hidden', state !== stateName);
      }
    });
  }

  // ==================== Event Listeners ====================
  
  setupEventListeners() {
    // Upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    if (uploadArea && fileInput) {
      uploadArea.addEventListener('click', () => fileInput.click());
      
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#6BB4C9';
        uploadArea.style.background = '#F0F9FF';
      });

      uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#D1D5DB';
        uploadArea.style.background = 'white';
      });

      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#D1D5DB';
        uploadArea.style.background = 'white';
        
        if (e.dataTransfer.files.length > 0) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileUpload(e.target.files[0]);
        }
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => fileInput.click());
    }

    // Calculate match
    const calculateBtn = document.getElementById('calculateMatchBtn');
    if (calculateBtn) {
      calculateBtn.addEventListener('click', () => this.calculateMatchScore());
    }

    // Optimize
    const optimizeBtn = document.getElementById('optimizeBtn');
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', () => this.optimizeResume());
    }

    // View report
    const viewReportBtn = document.getElementById('viewReportBtn');
    if (viewReportBtn) {
      viewReportBtn.addEventListener('click', () => {
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('report.html')
        });
      });
    }

    // Quick links
    const viewProfileLink = document.getElementById('viewProfileLink');
    if (viewProfileLink) {
      viewProfileLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('profile.html')
        });
      });
    }

    const viewApplicationsLink = document.getElementById('viewApplicationsLink');
    if (viewApplicationsLink) {
      viewApplicationsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('applications.html')
        });
      });
    }

    const applicationsLink = document.getElementById('applicationsLink');
    if (applicationsLink) {
      applicationsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('applications.html')
        });
      });
    }

    const newMatchLink = document.getElementById('newMatchLink');
    if (newMatchLink) {
      newMatchLink.addEventListener('click', async (e) => {
        e.preventDefault();
        this.state.matchResult = null;
        await this.detectCurrentJob();
        this.updateUI();
      });
    }

    const settingsLink = document.getElementById('settingsLink');
    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('settings.html')
        });
      });
    }

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(() => {
      this.handleTabChange();
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete') {
        this.handleTabChange();
      }
    });
  }

  async handleTabChange() {
    this.state.currentJob = null;
    this.state.matchResult = null;
    await this.detectCurrentJob();
    this.updateUI();
  }

  // ==================== Utility Functions ====================
  
  async sendMessage(message) {
    const requestId = `${message.type}-${Date.now()}`;
    
    // Check for pending duplicate requests
    if (this.pendingRequests.has(message.type)) {
      return this.pendingRequests.get(message.type);
    }

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.type);
        reject(new Error('Request timeout'));
      }, this.config.requestTimeout);

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(message.type);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.error) {
          reject(new Error(response.error));
          return;
        }

        resolve(response);
      });
    });

    this.pendingRequests.set(message.type, promise);
    return promise;
  }

  async withButtonLoading(button, loadingText, operation) {
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${loadingText}`;

    try {
      return await operation();
    } finally {
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  }

  showAlert(message, type = 'info') {
    const alertArea = document.getElementById('alertArea');
    if (!alertArea) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
      <span style="font-size: 16px; font-weight: 700;">${icons[type]}</span>
      <span style="flex: 1;">${message}</span>
    `;

    alertArea.appendChild(alert);

    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ==================== Cleanup ====================
  
  cleanup() {
    this.stopProfileSync();
    this.cache.clear();
    this.pendingRequests.clear();
  }
}

// Initialize popup
let popupInstance;

document.addEventListener('DOMContentLoaded', () => {
  popupInstance = new CVMamaPopup();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (popupInstance) {
    popupInstance.cleanup();
  }
});