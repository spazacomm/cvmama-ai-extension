// Popup JavaScript for CV Mama Extension - Workflow Version

import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE_URL } from "./config.js";

class CVMamaPopup {
  constructor() {
    this.apiBaseUrl = API_BASE_URL;
    this.supabaseUrl = SUPABASE_URL;
    this.supabaseKey = SUPABASE_ANON_KEY;
    this.profileId = null;
    this.profile = null;
    this.syncInterval = null;
    this.init();
  }

  async init() {
    await this.checkProfileStatus();
    this.setupEventListeners();
  }

  async checkProfileStatus() {
    // Get profile ID from local storage
    const { profileId } = await chrome.storage.local.get(['profileId']);
    
    if (!profileId) {
      // New user - show upload state
      this.showUploadState();
      return;
    }

    this.profileId = profileId;

    // Fetch profile from Supabase
    try {
      const profile = await this.fetchProfile(profileId);
      
      if (!profile) {
        // Profile ID exists but profile not found - reset
        await chrome.storage.local.remove(['profileId']);
        this.showUploadState();
        return;
      }

      this.profile = profile;

      // Check if profile has parsed data
      if (!profile.parsed_json || Object.keys(profile.parsed_json).length === 0) {
        // Profile exists but not processed yet
        this.showProfileProcessingState();
        this.startProfileSync();
      } else {
        // Profile is ready
        this.showProfileReadyState();
      }
    } catch (error) {
      console.error('Error checking profile status:', error);
      this.showAlert('Error loading profile. Please try again.', 'error');
      this.showUploadState();
    }
  }

