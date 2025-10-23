// Content script for detecting jobs and injecting UI
if (!window.CVMamaJobDetectorInjected) {
  window.CVMamaJobDetectorInjected = true;

class CVMamaJobDetector {
    constructor() {
      this.apiBaseUrl = "https://api.cvmama.co.ke/";
      this.supabaseUrl = "https://dscxokllacbecqtfyyih.supabase.co";
      this.supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzY3hva2xsYWNiZWNxdGZ5eWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjYxOTUsImV4cCI6MjA3NDIwMjE5NX0.bg1MR17aDDcOLP7xEIDREqDrbAZkUeHSFc1NzV63V04";
      this.userResume = null;
      this.processedJobs = new Set();
      this.init();
    }
  
    async init() {
      await this.loadConfig();
      await this.checkResumeStatus();
      this.detectJobBoard();
      this.observePageChanges();
    }
  
    async loadConfig() {
      const config = await chrome.storage.local.get([ 'userResume']);

      const { supabaseUrl, supabaseKey } = {
        supabaseUrl: this.supabaseUrl,
        supabaseKey: this.supabaseKey,
        apiBaseUrl: this.apiBaseUrl
      };

      this.supabaseUrl = supabaseUrl || '';
      this.supabaseKey = supabaseKey || '';
      this.userResume = config.userResume || null;
      if (config.apiBaseUrl) this.apiBaseUrl = apiBaseUrl;
    }
  
    async checkResumeStatus() {
      if (!this.userResume) {
        this.showResumeUploadPrompt();
      }
    }
  
    showResumeUploadPrompt() {
      const existingPrompt = document.getElementById('cvmama-upload-prompt');
      if (existingPrompt) return;
  
      const prompt = document.createElement('div');
      prompt.id = 'cvmama-upload-prompt';
      prompt.className = 'cvmama-floating-prompt';
      prompt.innerHTML = `
        <div class="cvmama-prompt-content">
          <div class="cvmama-prompt-header">
            <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #2D5BFF 0%, #1E40D4 100%); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 14px;">CV</div>
            <h3>Welcome to CV Mama Job Assistant</h3>
            <button class="cvmama-prompt-close" id="cvmama-close-prompt">×</button>
          </div>
          <div class="cvmama-prompt-body">
            <p>Upload your resume to start analyzing jobs and optimizing your applications.</p>
            <button class="cvmama-btn cvmama-btn-primary" id="cvmama-upload-resume">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Upload Resume
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(prompt);
  
      document.getElementById('cvmama-close-prompt').addEventListener('click', () => {
        prompt.remove();
      });
  
      document.getElementById('cvmama-upload-resume').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openPopup' });
      });
  
      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        if (document.getElementById('cvmama-upload-prompt')) {
          prompt.remove();
        }
      }, 10000);
    }
  
    detectJobBoard() {
      const hostname = window.location.hostname;
      if (hostname.includes('linkedin.com')) {
        this.injectLinkedInButtons();
      } else if (hostname.includes('indeed.com')) {
        this.injectIndeedButtons();
      } else if (hostname.includes('glassdoor.com')) {
        this.injectGlassdoorButtons();
      } else if (hostname.includes('monster.com')) {
        this.injectMonsterButtons();
      }
    }
  
    observePageChanges() {
      const observer = new MutationObserver(() => {
        this.detectJobBoard();
      });
  
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
  
      // Also listen for URL changes (for SPAs)
      let lastUrl = location.href;
      new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          this.processedJobs.clear();
          setTimeout(() => this.detectJobBoard(), 1000);
        }
      }).observe(document, { subtree: true, childList: true });
    }
  
    injectLinkedInButtons() {
      // LinkedIn job cards in search results
      const jobCards = document.querySelectorAll('.jobs-search-results__list-item:not([data-cvmama-processed])');
      
      jobCards.forEach(card => {
        const jobData = this.extractLinkedInJobData(card);
        if (!jobData) return;
  
        const uniqueId = `linkedin-${jobData.jobId}`;
        if (this.processedJobs.has(uniqueId)) return;
        
        this.processedJobs.add(uniqueId);
        card.setAttribute('data-cvmama-processed', 'true');
        this.injectActionButtons(card, jobData, 'linkedin-list');
      });
  
      // LinkedIn job details view
      const jobDetailsContainer = document.querySelector('.jobs-details__main-content:not([data-cvmama-detail-processed])');
      if (jobDetailsContainer) {
        const jobData = this.extractLinkedInJobDetailsData();
        console.log(jobData);
        if (jobData) {
          jobDetailsContainer.setAttribute('data-cvmama-detail-processed', 'true');
          this.injectDetailViewButtons(jobDetailsContainer, jobData);
        }
      }
    }
  
    injectIndeedButtons() {
      const jobCards = document.querySelectorAll('.job_seen_beacon:not([data-cvmama-processed]), .jobsearch-SerpJobCard:not([data-cvmama-processed])');
      
      jobCards.forEach(card => {
        const jobData = this.extractIndeedJobData(card);
        if (!jobData) return;
  
        const uniqueId = `indeed-${jobData.jobId}`;
        if (this.processedJobs.has(uniqueId)) return;
  
        this.processedJobs.add(uniqueId);
        card.setAttribute('data-cvmama-processed', 'true');
        this.injectActionButtons(card, jobData, 'indeed');
      });
    }
  
    injectGlassdoorButtons() {
      const jobCards = document.querySelectorAll('[data-test="job-listing"]:not([data-cvmama-processed])');
      
      jobCards.forEach(card => {
        const jobData = this.extractGlassdoorJobData(card);
        if (!jobData) return;
  
        const uniqueId = `glassdoor-${jobData.jobId}`;
        if (this.processedJobs.has(uniqueId)) return;
  
        this.processedJobs.add(uniqueId);
        card.setAttribute('data-cvmama-processed', 'true');
        this.injectActionButtons(card, jobData, 'glassdoor');
      });
    }
  
    injectMonsterButtons() {
      const jobCards = document.querySelectorAll('[data-testid="job-card"]:not([data-cvmama-processed])');
      
      jobCards.forEach(card => {
        const jobData = this.extractMonsterJobData(card);
        if (!jobData) return;
  
        const uniqueId = `monster-${jobData.jobId}`;
        if (this.processedJobs.has(uniqueId)) return;
  
        this.processedJobs.add(uniqueId);
        card.setAttribute('data-cvmama-processed', 'true');
        this.injectActionButtons(card, jobData, 'monster');
      });
    }
  
    extractLinkedInJobData(card) {
      try {
        const titleEl = card.querySelector('.job-card-list__title, .job-card-container__link, [data-job-title-link]');
        const companyEl = card.querySelector('.job-card-container__company-name, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle');
        const locationEl = card.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption');
        const linkEl = card.querySelector('a[href*="/jobs/view/"]');
  
        if (!titleEl || !linkEl) return null;
  
        const jobId = linkEl.href.match(/\/jobs\/view\/(\d+)/)?.[1] || Date.now().toString();
  
        return {
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          url: linkEl.href.split('?')[0], // Remove query params
          jobId: jobId,
          source: 'linkedin',
          postedDate: new Date().toISOString()
        };
      } catch (e) {
        console.error('Error extracting LinkedIn job data:', e);
        return null;
      }
    }
  
    extractLinkedInJobDetailsData() {
      try {
        const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title, .t-24, h1.jobs-unified-top-card__job-title');
        const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a');
        const locationEl = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet');
        const descriptionEl = document.querySelector('.jobs-description, .jobs-description-content__text, .jobs-box__html-content');
  
        if (!titleEl) return null;
  
        const jobId = window.location.href.match(/\/jobs\/view\/(\d+)/)?.[1] || Date.now().toString();
  
        return {
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          description: descriptionEl?.textContent.trim() || '',
          url: window.location.href.split('?')[0],
          jobId: jobId,
          source: 'linkedin',
          postedDate: new Date().toISOString()
        };
      } catch (e) {
        console.error('Error extracting LinkedIn job details:', e);
        return null;
      }
    }
  
    extractIndeedJobData(card) {
      try {
        const titleEl = card.querySelector('.jobTitle, .jcs-JobTitle, h2.jobTitle');
        const companyEl = card.querySelector('.companyName, [data-testid="company-name"]');
        const locationEl = card.querySelector('.companyLocation, [data-testid="text-location"]');
        const linkEl = card.querySelector('a[href*="/viewjob"], a[href*="/rc/clk"]');
  
        if (!titleEl) return null;
  
        const jobId = linkEl?.href.match(/jk=([^&]+)/)?.[1] || Date.now().toString();
  
        return {
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          url: linkEl?.href || window.location.href,
          jobId: jobId,
          source: 'indeed',
          postedDate: new Date().toISOString()
        };
      } catch (e) {
        console.error('Error extracting Indeed job data:', e);
        return null;
      }
    }
  
    extractGlassdoorJobData(card) {
      try {
        const titleEl = card.querySelector('[data-test="job-title"], .jobTitle');
        const companyEl = card.querySelector('[data-test="employer-name"], .employerName');
        const locationEl = card.querySelector('[data-test="location"], .location');
        const linkEl = card.querySelector('a[href*="/job-listing/"]');
  
        if (!titleEl) return null;
  
        const jobId = linkEl?.href.match(/job-listing\/([^?]+)/)?.[1]?.replace(/\.htm$/, '') || Date.now().toString();
  
        return {
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          url: linkEl?.href || window.location.href,
          jobId: jobId,
          source: 'glassdoor',
          postedDate: new Date().toISOString()
        };
      } catch (e) {
        console.error('Error extracting Glassdoor job data:', e);
        return null;
      }
    }
  
    extractMonsterJobData(card) {
      try {
        const titleEl = card.querySelector('[data-testid="job-title"], h2');
        const companyEl = card.querySelector('[data-testid="company-name"]');
        const locationEl = card.querySelector('[data-testid="job-location"]');
        const linkEl = card.querySelector('a[href*="/job-opening/"]');
  
        if (!titleEl) return null;
  
        const jobId = linkEl?.href.match(/job-opening\/([^?]+)/)?.[1] || Date.now().toString();
  
        return {
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          location: locationEl?.textContent.trim() || '',
          url: linkEl?.href || window.location.href,
          jobId: jobId,
          source: 'monster',
          postedDate: new Date().toISOString()
        };
      } catch (e) {
        console.error('Error extracting Monster job data:', e);
        return null;
      }
    }
  
    injectActionButtons(container, jobData, source) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'cvmama-actions';
      actionsDiv.innerHTML = `
        <button class="cvmama-btn cvmama-btn-sm cvmama-btn-save" data-action="save" title="Save this job">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          Save
        </button>
        <button class="cvmama-btn cvmama-btn-sm cvmama-btn-scan" data-action="scan" title="Scan resume against this job">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Match Resume
        </button>
      `;
  
      const insertPoint = this.findInsertPoint(container, source);
      if (insertPoint) {
        insertPoint.appendChild(actionsDiv);
      } else {
        container.appendChild(actionsDiv);
      }
  
      actionsDiv.querySelector('[data-action="save"]').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.handleSaveJob(jobData, e.currentTarget);
      });
  
      actionsDiv.querySelector('[data-action="scan"]').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.handleScanJob(jobData, e.currentTarget);
      });
    }
  
    injectDetailViewButtons(container, jobData) {
      const existingActions = container.querySelector('.cvmama-actions-detail');
      if (existingActions) return;
  
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'cvmama-actions-detail';
      actionsDiv.innerHTML = `
  <div class="cvmama-detail-actions">
    <div class="cvmama-logo-container">
      <img src="https://cvmama.co.ke/cvmama-logo-color.png" alt="cvmama" class="cvmama-logo">
    </div>
    <div class="cvmama-actions-buttons">
      <button class="cvmama-btn cvmama-btn-save" data-action="save">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        Save Job
      </button>
      <button class="cvmama-btn cvmama-btn-primary cvmama-btn-scan" data-action="scan">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        Match Resume
      </button>
    </div>
  </div>
`;
    //   actionsDiv.innerHTML = `
    //     <div class="cvmama-detail-actions">
    //       <button class="cvmama-btn cvmama-btn-save" data-action="save">
    //         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    //           <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    //         </svg>
    //         Save Job
    //       </button>
    //       <button class="cvmama-btn cvmama-btn-primary cvmama-btn-scan" data-action="scan">
    //         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    //           <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    //           <polyline points="22 4 12 14.01 9 11.01"></polyline>
    //         </svg>
    //         Scan Resume
    //       </button>
    //     </div>
    //   `;
  
      const topCard = container.querySelector('.jobs-details__top-card, .jobs-unified-top-card, .job-details-jobs-unified-top-card');
      if (topCard) {
        topCard.appendChild(actionsDiv);
      } else {
        container.insertBefore(actionsDiv, container.firstChild);
      }
  
      actionsDiv.querySelector('[data-action="save"]').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.handleSaveJob(jobData, e.currentTarget);
      });
  
      actionsDiv.querySelector('[data-action="scan"]').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.handleScanJob(jobData, e.currentTarget);
      });
    }
  
    findInsertPoint(container, source) {
      if (source === 'linkedin-list') {
        return container.querySelector('.job-card-container__footer-wrapper, .job-card-list__footer-wrapper, .artdeco-entity-lockup__footer');
      } else if (source === 'indeed') {
        return container.querySelector('.jobCardShelfContainer, .job-card-footer');
      } else if (source === 'glassdoor') {
        return container.querySelector('[data-test="job-actions"], .JobCard__footer');
      } else if (source === 'monster') {
        return container.querySelector('[data-testid="job-card-footer"]');
      }
      return null;
    }
  
