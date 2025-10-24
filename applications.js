// applications.js - Applications page logic

class ApplicationsPage {
    constructor() {
      this.applications = [];
      this.filteredApplications = [];
      this.currentFilter = 'all';
      this.profileId = null;
      this.init();
    }
  
    async init() {
      await this.loadApplications();
      this.setupEventListeners();
      this.render();
      
      // Check for updates every 30 seconds
      setInterval(() => this.checkForUpdates(), 30000);
    }
  
    async loadApplications() {
      try {
        const { profileId } = await chrome.storage.local.get(['profileId']);
        
        if (!profileId) {
          this.showEmptyState();
          return;
        }
  
        this.profileId = profileId;
  
        // Fetch applications from background
        const response = await chrome.runtime.sendMessage({
          type: 'GET_APPLICATIONS',
          profileId: profileId
        });
  
        if (response && response.success) {
          this.applications = response.data || [];
          this.filteredApplications = this.applications;
          this.updateStats();
        } else {
          this.applications = [];
          this.filteredApplications = [];
        }
      } catch (error) {
        console.error('Error loading applications:', error);
        this.applications = [];
        this.filteredApplications = [];
      }
    }
  
    async checkForUpdates() {
      if (!this.profileId) return;
  
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_APPLICATIONS',
          profileId: this.profileId
        });
  
        if (response && response.success) {
          const newApps = response.data || [];
          
          // Check if any application status changed
          let hasChanges = false;
          newApps.forEach(newApp => {
            const oldApp = this.applications.find(a => a.id === newApp.id);
            if (!oldApp || oldApp.status !== newApp.status) {
              hasChanges = true;
            }
          });
  
          if (hasChanges) {
            this.applications = newApps;
            this.applyFilter(this.currentFilter);
            this.updateStats();
            this.render();
          }
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
      }
    }
  
    updateStats() {
      const total = this.applications.length;
      const completed = this.applications.filter(a => a.status === 'completed').length;
      const processing = this.applications.filter(a => a.status === 'processing').length;
  
      document.getElementById('totalApps').textContent = total;
      document.getElementById('completedApps').textContent = completed;
      document.getElementById('processingApps').textContent = processing;
    }
  
    render() {
      document.getElementById('loadingState').classList.add('hidden');
  
      if (this.filteredApplications.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('applicationsList').classList.add('hidden');
        return;
      }
  
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('applicationsList').classList.remove('hidden');
  
      const listContainer = document.getElementById('applicationsList');
      listContainer.innerHTML = '';
  
      this.filteredApplications.forEach(app => {
        const card = this.createApplicationCard(app);
        listContainer.appendChild(card);
      });
    }
  
    createApplicationCard(app) {
      const card = document.createElement('div');
      card.className = `application-card status-${app.status}`;
  
      const matchScore = app.match_score || 0;
      const scoreClass = matchScore >= 75 ? 'score-high' : matchScore >= 50 ? 'score-medium' : 'score-low';
  
      const createdDate = new Date(app.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
  
      card.innerHTML = `
        <div class="app-header">
          <div class="app-info">
            <div class="app-title">${app.job_title}</div>
            <div class="app-company">${app.company}</div>
            <div class="app-meta">
              <span class="meta-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                ${app.job_location || 'Remote'}
              </span>
              <span class="meta-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${createdDate}
              </span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
            <span class="status-badge status-${app.status}">${this.formatStatus(app.status)}</span>
            ${matchScore > 0 ? `
              <div class="match-score ${scoreClass}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                ${matchScore}% Match
              </div>
            ` : ''}
          </div>
        </div>
  
        ${app.status === 'processing' ? `
          <div class="progress-container">
            <div class="progress-label">Optimization in progress...</div>
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
          </div>
        ` : ''}
  
        <div class="app-actions">
          <button class="btn btn-secondary" onclick="window.applicationsPage.viewJob('${app.job_url}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            View Job
          </button>
          
          ${app.status === 'completed' && app.optimized_resume_url ? `
            <button class="btn btn-success" onclick="window.applicationsPage.downloadResume('${app.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Resume
            </button>
          ` : ''}
  
          ${app.status === 'completed' && app.cover_letter_url ? `
            <button class="btn btn-success" onclick="window.applicationsPage.downloadCoverLetter('${app.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Download Cover Letter
            </button>
          ` : ''}
  
          ${app.status === 'failed' ? `
            <button class="btn btn-primary" onclick="window.applicationsPage.retryOptimization('${app.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Retry
            </button>
          ` : ''}
        </div>
      `;
  
      return card;
    }
  
    formatStatus(status) {
      const statusMap = {
        'completed': 'Completed',
        'processing': 'Processing',
        'pending': 'Pending',
        'failed': 'Failed'
      };
      return statusMap[status] || status;
    }
  
    applyFilter(filter) {
      this.currentFilter = filter;
  
      if (filter === 'all') {
        this.filteredApplications = this.applications;
      } else {
        this.filteredApplications = this.applications.filter(app => app.status === filter);
      }
  
      this.render();
    }
  
    setupEventListeners() {
      // Filter buttons
      const filterButtons = document.querySelectorAll('.filter-btn');
      filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          // Update active state
          filterButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
  
          // Apply filter
          const filter = btn.getAttribute('data-filter');
          this.applyFilter(filter);
        });
      });
    }
  
    viewJob(url) {
      if (url) {
        chrome.tabs.create({ url });
      }
    }
  
    async downloadResume(applicationId) {
      try {
        const app = this.applications.find(a => a.id === applicationId);
        if (!app || !app.optimized_resume_url) {
          alert('Resume not available');
          return;
        }
  
        // Open download URL
        chrome.tabs.create({ url: app.optimized_resume_url });
      } catch (error) {
        console.error('Error downloading resume:', error);
        alert('Failed to download resume');
      }
    }
  
    async downloadCoverLetter(applicationId) {
      try {
        const app = this.applications.find(a => a.id === applicationId);
        if (!app || !app.cover_letter_url) {
          alert('Cover letter not available');
          return;
        }
  
        // Open download URL
        chrome.tabs.create({ url: app.cover_letter_url });
      } catch (error) {
        console.error('Error downloading cover letter:', error);
        alert('Failed to download cover letter');
      }
    }
  
    async retryOptimization(applicationId) {
      try {
        const app = this.applications.find(a => a.id === applicationId);
        if (!app) return;
  
        // Retry optimization
        const response = await chrome.runtime.sendMessage({
          type: 'RETRY_OPTIMIZATION',
          applicationId: applicationId
        });
  
        if (response && response.success) {
          alert('Optimization restarted successfully');
          await this.loadApplications();
          this.render();
        } else {
          alert('Failed to restart optimization');
        }
      } catch (error) {
        console.error('Error retrying optimization:', error);
        alert('Failed to restart optimization');
      }
    }
  
    showEmptyState() {
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('emptyState').classList.remove('hidden');
    }
  }
  
  // Initialize page and expose globally
  window.applicationsPage = null;
  
  document.addEventListener('DOMContentLoaded', () => {
    window.applicationsPage = new ApplicationsPage();
  });