  async fetchProfile(profileId) {
    const response = await fetch(
      `${this.supabaseUrl}/rest/v1/profiles?id=eq.${profileId}&select=*`,
      {
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  }

  setupEventListeners() {
    // Upload area
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('resumeFileInput');

    if (uploadArea) {
      uploadArea.addEventListener('click', () => fileInput.click());
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#6BB4C9';
        uploadArea.style.background = '#F9FAFB';
      });
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#E5E7EB';
        uploadArea.style.background = 'white';
      });
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#E5E7EB';
        uploadArea.style.background = 'white';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          this.handleFileUpload(files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileUpload(e.target.files[0]);
        }
      });
    }

    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => fileInput.click());
    }

    // Refresh processing button
    const refreshBtn = document.getElementById('refreshProcessingBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.checkProfileStatus());
    }

    // Action buttons
    const matchScoreBtn = document.getElementById('getMatchScoreBtn');
    if (matchScoreBtn) {
      matchScoreBtn.addEventListener('click', () => this.getMatchScore());
    }

    const optimizeBtn = document.getElementById('optimizeResumeBtn');
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', () => this.optimizeResume());
    }

    const dashboardBtn = document.getElementById('viewDashboardBtn');
    if (dashboardBtn) {
      dashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
      });
    }

    const updateResumeBtn = document.getElementById('updateResumeBtn');
    if (updateResumeBtn) {
      updateResumeBtn.addEventListener('click', () => fileInput.click());
    }
  }

  async handleFileUpload(file) {
    // Validate file
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      this.showAlert('Please upload a PDF or DOCX file', 'error');
      return;
    }

    if (file.size > maxSize) {
      this.showAlert('File size must be less than 5MB', 'error');
      return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<span class="spinner"></span> Uploading...';
    }

    try {
      // Step 1: Upload file to Supabase Storage
      const filePath = `resumes/${Date.now()}-${file.name}`;
      
      const uploadResponse = await fetch(
        `${this.supabaseUrl}/storage/v1/object/resumes/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey
          },
          body: file
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/resumes/${filePath}`;

      this.showAlert('Resume uploaded successfully!', 'success');

      // Step 2: Create profile in Supabase
      await this.createProfile(file.name, publicUrl);

    } catch (error) {
      console.error('Error uploading resume:', error);
      this.showAlert('Failed to upload resume. Please try again.', 'error');
      
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Upload Resume
        `;
      }
    }
  }

  async createProfile(fileName, fileUrl) {
    this.showProfileCreatingState();

    try {
      // Create profile entry
      const profileData = {
        file_url: fileUrl
      };

      const response = await fetch(`${this.supabaseUrl}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(profileData)
      });

      if (!response.ok) {
        throw new Error('Failed to create profile');
      }

      const profiles = await response.json();
      const profile = profiles[0];

      // Store profile ID in local storage
      this.profileId = profile.id;
      await chrome.storage.local.set({ 
        profileId: profile.id,
        profile: profile 
      });

      this.profile = profile;
      this.showAlert('Profile created successfully!', 'success');

      // Start background processing
      await this.triggerProfileProcessing(profile.id, fileUrl);

      // Show processing state
      this.showProfileProcessingState();
      this.startProfileSync();

    } catch (error) {
      console.error('Error creating profile:', error);
      this.showAlert('Failed to create profile. Please try again.', 'error');
      this.showUploadState();
    }
  }

  async triggerProfileProcessing(profileId, fileUrl) {
    try {
      // Send request to backend to process resume
      const response = await fetch(`${this.apiBaseUrl}/process-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile_id: profileId,
          resume_url: fileUrl
        })
      });

      if (!response.ok) {
        console.error('Failed to trigger profile processing');
      }

      // Processing happens in background, no need to wait for response
    } catch (error) {
      console.error('Error triggering profile processing:', error);
    }
  }

  startProfileSync() {
    // Stop any existing sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Poll for profile updates every 5 seconds
    this.syncInterval = setInterval(async () => {
      try {
        const profile = await this.fetchProfile(this.profileId);
        
        if (profile && profile.parsed_json && Object.keys(profile.parsed_json).length > 0) {
          // Profile is now processed
          this.profile = profile;
          await chrome.storage.local.set({ profile: profile });
          
          // Stop syncing
          clearInterval(this.syncInterval);
          this.syncInterval = null;

          // Show ready state
          this.showProfileReadyState();
          this.showAlert('Your resume has been processed!', 'success');
        }
      } catch (error) {
        console.error('Error syncing profile:', error);
      }
    }, 5000);
  }

  stopProfileSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  showUploadState() {
    this.hideAllStates();
    document.getElementById('uploadResumeState').classList.remove('hidden');
  }

  showProfileCreatingState() {
    this.hideAllStates();
    document.getElementById('profileCreatingState').classList.remove('hidden');
  }

  showProfileProcessingState() {
    this.hideAllStates();
    document.getElementById('profileProcessingState').classList.remove('hidden');
  }

  showProfileReadyState() {
    this.stopProfileSync();
    this.hideAllStates();
    document.getElementById('profileReadyState').classList.remove('hidden');

    if (this.profile && this.profile.parsed_json) {
      this.populateProfileData();
    }
  }

  hideAllStates() {
    document.getElementById('uploadResumeState').classList.add('hidden');
    document.getElementById('profileCreatingState').classList.add('hidden');
    document.getElementById('profileProcessingState').classList.add('hidden');
    document.getElementById('profileReadyState').classList.add('hidden');
  }

  populateProfileData() {
    const data = this.profile.parsed_json;

    // Profile header
    const name = data.basics.name || data.full_name || 'User';
    const email = data.basics.email || data.contact?.email || '';
    const title = data.basics.label || data.job_title || data.title || 'Professional';

    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = email;
    document.getElementById('profileTitle').textContent = title;

    // Profile initials
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    document.getElementById('profileInitials').textContent = initials;

    // Experience
    let experience = 'N/A';
    if (data.total_experience) {
      experience = data.total_experience;
    } else if (data.years_of_experience) {
      experience = `${data.years_of_experience} years`;
    } else if (data.work_experience && Array.isArray(data.work_experience)) {
      experience = `${data.work_experience.length} positions`;
    }
    document.getElementById('highlightExperience').textContent = experience;

    // Skills
    const skillsList = document.getElementById('highlightSkills');
    skillsList.innerHTML = '';
    
    let skills = [];
    if (data.skills && Array.isArray(data.skills)) {
      skills = data.skills.slice(0, 5);
    } else if (data.technical_skills && Array.isArray(data.technical_skills)) {
      skills = data.technical_skills.slice(0, 5);
    } else if (data.top_skills && Array.isArray(data.top_skills)) {
      skills = data.top_skills.slice(0, 5);
    }

    if (skills.length > 0) {
      skills.forEach(skill => {
        const li = document.createElement('li');
        li.textContent = typeof skill === 'string' ? skill : skill.name || skill.skill;
        skillsList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No skills extracted';
      skillsList.appendChild(li);
    }

    // Education
    let education = 'N/A';
    if (data.education && Array.isArray(data.education) && data.education.length > 0) {
      const latestEd = data.education[0];
      education = `${latestEd.degree || latestEd.level || ''} ${latestEd.area || latestEd.study_type || ''}`.trim();
      if (latestEd.institution) {
        education += ` - ${latestEd.institution}`;
      }
    } else if (data.highest_education) {
      education = data.highest_education;
    }
    document.getElementById('highlightEducation').textContent = education;
  }

  async getMatchScore() {
    if (!this.profile) {
      this.showAlert('Profile not loaded', 'error');
      return;
    }

    const btn = document.getElementById('getMatchScoreBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Calculating...';

    try {
      // Get current tab URL to analyze job posting
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        this.showAlert('Please open a job posting page', 'warning');
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Match Score
        `;
        return;
      }

      // Send message to content script to extract job data
      const response = await chrome.tabs.sendMessage(tab.id, { 
        type: 'EXTRACT_JOB_DATA' 
      });

      if (!response || !response.jobData) {
        this.showAlert('Could not extract job data from this page', 'warning');
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          Match Score
        `;
        return;
      }

      // Calculate match score via API
      const matchResponse = await fetch(`${this.apiBaseUrl}/calculate-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile_id: this.profileId,
          job_data: response.jobData
        })
      });

      if (!matchResponse.ok) {
        throw new Error('Failed to calculate match score');
      }

      const matchData = await matchResponse.json();

      // Store and open dashboard
      await chrome.storage.local.set({ lastMatchResult: matchData });
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('dashboard.html?view=match-score')
      });

    } catch (error) {
      console.error('Error calculating match score:', error);
      this.showAlert('Failed to calculate match score', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        Match Score
      `;
    }
  }

  async optimizeResume() {
    if (!this.profile) {
      this.showAlert('Profile not loaded', 'error');
      return;
    }

    const btn = document.getElementById('optimizeResumeBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Optimizing...';

    try {
      // Get current tab URL to analyze job posting
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        // No job posting - do general optimization
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('dashboard.html?view=optimize')
        });
        return;
      }

      // Send message to content script to extract job data
      const response = await chrome.tabs.sendMessage(tab.id, { 
        type: 'EXTRACT_JOB_DATA' 
      });

      if (!response || !response.jobData) {
        // Could not extract - do general optimization
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('dashboard.html?view=optimize')
        });
        return;
      }

      // Optimize for specific job
      const optimizeResponse = await fetch(`${this.apiBaseUrl}/optimize-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile_id: this.profileId,
          job_data: response.jobData
        })
      });

      if (!optimizeResponse.ok) {
        throw new Error('Failed to optimize resume');
      }

      const optimizationData = await optimizeResponse.json();

      // Store and open dashboard
      await chrome.storage.local.set({ lastOptimization: optimizationData });
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('dashboard.html?view=optimization')
      });

    } catch (error) {
      console.error('Error optimizing resume:', error);
      this.showAlert('Failed to optimize resume', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Optimize
      `;
    }
  }

  showAlert(message, type = 'info') {
    const alertArea = document.getElementById('alertArea');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    alertArea.appendChild(alert);
    
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  new CVMamaPopup();
});

// Clean up on unload
window.addEventListener('beforeunload', () => {
  if (window.cvMamaPopup) {
    window.cvMamaPopup.stopProfileSync();
  }
});