async handleSaveJob(jobData, button) {
  if (!this.supabaseUrl || !this.supabaseKey) {
    this.showNotification('Please configure Supabase credentials in settings', 'error');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="cvmama-spinner"></span> Saving...';

  try {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        title: jobData.title || 'Untitled',
        company: jobData.company || 'Unknown',
        location: jobData.location || 'N/A',
        type: jobData.type || 'Full-time',
        category: jobData.category || null,
        salary: jobData.salary || null,
        description: jobData.description || null,
        responsibilities: jobData.responsibilities ? JSON.stringify(jobData.responsibilities) : '[]',
        requirements: jobData.requirements ? JSON.stringify(jobData.requirements) : '[]',
        benefits: jobData.benefits ? JSON.stringify(jobData.benefits) : '[]',
        experience: jobData.experience || null,
        education: jobData.education || null,
        application_link: jobData.application_link || null,
        featured: jobData.featured || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });

    if (response.ok || response.status === 201) {
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        Saved
      `;
      button.classList.add('cvmama-btn-saved');
      this.showNotification('Job saved successfully!', 'success');
    } else {
      throw new Error(`Failed to save job. Status: ${response.status}`);
    }

  } catch (error) {
    console.error('Error saving job:', error);
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      Save
    `;
    button.disabled = false;
    this.showNotification('Failed to save job. Please try again.', 'error');
  }
}

  
    async handleScanJob(jobData, button) {
      if (!this.userResume) {
        this.showNotification('Please upload your resume first', 'error');
        this.showResumeUploadPrompt();
        return;
      }
  
      button.disabled = true;
      const originalHTML = button.innerHTML;
      button.innerHTML = '<span class="cvmama-spinner"></span> Scanning...';
  
      try {
        // Get full job description if available
        let jobDescription = jobData.description;
        if (!jobDescription || jobDescription.length < 100) {
          jobDescription = await this.extractJobDescription();
        }
  
        // Call backend API to score resume
        const response = await fetch(`${this.apiBaseUrl}/score-resume`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            resume_data: this.userResume.parsedData,
            job_description: jobDescription || jobData.title + ' ' + jobData.company,
            job_metadata: {
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              source: jobData.source
            }
          })
        });
  
        if (!response.ok) {
          throw new Error('Failed to scan resume');
        }
  
        const scanResult = await response.json();
  
        // Save scan result to Supabase
        await this.saveScanResult(jobData, scanResult);
  
        // Show results modal
        this.showScanResults(jobData, scanResult);
  
        button.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Scanned
        `;
        button.classList.add('cvmama-btn-scanned');
  
      } catch (error) {
        console.error('Error scanning job:', error);
        button.innerHTML = originalHTML;
        button.disabled = false;
        this.showNotification('Failed to scan resume. Please try again.', 'error');
      }
    }
  
    async extractJobDescription() {
      // Try to find job description on the current page
      const descriptionSelectors = [
        '.jobs-description',
        '.jobs-description-content__text',
        '.jobs-box__html-content',
        '[data-testid="job-description"]',
        '.jobsearch-jobDescriptionText',
        '[id*="JobDescription"]'
      ];
  
      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 100) {
          return element.textContent.trim();
        }
      }
  
      return '';
    }
  
    async saveScanResult(jobData, scanResult) {
      if (!this.supabaseUrl || !this.supabaseKey) return;
  
      try {
        const userId = await this.getUserId();
        
        await fetch(`${this.supabaseUrl}/rest/v1/scan_results`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            job_id: jobData.jobId,
            job_title: jobData.title,
            company: jobData.company,
            scan_result: scanResult,
            scanned_at: new Date().toISOString(),
            user_id: userId
          })
        });
      } catch (error) {
        console.error('Error saving scan result:', error);
      }
    }
  
    showScanResults(jobData, scanResult) {
      const modal = document.createElement('div');
      modal.className = 'cvmama-modal';
      modal.innerHTML = `
        <div class="cvmama-modal-overlay"></div>
        <div class="cvmama-modal-content">
          <div class="cvmama-modal-header">
            <h2>Resume Scan Results</h2>
            <button class="cvmama-modal-close">×</button>
          </div>
          <div class="cvmama-modal-body">
            <div class="cvmama-scan-header">
              <h3>${jobData.title}</h3>
              <p class="cvmama-company">${jobData.company}</p>
            </div>
            <div class="cvmama-score-card">
              <div class="cvmama-score-circle">
                <span class="cvmama-score-value">${scanResult.overall_score || 0}</span>
                <span class="cvmama-score-label">Overall Match</span>
              </div>
            </div>
            <div class="cvmama-scan-details">
              ${this.formatScanResults(scanResult)}
            </div>
            <div class="cvmama-modal-actions">
              <button class="cvmama-btn cvmama-btn-secondary" id="cvmama-view-details">View Full Report</button>
              <button class="cvmama-btn cvmama-btn-primary" id="cvmama-optimize-resume">Optimize Resume</button>
            </div>
          </div>
        </div>
      `;
  
      document.body.appendChild(modal);
  
      // Close handlers
      modal.querySelector('.cvmama-modal-close').addEventListener('click', () => modal.remove());
      modal.querySelector('.cvmama-modal-overlay').addEventListener('click', () => modal.remove());
      
      // Action handlers
      modal.querySelector('#cvmama-view-details').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openDashboard', data: { jobData, scanResult } });
        modal.remove();
      });
  
      modal.querySelector('#cvmama-optimize-resume').addEventListener('click', async () => {
        modal.remove();
        await this.handleOptimizeResume(jobData, scanResult);
      });
  
      // Close on Escape key
      document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
          modal.remove();
          document.removeEventListener('keydown', escapeHandler);
        }
      });
    }
  
    formatScanResults(scanResult) {
      const sections = [];
      
      if (scanResult.skills_match) {
        const matchingSkills = scanResult.skills_match.matching_skills || [];
        const missingSkills = scanResult.skills_match.missing_skills || [];
        
        sections.push(`
          <div class="cvmama-result-section">
            <h4>Skills Match: ${scanResult.skills_match.score || 0}%</h4>
            <div class="cvmama-progress-bar">
              <div class="cvmama-progress-fill" style="width: ${scanResult.skills_match.score || 0}%"></div>
            </div>
            ${matchingSkills.length > 0 ? `
              <p style="font-size: 13px; color: #10B981; margin-top: 8px;">✓ Matching: ${matchingSkills.slice(0, 5).join(', ')}</p>
            ` : ''}
            ${missingSkills.length > 0 ? `
              <p class="cvmama-missing">Missing: ${missingSkills.slice(0, 5).join(', ')}</p>
            ` : ''}
          </div>
        `);
      }
  
      if (scanResult.experience_match) {
        sections.push(`
          <div class="cvmama-result-section">
            <h4>Experience Match: ${scanResult.experience_match.score || 0}%</h4>
            <div class="cvmama-progress-bar">
              <div class="cvmama-progress-fill" style="width: ${scanResult.experience_match.score || 0}%"></div>
            </div>
          </div>
        `);
      }
  
      if (scanResult.keywords_match) {
        sections.push(`
          <div class="cvmama-result-section">
            <h4>Keywords Match: ${scanResult.keywords_match.score || 0}%</h4>
            <div class="cvmama-progress-bar">
              <div class="cvmama-progress-fill" style="width: ${scanResult.keywords_match.score || 0}%"></div>
            </div>
          </div>
        `);
      }
  
      if (scanResult.recommendations?.length) {
        sections.push(`
          <div class="cvmama-result-section">
            <h4>Top Recommendations</h4>
            <ul class="cvmama-recommendations">
              ${scanResult.recommendations.slice(0, 3).map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
        `);
      }
  
      return sections.join('');
    }
  
    async handleOptimizeResume(jobData, scanResult) {
      this.showNotification('Starting resume optimization...', 'info');
  
      try {
        const response = await fetch(`${this.apiBaseUrl}/optimize-resume`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            resume_data: this.userResume.parsedData,
            job_description: jobData.description || jobData.title,
            scan_results: scanResult,
            job_metadata: {
              title: jobData.title,
              company: jobData.company,
              location: jobData.location
            }
          })
        });
  
        if (!response.ok) {
          throw new Error('Failed to start optimization');
        }
  
        const result = await response.json();
        
        // Store task ID for tracking
        await chrome.storage.local.set({
          optimizationTask: {
            taskId: result.task_id,
            jobData: jobData,
            startedAt: new Date().toISOString()
          }
        });
  
        this.showNotification('Resume optimization started! You will be notified when complete.', 'success');
  
        // Start polling for completion
        chrome.runtime.sendMessage({ 
          action: 'startOptimizationPolling', 
          taskId: result.task_id 
        });
  
      } catch (error) {
        console.error('Error optimizing resume:', error);
        this.showNotification('Failed to start optimization. Please try again.', 'error');
      }
    }
  
    async getUserId() {
      const result = await chrome.storage.local.get(['userId']);
      if (!result.userId) {
        // Generate a unique user ID if not exists
        const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        await chrome.storage.local.set({ userId });
        return userId;
      }
      return result.userId;
    }


    async extract_job_data(card = null) {
      const hostname = window.location.hostname;
  
      if (hostname.includes('linkedin.com')) {
        return this.extractLinkedInJobDetailsData();
      } else if (hostname.includes('indeed.com')) {
        return this.extractIndeedJobData();
      } // etc...
    }
  
    showNotification(message, type = 'info') {
      // Remove any existing notifications
      const existingNotifications = document.querySelectorAll('.cvmama-notification');
      existingNotifications.forEach(n => n.remove());
  
      const notification = document.createElement('div');
      notification.className = `cvmama-notification cvmama-notification-${type}`;
      
      const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
      
      notification.innerHTML = `
        <div class="cvmama-notification-content">
          <span style="font-size: 18px; font-weight: 700;">${icon}</span>
          <span>${message}</span>
          <button class="cvmama-notification-close" style="margin-left: auto; background: none; border: none; font-size: 20px; cursor: pointer; color: inherit; opacity: 0.6; padding: 0; width: 24px; height: 24px;">×</button>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Add close button handler
      notification.querySelector('.cvmama-notification-close').addEventListener('click', () => {
        notification.classList.remove('cvmama-notification-show');
        setTimeout(() => notification.remove(), 300);
      });
  
      // Trigger animation
      setTimeout(() => {
        notification.classList.add('cvmama-notification-show');
      }, 10);
  
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        if (notification.parentElement) {
          notification.classList.remove('cvmama-notification-show');
          setTimeout(() => notification.remove(), 300);
        }
      }, 5000);
    }
  
    // Helper method to get text content safely
    getTextContent(element) {
      if (!element) return '';
      return element.textContent.trim();
    }
  
    // Helper method to get attribute safely
    getAttribute(element, attr) {
      if (!element) return '';
      return element.getAttribute(attr) || '';
    }
  }
  
  // Initialize detector when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new CVMamaJobDetector();
    });
  } else {
    new CVMamaJobDetector();
  }
  
  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'resumeUploaded') {
      // Reload config when resume is uploaded
      //window.location.reload();
    } else if (message.action === 'configUpdated') {
      // Reload config when settings are updated
      window.location.reload();
    }
  });
  
  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.userResume) {
      // Resume was updated
      const existingPrompt = document.getElementById('cvmama-upload-prompt');
      if (existingPrompt) {
        existingPrompt.remove();
      }
    }
  });


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




}
  