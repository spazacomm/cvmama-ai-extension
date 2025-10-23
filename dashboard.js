// Dashboard JavaScript for CV Mama Extension
class CVMamaDashboard {
    constructor() {
      this.supabaseUrl = '';
      this.supabaseKey = '';
      this.userId = 'anonymous';
      this.currentView = 'overview';
      this.init();
    }
  
    async init() {
      await this.loadConfig();
      this.setupNavigation();
      this.checkUrlParams();
      await this.loadDashboardData();
    }
  
    async loadConfig() {
      const config = await chrome.storage.local.get([
        'supabaseUrl',
        'supabaseKey',
        'userId'
      ]);
  
      this.supabaseUrl = config.supabaseUrl || '';
      this.supabaseKey = config.supabaseKey || '';
      this.userId = config.userId || 'anonymous';
    }
  
    setupNavigation() {
      document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const view = e.currentTarget.dataset.view;
          this.switchView(view);
        });
      });
    }
  
    checkUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      if (view) {
        this.switchView(view);
      }
    }
  
    switchView(viewName) {
      this.currentView = viewName;
  
      // Update navigation
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.view === viewName) {
          link.classList.add('active');
        }
      });
  
      // Show/hide content
      document.querySelectorAll('.view-content').forEach(content => {
        content.classList.remove('active');
      });
  
      const viewId = viewName.replace(/-([a-z])/g, (g) => g[1].toUpperCase()) + 'View';
      const viewElement = document.getElementById(viewId);
      if (viewElement) {
        viewElement.classList.add('active');
      }
  
      // Load view-specific data
      this.loadViewData(viewName);
    }
  
    async loadDashboardData() {
      await Promise.all([
        this.loadStats(),
        this.loadRecentActivity()
      ]);
    }
  
    async loadStats() {
      if (!this.supabaseUrl || !this.supabaseKey) {
        console.warn('Supabase not configured');
        return;
      }
  
      try {
        // Fetch saved jobs
        const savedJobsRes = await fetch(
          `${this.supabaseUrl}/rest/v1/saved_jobs?user_id=eq.${this.userId}&select=*`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        // Fetch scan results
        const scanResultsRes = await fetch(
          `${this.supabaseUrl}/rest/v1/scan_results?user_id=eq.${this.userId}&select=*`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        // Fetch optimizations
        const optimizationsRes = await fetch(
          `${this.supabaseUrl}/rest/v1/optimization_results?user_id=eq.${this.userId}&select=*`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        if (savedJobsRes.ok) {
          const savedJobs = await savedJobsRes.json();
          document.getElementById('totalSavedJobs').textContent = savedJobs.length;
        }
  
        if (scanResultsRes.ok) {
          const scans = await scanResultsRes.json();
          document.getElementById('totalScans').textContent = scans.length;
  
          // Calculate average score
          if (scans.length > 0) {
            const scores = scans.map(s => s.scan_result?.overall_score || 0);
            const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            document.getElementById('avgScore').textContent = avgScore + '%';
          }
        }
  
        if (optimizationsRes.ok) {
          const optimizations = await optimizationsRes.json();
          document.getElementById('totalOptimizations').textContent = optimizations.length;
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    }
  
    async loadRecentActivity() {
      const content = document.getElementById('recentActivityContent');
  
      if (!this.supabaseUrl || !this.supabaseKey) {
        content.innerHTML = this.renderEmptyState(
          'No Data Available',
          'Please configure Supabase in the extension settings'
        );
        return;
      }
  
      try {
        // Fetch recent scans
        const response = await fetch(
          `${this.supabaseUrl}/rest/v1/scan_results?user_id=eq.${this.userId}&select=*&order=scanned_at.desc&limit=5`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        if (!response.ok) throw new Error('Failed to fetch activity');
  
        const scans = await response.json();
  
        if (scans.length === 0) {
          content.innerHTML = this.renderEmptyState(
            'No Activity Yet',
            'Start scanning jobs to see your activity here'
          );
          return;
        }
  
        content.innerHTML = `
          <div class="job-list">
            ${scans.map(scan => this.renderActivityItem(scan)).join('')}
          </div>
        `;
      } catch (error) {
        console.error('Error loading recent activity:', error);
        content.innerHTML = this.renderEmptyState(
          'Error Loading Data',
          'Please check your connection and try again'
        );
      }
    }
  
    renderActivityItem(scan) {
      const score = scan.scan_result?.overall_score || 0;
      const scoreClass = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
      const date = new Date(scan.scanned_at).toLocaleDateString();
  
      return `
        <div class="job-item">
          <div class="job-header">
            <div>
              <div class="job-title">${scan.job_title || 'Unknown Position'}</div>
              <div class="job-company">${scan.company || 'Unknown Company'}</div>
              <div class="job-meta">
                <span class="job-meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  ${date}
                </span>
              </div>
            </div>
            <div class="job-score">
              <div class="score-badge ${scoreClass}">${score}%</div>
              <div class="score-label">Match Score</div>
            </div>
          </div>
        </div>
      `;
    }
  
    async loadViewData(viewName) {
      switch (viewName) {
        case 'saved-jobs':
          await this.loadSavedJobs();
          break;
        case 'scans':
          await this.loadScans();
          break;
        case 'resume':
          await this.loadResume();
          break;
        case 'analysis':
          await this.loadAnalysis();
          break;
        case 'optimization':
          await this.loadOptimizations();
          break;
      }
    }
  
    async loadSavedJobs() {
      const content = document.getElementById('savedJobsContent');
  
      if (!this.supabaseUrl || !this.supabaseKey) {
        content.innerHTML = this.renderEmptyState(
          'Configuration Required',
          'Please configure Supabase in the extension settings'
        );
        return;
      }
  
      try {
        const response = await fetch(
          `${this.supabaseUrl}/rest/v1/saved_jobs?user_id=eq.${this.userId}&select=*&order=saved_at.desc`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        if (!response.ok) throw new Error('Failed to fetch saved jobs');
  
        const jobs = await response.json();
  
        if (jobs.length === 0) {
          content.innerHTML = this.renderEmptyState(
            'No Saved Jobs',
            'Start saving jobs from LinkedIn, Indeed, or other job boards',
            'Browse Jobs'
          );
          return;
        }
  
        content.innerHTML = `
          <div class="job-list">
            ${jobs.map(job => this.renderJobItem(job)).join('')}
          </div>
        `;
      } catch (error) {
        console.error('Error loading saved jobs:', error);
        content.innerHTML = this.renderEmptyState(
          'Error Loading Jobs',
          'Please check your connection and try again'
        );
      }
    }
  
    renderJobItem(job) {
      const date = new Date(job.saved_at).toLocaleDateString();
      const source = job.source || 'unknown';
  
      return `
        <div class="job-item" onclick="window.open('${job.url}', '_blank')">
          <div class="job-header">
            <div>
              <div class="job-title">${job.title}</div>
              <div class="job-company">${job.company}</div>
              <div class="job-meta">
                <span class="job-meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  ${job.location || 'Remote'}
                </span>
                <span class="job-meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  ${date}
                </span>
                <span class="job-meta-item" style="text-transform: capitalize;">
                  ${source}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  
    async loadScans() {
      const content = document.getElementById('scansContent');
  
      if (!this.supabaseUrl || !this.supabaseKey) {
        content.innerHTML = this.renderEmptyState(
          'Configuration Required',
          'Please configure Supabase in the extension settings'
        );
        return;
      }
  
      try {
        const response = await fetch(
          `${this.supabaseUrl}/rest/v1/scan_results?user_id=eq.${this.userId}&select=*&order=scanned_at.desc`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        if (!response.ok) throw new Error('Failed to fetch scans');
  
        const scans = await response.json();
  
        if (scans.length === 0) {
          content.innerHTML = this.renderEmptyState(
            'No Scans Yet',
            'Start scanning jobs to see how your resume matches',
            'Browse Jobs'
          );
          return;
        }
  
        content.innerHTML = `
          <div class="job-list">
            ${scans.map(scan => this.renderScanItem(scan)).join('')}
          </div>
        `;
      } catch (error) {
        console.error('Error loading scans:', error);
        content.innerHTML = this.renderEmptyState(
          'Error Loading Scans',
          'Please check your connection and try again'
        );
      }
    }
  
    renderScanItem(scan) {
      const score = scan.scan_result?.overall_score || 0;
      const scoreClass = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
      const date = new Date(scan.scanned_at).toLocaleDateString();
      const skillsMatch = scan.scan_result?.skills_match?.score || 0;
      const experienceMatch = scan.scan_result?.experience_match?.score || 0;
  
      return `
        <div class="job-item">
          <div class="job-header">
            <div style="flex: 1;">
              <div class="job-title">${scan.job_title}</div>
              <div class="job-company">${scan.company}</div>
              <div class="job-meta">
                <span class="job-meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  ${date}
                </span>
              </div>
              <div style="margin-top: 16px;">
                <div style="font-size: 13px; color: #6B7280; margin-bottom: 8px;">Skills Match: ${skillsMatch}%</div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${skillsMatch}%"></div>
                </div>
                <div style="font-size: 13px; color: #6B7280; margin: 12px 0 8px;">Experience Match: ${experienceMatch}%</div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${experienceMatch}%"></div>
                </div>
              </div>
            </div>
            <div class="job-score">
              <div class="score-badge ${scoreClass}">${score}%</div>
              <div class="score-label">Overall Match</div>
            </div>
          </div>
        </div>
      `;
    }
  
    async loadResume() {
      const content = document.getElementById('resumeContent');
  
      try {
        const { userResume } = await chrome.storage.local.get(['userResume']);
  
        if (!userResume) {
          content.innerHTML = this.renderEmptyState(
            'No Resume Uploaded',
            'Upload your resume to get started',
            'Upload Resume'
          );
          return;
        }
  
        const parsedData = userResume.parsedData;
  
        content.innerHTML = `
          <div class="resume-section">
            <h2 class="resume-section-title">Personal Information</h2>
            <div class="resume-content">
              <p><strong>Name:</strong> ${parsedData.name || 'Not provided'}</p>
              <p><strong>Email:</strong> ${parsedData.email || 'Not provided'}</p>
              <p><strong>Phone:</strong> ${parsedData.phone || 'Not provided'}</p>
              <p><strong>Location:</strong> ${parsedData.location || 'Not provided'}</p>
            </div>
          </div>
  
          ${parsedData.summary ? `
            <div class="resume-section">
              <h2 class="resume-section-title">Professional Summary</h2>
              <div class="resume-content">
                <p>${parsedData.summary}</p>
              </div>
            </div>
          ` : ''}
  
          ${parsedData.skills && parsedData.skills.length > 0 ? `
            <div class="resume-section">
              <h2 class="resume-section-title">Skills</h2>
              <div class="skill-tags">
                ${parsedData.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
              </div>
            </div>
          ` : ''}
  
          ${parsedData.experience && parsedData.experience.length > 0 ? `
            <div class="resume-section">
              <h2 class="resume-section-title">Work Experience</h2>
              <div class="resume-content">
                ${parsedData.experience.map(exp => `
                  <div style="margin-bottom: 24px;">
                    <p><strong>${exp.title || 'Position'}</strong> at ${exp.company || 'Company'}</p>
                    <p style="color: #6B7280; font-size: 13px;">${exp.dates || 'Dates not provided'}</p>
                    ${exp.description ? `<p style="margin-top: 8px;">${exp.description}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
  
          ${parsedData.education && parsedData.education.length > 0 ? `
            <div class="resume-section">
              <h2 class="resume-section-title">Education</h2>
              <div class="resume-content">
                ${parsedData.education.map(edu => `
                  <div style="margin-bottom: 16px;">
                    <p><strong>${edu.degree || 'Degree'}</strong></p>
                    <p style="color: #6B7280;">${edu.institution || 'Institution'} - ${edu.year || 'Year'}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        `;
      } catch (error) {
        console.error('Error loading resume:', error);
        content.innerHTML = this.renderEmptyState(
          'Error Loading Resume',
          'Please try reloading the page'
        );
      }
    }
  
    async loadAnalysis() {
      const content = document.getElementById('analysisContent');
  
      try {
        const { lastAnalysis } = await chrome.storage.local.get(['lastAnalysis']);
  
        if (!lastAnalysis) {
          content.innerHTML = this.renderEmptyState(
            'No Analysis Available',
            'Analyze your resume from the extension popup to see insights here',
            'Open Extension'
          );
          return;
        }
  
        content.innerHTML = `
          <div class="analysis-grid">
            ${lastAnalysis.scores ? Object.entries(lastAnalysis.scores).map(([key, value]) => `
              <div class="analysis-card">
                <div class="analysis-score">
                  <h3>${this.formatScoreLabel(key)}</h3>
                  <div class="score-circle">${value}%</div>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${value}%"></div>
                </div>
              </div>
            `).join('') : ''}
          </div>
  
          ${lastAnalysis.recommendations && lastAnalysis.recommendations.length > 0 ? `
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Recommendations</h2>
              </div>
              <ul class="recommendations-list">
                ${lastAnalysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
  
          ${lastAnalysis.strengths && lastAnalysis.strengths.length > 0 ? `
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Strengths</h2>
              </div>
              <ul class="recommendations-list">
                ${lastAnalysis.strengths.map(strength => `<li>${strength}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
  
          ${lastAnalysis.improvements && lastAnalysis.improvements.length > 0 ? `
            <div class="card">
              <div class="card-header">
                <h2 class="card-title">Areas for Improvement</h2>
              </div>
              <ul class="recommendations-list">
                ${lastAnalysis.improvements.map(improvement => `<li>${improvement}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        `;
      } catch (error) {
        console.error('Error loading analysis:', error);
        content.innerHTML = this.renderEmptyState(
          'Error Loading Analysis',
          'Please try reloading the page'
        );
      }
    }
  
    async loadOptimizations() {
      const content = document.getElementById('optimizationContent');
  
      if (!this.supabaseUrl || !this.supabaseKey) {
        content.innerHTML = this.renderEmptyState(
          'Configuration Required',
          'Please configure Supabase in the extension settings'
        );
        return;
      }
  
      try {
        const response = await fetch(
          `${this.supabaseUrl}/rest/v1/optimization_results?user_id=eq.${this.userId}&select=*&order=completed_at.desc`,
          {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`
            }
          }
        );
  
        if (!response.ok) throw new Error('Failed to fetch optimizations');
  
        const optimizations = await response.json();
  
        if (optimizations.length === 0) {
          content.innerHTML = this.renderEmptyState(
            'No Optimizations Yet',
            'Scan a job and request resume optimization to see results here'
          );
          return;
        }
  
        content.innerHTML = `
          <div class="job-list">
            ${optimizations.map(opt => this.renderOptimizationItem(opt)).join('')}
          </div>
        `;
      } catch (error) {
        console.error('Error loading optimizations:', error);
        content.innerHTML = this.renderEmptyState(
          'Error Loading Optimizations',
          'Please check your connection and try again'
        );
      }
    }
  
    renderOptimizationItem(optimization) {
      const date = new Date(optimization.completed_at).toLocaleDateString();
  
      return `
        <div class="job-item">
          <div class="job-header">
            <div style="flex: 1;">
              <div class="job-title">Optimization #${optimization.task_id.slice(0, 8)}</div>
              <div class="job-company">Completed on ${date}</div>
              <button class="btn btn-primary btn-sm" style="margin-top: 12px;" onclick="alert('Download feature coming soon!')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download Optimized Resume
              </button>
            </div>
          </div>
        </div>
      `;
    }
  
    formatScoreLabel(key) {
      return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  
    renderEmptyState(title, description, buttonText = null) {
      return `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <h3 class="empty-title">${title}</h3>
          <p class="empty-text">${description}</p>
          ${buttonText ? `<button class="btn btn-primary">${buttonText}</button>` : ''}
        </div>
      `;
    }
  }
  
  // Initialize dashboard
  document.addEventListener('DOMContentLoaded', () => {
    new CVMamaDashboard();
  });