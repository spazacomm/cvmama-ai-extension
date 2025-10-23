// Background Service Worker for CV Mama Extension

import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE_URL } from "./config.js";

class CVMamaBackground {
  constructor() {
    this.apiBaseUrl = API_BASE_URL;
    this.supabaseUrl = SUPABASE_URL;
    this.supabaseKey = SUPABASE_ANON_KEY;
    this.init();
  }

  init() {
    // Listen for messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async response
    });

    // Listen for extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.onInstall();
      } else if (details.reason === 'update') {
        this.onUpdate(details.previousVersion);
      }
    });

    // Listen for tab updates to inject content scripts
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.injectContentScriptIfNeeded(tabId, tab.url);
      }
    });

    chrome.action.onClicked.addListener(async (tab) => {
      // Send a message to the active tab to toggle the side panel
      chrome.tabs.sendMessage(tab.id, { action: "togglePanel" });
      
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'EXTRACT_JOB_DATA') {
        const jobData = window.CVMamaJobDetector?.extract_job_data?.();
    
        sendResponse({ jobData });
      }
    });
    
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'UPLOAD_RESUME':
          await this.handleResumeUpload(message, sendResponse);
          break;

        case 'PROCESS_RESUME':
          await this.processResume(message.profileId, message.resumeUrl, sendResponse);
          break;

        case 'SYNC_PROFILE':
          await this.syncProfile(message.profileId, sendResponse);
          break;

        case 'CALCULATE_MATCH':
          await this.calculateMatch(message.profileId, message.jobData, sendResponse);
          break;

        case 'OPTIMIZE_RESUME':
          await this.optimizeResume(message.profileId, message.jobData, sendResponse);
          break;

        case 'SAVE_JOB':
          await this.saveJob(message.jobData, sendResponse);
          break;

        case 'GET_PROFILE':
          await this.getProfile(message.profileId, sendResponse);
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleResumeUpload(message, sendResponse) {
    try {
      // Convert data URL to blob
      const response = await fetch(message.data);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const filePath = `resumes/${Date.now()}-${message.name}`;
      
      const uploadResponse = await fetch(
        `${this.supabaseUrl}/storage/v1/object/resumes/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey
          },
          body: blob
        }
      );

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/resumes/${filePath}`;

      // Create profile
      const profile = await this.createProfile(message.name, publicUrl);

      // Trigger background processing
      this.processResume(profile.id, publicUrl);

      sendResponse({ 
        success: true, 
        profileId: profile.id,
        profile: profile 
      });

    } catch (error) {
      console.error('Error uploading resume:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async createProfile(fileName, fileUrl) {
    const profileData = {
      resume_file_name: fileName,
      resume_file_url: fileUrl,
      uploaded_at: new Date().toISOString(),
      parsed_json: {}
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

    // Store in local storage
    await chrome.storage.local.set({
      profileId: profile.id,
      profile: profile
    });

    return profile;
  }

  async processResume(profileId, resumeUrl, sendResponse) {
    try {
      // Call backend API to process resume
      const response = await fetch(`${this.apiBaseUrl}/process-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile_id: profileId,
          resume_url: resumeUrl
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process resume');
      }

      const result = await response.json();

      // Update profile in Supabase with parsed data
      await this.updateProfile(profileId, {
        parsed_json: result.parsed_data,
        processed_at: new Date().toISOString()
      });

      // Send notification
      this.sendNotification(
        'Resume Processed',
        'Your resume has been successfully analyzed!',
        'success'
      );

      if (sendResponse) {
        sendResponse({ success: true, data: result });
      }

    } catch (error) {
      console.error('Error processing resume:', error);
      
      this.sendNotification(
        'Processing Error',
        'Failed to process your resume. Please try again.',
        'error'
      );

      if (sendResponse) {
        sendResponse({ success: false, error: error.message });
      }
    }
  }

  async updateProfile(profileId, updates) {
    const response = await fetch(
      `${this.supabaseUrl}/rest/v1/profiles?id=eq.${profileId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updates)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to update profile');
    }

    const profiles = await response.json();
    const profile = profiles[0];

    // Update local storage
    await chrome.storage.local.set({ profile: profile });

    return profile;
  }

  async syncProfile(profileId, sendResponse) {
    try {
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
      const profile = data.length > 0 ? data[0] : null;

      if (profile) {
        // Update local storage
        await chrome.storage.local.set({ profile: profile });
      }

      sendResponse({ success: true, profile: profile });

    } catch (error) {
      console.error('Error syncing profile:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async getProfile(profileId, sendResponse) {
    try {
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
      const profile = data.length > 0 ? data[0] : null;

      sendResponse({ success: true, profile: profile });

    } catch (error) {
      console.error('Error getting profile:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async calculateMatch(profileId, jobData, sendResponse) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/calculate-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile_id: profileId,
          job_data: jobData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to calculate match');
      }

      const matchData = await response.json();

      // Save to Supabase
      await this.saveMatchResult(profileId, jobData, matchData);

      sendResponse({ success: true, data: matchData });

    } catch (error) {
      console.error('Error calculating match:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async optimizeResume(profileId, jobData, sendResponse) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/optimize-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile_id: profileId,
          job_data: jobData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to optimize resume');
      }

      const optimizationData = await response.json();

      // Save to Supabase
      await this.saveOptimizationResult(profileId, jobData, optimizationData);

      this.sendNotification(
        'Resume Optimized',
        'Your resume has been optimized for this job!',
        'success'
      );

      sendResponse({ success: true, data: optimizationData });

    } catch (error) {
      console.error('Error optimizing resume:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async saveJob(jobData, sendResponse) {
    try {
      const { profileId } = await chrome.storage.local.get(['profileId']);

      if (!profileId) {
        throw new Error('No profile found');
      }

      const savedJob = {
        user_id: profileId,
        job_title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        job_url: jobData.url,
        job_description: jobData.description,
        posted_date: jobData.postedDate,
        saved_at: new Date().toISOString()
      };

      const response = await fetch(`${this.supabaseUrl}/rest/v1/saved_jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(savedJob)
      });

      if (!response.ok) {
        throw new Error('Failed to save job');
      }

      const jobs = await response.json();

      this.sendNotification(
        'Job Saved',
        `${jobData.title} at ${jobData.company} has been saved!`,
        'success'
      );

      sendResponse({ success: true, job: jobs[0] });

    } catch (error) {
      console.error('Error saving job:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async saveMatchResult(profileId, jobData, matchData) {
    const scanResult = {
      user_id: profileId,
      job_title: jobData.title,
      company: jobData.company,
      job_url: jobData.url,
      scan_result: matchData,
      scanned_at: new Date().toISOString()
    };

    await fetch(`${this.supabaseUrl}/rest/v1/scan_results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`
      },
      body: JSON.stringify(scanResult)
    });
  }

  async saveOptimizationResult(profileId, jobData, optimizationData) {
    const optimizationResult = {
      user_id: profileId,
      job_title: jobData.title,
      company: jobData.company,
      optimization_result: optimizationData,
      optimized_at: new Date().toISOString()
    };

    await fetch(`${this.supabaseUrl}/rest/v1/optimization_results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`
      },
      body: JSON.stringify(optimizationResult)
    });
  }

  async sendNotification(title, message, type = 'info') {
    const { browserNotifications } = await chrome.storage.local.get(['browserNotifications']);

    if (browserNotifications !== false) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: title,
        message: message,
        priority: type === 'error' ? 2 : 1
      });
    }
  }

  async injectContentScriptIfNeeded(tabId, url) {
    // Check if URL is a job board
    const jobBoards = [
      'linkedin.com/jobs',
      'indeed.com',
      'glassdoor.com',
      'monster.com',
      'ziprecruiter.com',
      'simplyhired.com',
      'careerbuilder.com'
    ];

    const isJobBoard = jobBoards.some(board => url.includes(board));

    if (isJobBoard) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
      } catch (error) {
        // Content script might already be injected
        console.log('Content script injection skipped:', error.message);
      }
    }
  }

  onInstall() {
    console.log('CV Mama Extension installed');
    
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }

  onUpdate(previousVersion) {
    console.log(`CV Mama Extension updated from ${previousVersion}`);
  }
}

// Initialize background service
new CVMamaBackground();