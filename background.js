// background-enhanced.js - Improved and secure background service worker

import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE_URL } from "./config.js";

class CVMamaBackground {
  constructor() {
    this.config = {
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_ANON_KEY,
      apiBaseUrl: API_BASE_URL,
      maxRetries: 3,
      retryDelay: 1000
    };
    
    this.requestCache = new Map();
    this.init();
  }

  init() {
    // Single consolidated message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('Message handler error:', error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        });
      return true; // Keep channel open for async response
    });

    // Installation handler
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.onInstall();
      } else if (details.reason === 'update') {
        this.onUpdate(details.previousVersion);
      }
    });

    // Periodic check for optimization status
    chrome.alarms.create('checkOptimizations', { periodInMinutes: 30 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkOptimizations') {
        this.checkPendingOptimizations();
      }
    });

    //open side panel:
    chrome.action.onClicked.addListener(async (tab) => {
      // Send a message to the active tab to toggle the side panel
      chrome.tabs.sendMessage(tab.id, { action: "togglePanel" });
      
    });
  }

  async handleMessage(message, sender) {
    const { type } = message;

    switch (type) {
      case 'UPLOAD_RESUME':
        return await this.handleResumeUpload(message);
      
      case 'GET_PROFILE':
        return await this.getProfile(message.profileId);
      
      case 'SYNC_PROFILE':
        return await this.syncProfile(message.profileId);
      
      case 'CALCULATE_MATCH':
        return await this.calculateMatch(message);
      
      case 'OPTIMIZE_RESUME':
        return await this.optimizeResume(message);
      
      case 'GET_APPLICATIONS':
        return await this.getApplications(message.profileId);
      
      case 'GET_APPLICATION':
        return await this.getApplication(message.applicationId);
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  // ==================== Resume Upload ====================
  
  async handleResumeUpload(message) {
    try {
      const { name, data } = message;
      
      // Convert data URL to blob
      const response = await fetch(data);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const filePath = `resumes/${Date.now()}-${name}`;
      const uploadUrl = `${this.config.supabaseUrl}/storage/v1/object/resumes/${filePath}`;
      
      const uploadResponse = await this.fetchWithRetry(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.supabaseKey}`,
          'apikey': this.config.supabaseKey,
          'Content-Type': blob.type
        },
        body: blob
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const publicUrl = `${this.config.supabaseUrl}/storage/v1/object/public/resumes/${filePath}`;

      // Create profile
      const profile = await this.createProfile(name, publicUrl);

      // Trigger background processing
      this.processResume(profile.id, publicUrl).catch(err => {
        console.error('Background processing error:', err);
      });

      return {
        success: true,
        profileId: profile.id,
        profile: profile
      };
    } catch (error) {
      console.error('Resume upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createProfile(fileName, fileUrl) {
    const profileData = {
      file_url: fileUrl,
      file_name: fileName,
      created_at: new Date().toISOString(),
      parsed_json: {}
    };

    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.config.supabaseKey,
        'Authorization': `Bearer ${this.config.supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(profileData)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create profile: ${error}`);
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

  async processResume(profileId, resumeUrl) {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/process-resume`, {
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
        throw new Error('Resume processing failed');
      }

      const result = await response.json();

      // Update profile with parsed data
      await this.updateProfile(profileId, {
        parsed_json: result.parsed_data || result.data,
        processed_at: new Date().toISOString()
      });

      // Send notification
      this.sendNotification(
        'Resume Processed',
        'Your resume has been successfully analyzed!',
        'success'
      );

      return { success: true, data: result };
    } catch (error) {
      console.error('Process resume error:', error);
      
      this.sendNotification(
        'Processing Error',
        'Failed to process your resume. Please try again.',
        'error'
      );

      throw error;
    }
  }

  // ==================== Profile Management ====================
  
  async getProfile(profileId) {
    try {
      const cacheKey = `profile-${profileId}`;
      
      // Check cache
      if (this.requestCache.has(cacheKey)) {
        const cached = this.requestCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5 minutes
          return cached.data;
        }
      }

      const response = await fetch(
        `${this.config.supabaseUrl}/rest/v1/profiles?id=eq.${profileId}&select=*`,
        {
          headers: {
            'apikey': this.config.supabaseKey,
            'Authorization': `Bearer ${this.config.supabaseKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      const profile = data.length > 0 ? data[0] : null;

      if (profile) {
        this.requestCache.set(cacheKey, {
          data: profile,
          timestamp: Date.now()
        });
      }

      return profile;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  }

  async syncProfile(profileId) {
    try {
      const profile = await this.getProfile(profileId);
      
      if (profile) {
        await chrome.storage.local.set({ profile });
      }

      return profile;
    } catch (error) {
      console.error('Sync profile error:', error);
      throw error;
    }
  }

  async updateProfile(profileId, updates) {
    try {
      const response = await fetch(
        `${this.config.supabaseUrl}/rest/v1/profiles?id=eq.${profileId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.config.supabaseKey,
            'Authorization': `Bearer ${this.config.supabaseKey}`,
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

      // Update cache and storage
      this.requestCache.set(`profile-${profileId}`, {
        data: profile,
        timestamp: Date.now()
      });

      await chrome.storage.local.set({ profile });

      return profile;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }

  // ==================== Match Calculation ====================
  
  async calculateMatch(message) {
    try {
      const { profileId, jobData } = message;

      const response = await fetch(`${this.config.apiBaseUrl}/calculate-match`, {
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
        throw new Error('Match calculation failed');
      }

      const matchData = await response.json();

      // Save match result
      await this.saveMatchResult(profileId, jobData, matchData);

      return {
        success: true,
        data: matchData
      };
    } catch (error) {
      console.error('Calculate match error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async saveMatchResult(profileId, jobData, matchData) {
    try {
      const scanResult = {
        profile_id: profileId,
        job_id: jobData.jobId,
        job_title: jobData.title,
        company: jobData.company,
        job_url: jobData.url,
        match_score: matchData.overall_score,
        skills_score: matchData.skills_match?.score,
        experience_score: matchData.experience_match?.score,
        keywords_score: matchData.keywords_match?.score,
        scan_result: matchData,
        scanned_at: new Date().toISOString()
      };

      await fetch(`${this.config.supabaseUrl}/rest/v1/scan_results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.config.supabaseKey,
          'Authorization': `Bearer ${this.config.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(scanResult)
      });
    } catch (error) {
      console.error('Save match result error:', error);
    }
  }

  // ==================== Resume Optimization ====================
  
  async optimizeResume(message) {
    try {
      const { profileId, jobData, matchResult } = message;

      // Create application entry
      const application = await this.createApplication(profileId, jobData, matchResult);

      // Trigger optimization process
      const response = await fetch(`${this.config.apiBaseUrl}/optimize-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          application_id: application.id,
          profile_id: profileId,
          job_data: jobData,
          match_result: matchResult
        })
      });

      if (!response.ok) {
        throw new Error('Optimization request failed');
      }

      const result = await response.json();

      // Update application with task ID
      await this.updateApplication(application.id, {
        optimization_task_id: result.task_id,
        status: 'processing'
      });

      return {
        success: true,
        data: {
          ...application,
          task_id: result.task_id
        }
      };
    } catch (error) {
      console.error('Optimize resume error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createApplication(profileId, jobData, matchResult) {
    const applicationData = {
      profile_id: profileId,
      job_id: jobData.jobId,
      job_title: jobData.title,
      company: jobData.company,
      job_url: jobData.url,
      job_location: jobData.location,
      job_description: jobData.description,
      match_score: matchResult?.overall_score,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.config.supabaseKey,
        'Authorization': `Bearer ${this.config.supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(applicationData)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create application: ${error}`);
    }

    const applications = await response.json();
    return applications[0];
  }

  async updateApplication(applicationId, updates) {
    const response = await fetch(
      `${this.config.supabaseUrl}/rest/v1/applications?id=eq.${applicationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.config.supabaseKey,
          'Authorization': `Bearer ${this.config.supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updates)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to update application');
    }

    const applications = await response.json();
    return applications[0];
  }

  // ==================== Application Management ====================
  
  async getApplications(profileId) {
    try {
      const response = await fetch(
        `${this.config.supabaseUrl}/rest/v1/applications?profile_id=eq.${profileId}&select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': this.config.supabaseKey,
            'Authorization': `Bearer ${this.config.supabaseKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch applications');
      }

      const applications = await response.json();

      return {
        success: true,
        data: applications
      };
    } catch (error) {
      console.error('Get applications error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getApplication(applicationId) {
    try {
      const response = await fetch(
        `${this.config.supabaseUrl}/rest/v1/applications?id=eq.${applicationId}&select=*`,
        {
          headers: {
            'apikey': this.config.supabaseKey,
            'Authorization': `Bearer ${this.config.supabaseKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch application');
      }

      const data = await response.json();
      const application = data.length > 0 ? data[0] : null;

      return {
        success: true,
        data: application
      };
    } catch (error) {
      console.error('Get application error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkPendingOptimizations() {
    try {
      const { profileId } = await chrome.storage.local.get(['profileId']);
      if (!profileId) return;

      // Get pending applications
      const response = await fetch(
        `${this.config.supabaseUrl}/rest/v1/applications?profile_id=eq.${profileId}&status=eq.processing&select=*`,
        {
          headers: {
            'apikey': this.config.supabaseKey,
            'Authorization': `Bearer ${this.config.supabaseKey}`
          }
        }
      );

      if (!response.ok) return;

      const pendingApps = await response.json();

      // Check each pending optimization
      for (const app of pendingApps) {
        if (!app.optimization_task_id) continue;

        try {
          const statusResponse = await fetch(
            `${this.config.apiBaseUrl}/optimization-status/${app.optimization_task_id}`
          );

          if (statusResponse.ok) {
            const status = await statusResponse.json();

            if (status.status === 'completed') {
              // Update application with results
              await this.updateApplication(app.id, {
                status: 'completed',
                optimized_resume_url: status.resume_url,
                cover_letter_url: status.cover_letter_url,
                completed_at: new Date().toISOString()
              });

              // Send notification
              this.sendNotification(
                'Optimization Complete',
                `Your optimized resume for ${app.job_title} at ${app.company} is ready!`,
                'success'
              );
            } else if (status.status === 'failed') {
              await this.updateApplication(app.id, {
                status: 'failed',
                error_message: status.error
              });

              this.sendNotification(
                'Optimization Failed',
                `Failed to optimize resume for ${app.job_title}`,
                'error'
              );
            }
          }
        } catch (error) {
          console.error('Error checking optimization status:', error);
        }
      }
    } catch (error) {
      console.error('Error checking pending optimizations:', error);
    }
  }

  // ==================== Utility Functions ====================
  
  async fetchWithRetry(url, options, retries = this.config.maxRetries) {
    try {
      const response = await fetch(url, options);
      
      // Retry on server errors
      if (!response.ok && response.status >= 500 && retries > 0) {
        await this.delay(this.config.retryDelay);
        return this.fetchWithRetry(url, options, retries - 1);
      }
      
      return response;
    } catch (error) {
      if (retries > 0) {
        await this.delay(this.config.retryDelay);
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendNotification(title, message, type = 'info') {
    try {
      const { browserNotifications } = await chrome.storage.local.get(['browserNotifications']);

      if (browserNotifications !== false) {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: title,
          message: message,
          priority: type === 'error' ? 2 : 1
        });
      }
    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  onInstall() {
    console.log('CV Mama Extension installed');
    
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });

    // Set default settings
    chrome.storage.local.set({
      browserNotifications: true,
      autoScan: true
    });
  }

  onUpdate(previousVersion) {
    console.log(`CV Mama Extension updated from ${previousVersion}`);
    
    // Clear cache on updates
    this.requestCache.clear();
  }
}

// Initialize background service
new CVMamaBackground();