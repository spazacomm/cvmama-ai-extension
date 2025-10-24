// profile.js - Profile page logic

class ProfilePage {
    constructor() {
      this.profile = null;
      this.init();
    }
  
    async init() {
      await this.loadProfile();
      this.setupEventListeners();
      this.render();
    }
  
    async loadProfile() {
      try {
        const result = await chrome.storage.local.get(['profile', 'profileId']);
        
        if (!result.profile || !result.profileId) {
          this.showEmptyState();
          return;
        }
  
        this.profile = result.profile;
      } catch (error) {
        console.error('Error loading profile:', error);
        this.showEmptyState();
      }
    }
  
    render() {
      if (!this.profile || !this.profile.parsed_json || 
          Object.keys(this.profile.parsed_json).length === 0) {
        this.showEmptyState();
        return;
      }
  
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('profileContent').classList.remove('hidden');
  
      this.populateHeader();
      this.populateSkills();
      this.populateExperience();
      this.populateEducation();
    }
  
    populateHeader() {
      const data = this.profile.parsed_json;
      const basics = data.basics || {};
      const contact = data.contact || {};
  
      // Name
      const name = basics.name || data.full_name || 'Professional';
      document.getElementById('profileName').textContent = name;
  
      // Avatar initials
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      document.getElementById('profileAvatar').textContent = initials;
  
      // Title
      const title = basics.label || data.job_title || data.title || 'Professional';
      document.getElementById('profileTitle').textContent = title;
  
      // Contact info
      const email = basics.email || contact.email || '';
      const phone = basics.phone || contact.phone || '';
      const location = basics.location?.city || data.location || '';
  
      if (email) {
        document.getElementById('profileEmail').textContent = email;
      } else {
        document.getElementById('profileEmail').parentElement.style.display = 'none';
      }
  
      if (phone) {
        document.getElementById('profilePhone').textContent = phone;
      } else {
        document.getElementById('profilePhone').parentElement.style.display = 'none';
      }
  
      if (location) {
        document.getElementById('profileLocation').textContent = location;
      } else {
        document.getElementById('profileLocation').parentElement.style.display = 'none';
      }
    }
  
    populateSkills() {
      const data = this.profile.parsed_json;
      const skillsGrid = document.getElementById('skillsGrid');
      skillsGrid.innerHTML = '';
  
      let skills = [];
      
      if (data.skills && Array.isArray(data.skills)) {
        skills = data.skills;
      } else if (data.technical_skills && Array.isArray(data.technical_skills)) {
        skills = data.technical_skills;
      } else if (data.top_skills && Array.isArray(data.top_skills)) {
        skills = data.top_skills;
      }
  
      if (skills.length === 0) {
        skillsGrid.innerHTML = '<p style="color: #6B7280; font-size: 14px;">No skills extracted</p>';
        return;
      }
  
      skills.forEach(skill => {
        const skillName = typeof skill === 'string' ? skill : (skill.name || skill.skill);
        if (!skillName) return;
  
        const skillTag = document.createElement('div');
        skillTag.className = 'skill-tag';
        skillTag.textContent = skillName;
        skillsGrid.appendChild(skillTag);
      });
    }
  
    populateExperience() {
      const data = this.profile.parsed_json;
      const experienceList = document.getElementById('experienceList');
      experienceList.innerHTML = '';
  
      let experiences = [];
      
      if (data.work && Array.isArray(data.work)) {
        experiences = data.work;
      } else if (data.work_experience && Array.isArray(data.work_experience)) {
        experiences = data.work_experience;
      } else if (data.experience && Array.isArray(data.experience)) {
        experiences = data.experience;
      }
  
      if (experiences.length === 0) {
        experienceList.innerHTML = '<p style="color: #6B7280; font-size: 14px;">No work experience extracted</p>';
        return;
      }
  
      experiences.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'experience-item';
  
        const position = exp.position || exp.title || exp.role || 'Position';
        const company = exp.company || exp.organization || 'Company';
        const startDate = exp.startDate || exp.start_date || exp.from || '';
        const endDate = exp.endDate || exp.end_date || exp.to || 'Present';
        const description = exp.summary || exp.description || exp.responsibilities || '';
  
        let duration = '';
        if (startDate) {
          duration = `${this.formatDate(startDate)} - ${endDate === 'Present' ? 'Present' : this.formatDate(endDate)}`;
        }
  
        item.innerHTML = `
          <div class="experience-header">
            <div>
              <div class="experience-role">${position}</div>
              <div class="experience-company">${company}</div>
            </div>
            <div class="experience-duration">${duration}</div>
          </div>
          ${description ? `<div class="experience-description">${description}</div>` : ''}
        `;
  
        experienceList.appendChild(item);
      });
    }
  
    populateEducation() {
      const data = this.profile.parsed_json;
      const educationList = document.getElementById('educationList');
      educationList.innerHTML = '';
  
      let educations = [];
      
      if (data.education && Array.isArray(data.education)) {
        educations = data.education;
      }
  
      if (educations.length === 0) {
        educationList.innerHTML = '<p style="color: #6B7280; font-size: 14px;">No education extracted</p>';
        return;
      }
  
      educations.forEach(edu => {
        const item = document.createElement('div');
        item.className = 'education-item';
  
        const degree = edu.studyType || edu.degree || edu.level || 'Degree';
        const area = edu.area || edu.field || edu.major || '';
        const institution = edu.institution || edu.school || edu.university || 'Institution';
        const endDate = edu.endDate || edu.end_date || edu.graduation_date || '';
  
        const fullDegree = area ? `${degree} in ${area}` : degree;
  
        item.innerHTML = `
          <div class="education-degree">${fullDegree}</div>
          <div class="education-school">${institution}</div>
          ${endDate ? `<div class="education-year">${this.formatDate(endDate)}</div>` : ''}
        `;
  
        educationList.appendChild(item);
      });
    }
  
    formatDate(dateString) {
      if (!dateString) return '';
      
      // Handle various date formats
      try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
          return dateString; // Return as-is if can't parse
        }
        
        const options = { year: 'numeric', month: 'short' };
        return date.toLocaleDateString('en-US', options);
      } catch (error) {
        return dateString;
      }
    }
  
    showEmptyState() {
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('emptyState').classList.remove('hidden');
    }
  
    setupEventListeners() {
      const uploadBtn = document.getElementById('uploadResumeBtn');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
          // Open popup for upload
          chrome.runtime.openOptionsPage();
        });
      }
  
      const updateBtn = document.getElementById('updateResumeBtn');
      if (updateBtn) {
        updateBtn.addEventListener('click', () => {
          // Trigger file input through message to popup
          chrome.runtime.sendMessage({ type: 'OPEN_UPLOAD' });
        });
      }
  
      const viewAppsBtn = document.getElementById('viewApplicationsBtn');
      if (viewAppsBtn) {
        viewAppsBtn.addEventListener('click', () => {
          window.location.href = 'applications.html';
        });
      }
    }
  }
  
  // Initialize page
  document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
  });