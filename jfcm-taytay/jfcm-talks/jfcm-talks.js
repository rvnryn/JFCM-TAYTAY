/* JFCM Talks page JavaScript */

// API Configuration
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8000';
const API_ENDPOINT = `${API_BASE_URL}/api/jfcm-talks`;

// Use global escapeHtml from config.js (with inline fallback for safety)
const escapeHtml = window.escapeHtml || function (str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
let currentUser = null; // Store current user info

// Fetch current user info
async function fetchCurrentUser() {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      currentUser = await response.json();
      return currentUser;
    }
  } catch (error) {
    console.error('Error fetching current user:', error);
  }
  return null;
}

// --- RBAC: Add admin class to body for admin users, hide admin-only by default ---
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

function applyRoleBasedUI() {
  const token = localStorage.getItem('access_token');
  const user = token ? parseJwt(token) : null;
  const userRole = user ? user.role : null;

  // Add 'admin' class to body for admin users
  if (userRole === 'admin') {
    document.body.classList.add('admin');
  } else {
    document.body.classList.remove('admin');
  }
}

function showSkeletonGrid(count = 6) {
  const contentList = document.querySelector('.content-list');
  if (!contentList) return;
  if (!document.getElementById('skeletonStyles')) {
    const style = document.createElement('style');
    style.id = 'skeletonStyles';
    style.textContent = `
      @keyframes shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position:  600px 0; }
      }
      .skeleton-grid {
        display: contents;
      }
      .skeleton-card {
        background: #fff;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid #e2e8f0;
        box-shadow: 0 2px 8px rgba(15,23,42,0.04);
      }
      .skeleton-preview {
        width: 100%;
        padding-bottom: 56.25%;
        height: 0;
        background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
        background-size: 600px 100%;
        animation: shimmer 1.4s infinite linear;
      }
      .skeleton-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .skeleton-line {
        border-radius: 6px;
        background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
        background-size: 600px 100%;
        animation: shimmer 1.4s infinite linear;
      }
      .skeleton-title-line        { height: 14px; width: 90%; }
      .skeleton-title-line.short  { width: 60%; }
      .skeleton-meta-line         { height: 12px; width: 50%; margin-top: 4px; }
      .skeleton-action-line       { height: 32px; width: 100%; border-radius: 8px; margin-top: 6px; }
    `;
    document.head.appendChild(style);
  }
  const cards = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton-preview"></div>
      <div class="skeleton-body">
        <div class="skeleton-line skeleton-title-line"></div>
        <div class="skeleton-line skeleton-title-line short"></div>
        <div class="skeleton-line skeleton-meta-line"></div>
        <div class="skeleton-line skeleton-action-line"></div>
      </div>
    </div>
  `).join('');
  contentList.innerHTML = `<div class="skeleton-grid">${cards}</div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  showSkeletonGrid(6);
  // Fetch current user first
  await fetchCurrentUser();
  applyRoleBasedUI();

  // Also refresh RBAC UI when page becomes visible or regains focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) applyRoleBasedUI();
  });
  window.addEventListener('focus', applyRoleBasedUI);

  // ...existing code...
  // Get filter elements by ID
  const topicSelect = document.getElementById('topicFilter');
  const sortSelect = document.getElementById('sortFilter');
  const searchInput = document.getElementById('searchInput');
  const searchSuggestions = document.getElementById('searchSuggestions');

  // Load videos from backend
  loadVideosFromBackend();

  // State variables for filters - read from dropdown initial values
  let currentTopic = 'all';
  let currentSort = sortSelect.value || 'newest';
  let currentSearch = '';
  let allVideos = []; // Store all videos for search suggestions
  let selectedSuggestionIndex = -1; // Track selected suggestion for keyboard navigation

  // Toast notification function
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = toast.querySelector('.toast-icon');
    const toastMessage = toast.querySelector('.toast-message');

    // Set icon based on type
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-times-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };

    toastIcon.className = `toast-icon ${icons[type] || icons.success}`;
    toastMessage.textContent = message;

    // Remove existing type classes and add new one
    toast.classList.remove('success', 'error', 'warning', 'info');
    toast.classList.add(type);

    // Show toast
    toast.classList.add('show');

    // Auto hide after 4 seconds
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  // Toast close button
  const toastClose = document.getElementById('toastClose');
  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('toast').classList.remove('show');
    });
  }

  // Upload Progress Modal
  const uploadProgressModal = document.getElementById('uploadProgressModal');
  const uploadStatusText = document.getElementById('uploadStatusText');
  const uploadDetails = document.getElementById('uploadDetails');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const closeProgressBtn = document.getElementById('closeProgressBtn');

  // Show upload progress modal
  function showUploadProgress(videoTitle, uploadId) {
    uploadStatusText.textContent = 'Uploading to Internet Archive...';
    uploadDetails.textContent = `Video: ${videoTitle}`;
    uploadProgressBar.style.width = '10%';
    closeProgressBtn.style.display = 'none';
    uploadProgressModal.style.display = 'flex';
    
    // Poll for status updates
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_ENDPOINT}/upload-status/${uploadId}`);
        const data = await response.json();
        
        if (data.status === 'uploading') {
          uploadStatusText.textContent = 'Uploading to Internet Archive...';
          uploadProgressBar.style.width = '30%';
        } else if (data.status === 'processing') {
          uploadStatusText.textContent = 'Processing video on Internet Archive...';
          uploadDetails.textContent = `Video: ${videoTitle} - This may take 5-30 minutes`;
          uploadProgressBar.style.width = '60%';
        } else if (data.status === 'completed') {
          clearInterval(pollInterval);
          uploadStatusText.textContent = 'Upload completed!';
          uploadDetails.textContent = `Video "${videoTitle}" is now available`;
          uploadProgressBar.style.width = '100%';
          closeProgressBtn.style.display = 'block';
          uploadingVideos.delete(uploadId);
          loadVideosFromBackend();
          
          // Auto-close after 3 seconds
          setTimeout(() => {
            uploadProgressModal.style.display = 'none';
          }, 3000);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          uploadStatusText.textContent = 'Upload failed';
          uploadDetails.textContent = data.error || 'An error occurred during upload';
          uploadProgressBar.style.width = '100%';
          uploadProgressBar.style.background = '#e74c3c';
          closeProgressBtn.style.display = 'block';
          uploadingVideos.delete(uploadId);
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 5000); // Poll every 5 seconds
  }
  
  // Close progress button handler
  closeProgressBtn.addEventListener('click', () => {
    uploadProgressModal.style.display = 'none';
    uploadProgressBar.style.background = 'linear-gradient(90deg, #4a90e2, #357ab8)';
  });
  
  // Upload Type Modal
  const uploadTypeModal = document.getElementById('uploadTypeModal');
  const closeTypeModal = document.getElementById('closeTypeModal');
  const selectYoutubeBtn = document.getElementById('selectYoutubeBtn');
  
  // YouTube Modal
  const youtubeModal = document.getElementById('youtubeModal');
  const closeYoutubeModal = document.getElementById('closeYoutubeModal');
  const cancelYoutubeBtn = document.getElementById('cancelYoutubeBtn');
  const youtubeUploadForm = document.getElementById('youtubeUploadForm');
  const videoTopicInput = document.getElementById('videoTopic');

  // Delete Modal
  const deleteModal = document.getElementById('deleteModal');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const deleteVideoTitle = document.getElementById('deleteVideoTitle');
  let videoToDelete = null;

  // Open YouTube upload modal directly
  uploadBtn.addEventListener('click', () => {
    youtubeModal.style.display = 'flex';
  });

  // Close YouTube modal
  closeYoutubeModal.addEventListener('click', () => {
    youtubeModal.style.display = 'none';
    youtubeUploadForm.reset();
  });

  cancelYoutubeBtn.addEventListener('click', () => {
    youtubeModal.style.display = 'none';
    youtubeUploadForm.reset();
  });

  // No custom topic logic needed, topic is now a free text input

  // Extract YouTube video ID from URL
  function extractYouTubeId(url) {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  }

  // Handle YouTube form submission
  youtubeUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('videoTitle').value;
    const youtubeLink = document.getElementById('youtubeLink').value;
    let topic = videoTopicInput.value.trim();
    const description = document.getElementById('videoDescription').value;

    if (!topic) {
      showToast('Please enter a topic for the video.', 'warning');
      return;
    }

    // Validate YouTube link
    const videoId = extractYouTubeId(youtubeLink);
    if (!videoId) {
      showToast('Please enter a valid YouTube link', 'error');
      return;
    }

    // Get authentication token from localStorage
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      showToast('You must be logged in to upload videos. Redirecting to login...', 'error');
      setTimeout(() => { window.location.href = '../login/login.html'; }, 1500);
      return;
    }

    // Create video data object
    const videoData = {
      title: title,
      youtubeLink: youtubeLink,
      topic: topic,
      description: description || null
    };

    try {
      // Send to backend API
      const response = await fetch(`${API_ENDPOINT}/upload/youtube`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(videoData)
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401 || response.status === 403) {
          showToast('Your session has expired. Please log in again.', 'error');
          localStorage.removeItem('access_token');
          setTimeout(() => { window.location.href = '../login/login.html'; }, 1500);
          return;
        }
        throw new Error(result.detail || 'Failed to upload video');
      }
      showToast('YouTube video uploaded successfully!', 'success');
      youtubeModal.style.display = 'none';
      youtubeUploadForm.reset();
      
      loadVideosFromBackend();
    } catch (error) {
      console.error('Error uploading YouTube video:', error);
      showToast(`Failed to upload video: ${error.message}`, 'error');
    }
  });

  // File upload form removed - only YouTube upload supported

  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === uploadTypeModal) {
      uploadTypeModal.style.display = 'none';
    }
    if (e.target === youtubeModal) {
      youtubeModal.style.display = 'none';
      youtubeUploadForm.reset();
    }
  });

  // Play video function - replaces thumbnail with iframe
  function handlePlayVideo(event) {
    const button = event.currentTarget;
    const videoId = button.getAttribute('data-video-id');
    const videoCard = button.closest('.video-card');
    const thumbnailWrapper = videoCard.querySelector('.video-thumbnail-wrapper');
    
    // Replace thumbnail with iframe
    const iframe = document.createElement('div');
    iframe.className = 'video-player-container';
    iframe.innerHTML = `
      <iframe 
        src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0" 
        title="Video player"
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>
    `;
    
    thumbnailWrapper.replaceWith(iframe);
  }

  // Delete video function
  async function handleDeleteVideo(event) {
    const videoId = event.currentTarget.getAttribute('data-video-id');
    const videoTitle = event.currentTarget.getAttribute('data-video-title');
    const videoSource = event.currentTarget.getAttribute('data-source');
    const videoIdentifier = event.currentTarget.getAttribute('data-identifier');

    // Store video info and show custom delete modal
    videoToDelete = { 
      id: videoId, 
      title: videoTitle, 
      source: videoSource,
      identifier: videoIdentifier,
      button: event.currentTarget 
    };
    deleteVideoTitle.textContent = `"${videoTitle}"`;
    deleteModal.style.display = 'flex';
  }

  // Cancel delete
  cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    videoToDelete = null;
  });

  // Close delete modal when clicking outside
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      deleteModal.style.display = 'none';
      videoToDelete = null;
    }
  });

  // Confirm delete
  confirmDeleteBtn.addEventListener('click', async () => {
    if (!videoToDelete) return;

    const { id, title, source, identifier, button } = videoToDelete;

    // Get authentication token
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      showToast('You must be logged in to delete videos.', 'error');
      deleteModal.style.display = 'none';
      setTimeout(() => {
        window.location.href = '../login/login.html';
      }, 1500);
      return;
    }

    try {
      // Disable the confirm button while deleting
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

      // Determine the correct endpoint based on video source
      const deleteUrl = source === 'ia' 
        ? `${API_ENDPOINT}/delete-video/${identifier}?hard_delete=false`
        : `${API_ENDPOINT}/videos/${id}`;

      // Send delete request
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          showToast('Your session has expired or you don\'t have permission.', 'error');
          localStorage.removeItem('access_token');
          setTimeout(() => {
            window.location.href = '../login/login.html';
          }, 1500);
          return;
        }
        throw new Error(result.detail || 'Failed to delete video');
      }

      // Close modal
      deleteModal.style.display = 'none';
      
      // Add deleting animation to video card
      const videoCard = button.closest('.video-card');
      if (videoCard) {
        videoCard.classList.add('deleting');
        
        // Wait for animation to complete, then reload
        setTimeout(() => {
          showToast('Video deleted successfully!', 'success');
          loadVideosFromBackend();
        }, 400);
      } else {
        showToast('Video deleted successfully!', 'success');
        loadVideosFromBackend();
      }

    } catch (error) {
      console.error('Error deleting video:', error);
      showToast(`Failed to delete video: ${error.message}`, 'error');
      
      // Re-enable button on error
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Video';
      deleteModal.style.display = 'none';
    } finally {
      videoToDelete = null;
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Video';
    }
  });

  // Load videos function
  async function loadVideos(topic = 'all', sort = 'newest') {
    const contentList = document.querySelector('.content-list');
    
    // Show loading state
    contentList.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading videos...</p>
      </div>
    `;
    
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (topic && topic !== 'all') {
        params.append('topic', topic);
      }
      if (sort) {
        params.append('sort', sort);
      }
      
      const url = `${API_ENDPOINT}/videos${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      
      // Store all videos for search suggestions
      allVideos = data.videos || [];
      
      if (!data.success || data.videos.length === 0) {
        contentList.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-inbox empty-icon"></i>
            <p>No talks available</p>
          </div>
        `;
        return;
      }

      // Helper function to format date
      function formatDate(dateString) {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
      }

      // Helper function to format views count
      function formatViews(views) {
        if (views >= 1000000) {
          return (views / 1000000).toFixed(1) + 'M';
        } else if (views >= 1000) {
          return (views / 1000).toFixed(1) + 'K';
        }
        return views.toString();
      }

      // Helper function to handle thumbnail fallbacks
      function getThumbnailFallback(videoId) {
        return `
          onerror="
            if (this.src.includes('maxresdefault')) {
              this.src='https://img.youtube.com/vi/${videoId}/sddefault.jpg';
            } else if (this.src.includes('sddefault')) {
              this.src='https://img.youtube.com/vi/${videoId}/hqdefault.jpg';
            } else if (this.src.includes('hqdefault')) {
              this.src='https://img.youtube.com/vi/${videoId}/mqdefault.jpg';
            } else {
              this.style.display='none';
              this.parentElement.classList.add('thumbnail-error');
            }
          "
        `;
      }

      // Display videos
      contentList.innerHTML = data.videos.map(video => `
        <div class="video-card" data-video-id="${escapeHtml(video.youtubeVideoId)}">
          <div class="video-thumbnail-wrapper">
            <img 
              src="https://img.youtube.com/vi/${escapeHtml(video.youtubeVideoId)}/maxresdefault.jpg" 
              alt="${escapeHtml(video.title)}" 
              class="video-thumbnail"
              ${getThumbnailFallback(video.youtubeVideoId)}
            />
            <div class="thumbnail-placeholder">
              <i class="fab fa-youtube"></i>
            </div>
            <div class="play-overlay">
              <button class="play-button" data-video-id="${escapeHtml(video.youtubeVideoId)}" aria-label="Play video">
                <i class="fas fa-play"></i>
              </button>
            </div>
          </div>
          <div class="video-info">
            <h3 class="video-title">${escapeHtml(video.title)}</h3>
            <div class="video-meta">
              <span class="video-topic">${escapeHtml(video.customTopic || video.topic)}</span>
              <span class="video-date"><i class="fas fa-calendar"></i> ${formatDate(video.uploadedAt)}</span>
            </div>
            ${video.description ? `<p class="video-description">${escapeHtml(video.description)}</p>` : ''}
            <div class="video-actions">
              <a href="${escapeHtml(video.youtubeLink)}" target="_blank" class="btn-watch-external">
                <i class="fas fa-external-link-alt"></i> Open in New Tab
              </a>
              <button class="btn-delete" data-video-id="${escapeHtml(video.id)}" data-video-title="${escapeHtml(video.title)}">
                <i class="fas fa-trash-alt"></i> Delete
              </button>
            </div>
          </div>
        </div>
      `).join('');

      // Add event listeners for delete buttons
      const deleteButtons = contentList.querySelectorAll('.btn-delete');
      deleteButtons.forEach(button => {
        button.addEventListener('click', handleDeleteVideo);
      });

      // Add event listeners for play buttons
      const playButtons = contentList.querySelectorAll('.play-button');
      playButtons.forEach(button => {
        button.addEventListener('click', handlePlayVideo);
      });

    } catch (error) {
      console.error('Error loading videos:', error);
      const contentList = document.querySelector('.content-list');
      contentList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-circle empty-icon"></i>
          <p>Failed to load videos. Please try again.</p>
        </div>
      `;
    }
  }

  // No topic dropdown to populate, topic is now a free text input

  // Topic filter change handler - DISABLED (using new backend integration below)
  // topicSelect.addEventListener('change', (e) => {
  //   currentTopic = e.target.value;
  //   currentSearch = '';
  //   searchInput.value = '';
  //   loadVideos(currentTopic, currentSort);
  // });

  // Sort filter change handler - DISABLED (using new backend integration below)
  // sortSelect.addEventListener('change', (e) => {
  //   currentSort = e.target.value.toLowerCase();
  //   console.log('Sort changed to:', currentSort);
  //   loadVideos(currentTopic, currentSort);
  // });

  // Search input handler with suggestions
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    selectedSuggestionIndex = -1; // Reset selection on new input
    
    if (query.length === 0) {
      searchSuggestions.classList.remove('show');
      return;
    }

    // Filter videos by title
    const matches = allVideos.filter(video => 
      video.title.toLowerCase().includes(query)
    );

    if (matches.length > 0) {
      searchSuggestions.innerHTML = matches.slice(0, 5).map(video => {
        // Highlight matching text (escape all parts before inserting into HTML)
        const titleLower = video.title.toLowerCase();
        const index = titleLower.indexOf(query);
        const before = escapeHtml(video.title.substring(0, index));
        const match = escapeHtml(video.title.substring(index, index + query.length));
        const after = escapeHtml(video.title.substring(index + query.length));
        
        return `
          <div class="search-suggestion-item" data-video-id="${escapeHtml(video.youtubeVideoId)}" data-title="${escapeHtml(video.title)}">
            ${before}<mark>${match}</mark>${after}
          </div>
        `;
      }).join('');
      
      searchSuggestions.classList.add('show');
      
      // Add click handlers to suggestions
      searchSuggestions.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const title = item.dataset.title;
          searchInput.value = title;
          currentSearch = title.toLowerCase();
          searchSuggestions.classList.remove('show');
          filterDisplayedVideos();
        });
      });
    } else {
      searchSuggestions.innerHTML = '<div class="search-no-results">No videos found</div>';
      searchSuggestions.classList.add('show');
    }
  });

  // Keyboard navigation for search
  searchInput.addEventListener('keydown', (e) => {
    const suggestions = searchSuggestions.querySelectorAll('.search-suggestion-item');
    
    if (suggestions.length === 0) {
      if (e.key === 'Enter') {
        currentSearch = searchInput.value.trim().toLowerCase();
        searchSuggestions.classList.remove('show');
        filterDisplayedVideos();
      }
      return;
    }

    switch(e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % suggestions.length;
        updateSuggestionHighlight(suggestions);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        selectedSuggestionIndex = selectedSuggestionIndex <= 0 ? suggestions.length - 1 : selectedSuggestionIndex - 1;
        updateSuggestionHighlight(suggestions);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          // Select highlighted suggestion
          const selected = suggestions[selectedSuggestionIndex];
          searchInput.value = selected.dataset.title;
          currentSearch = selected.dataset.title.toLowerCase();
        } else {
          // No suggestion selected, use current input
          currentSearch = searchInput.value.trim().toLowerCase();
        }
        searchSuggestions.classList.remove('show');
        filterDisplayedVideos();
        break;
        
      case 'Escape':
        searchSuggestions.classList.remove('show');
        selectedSuggestionIndex = -1;
        break;
    }
  });

  // Helper function to update suggestion highlight
  function updateSuggestionHighlight(suggestions) {
    suggestions.forEach((item, index) => {
      if (index === selectedSuggestionIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
      searchSuggestions.classList.remove('show');
    }
  });

  // Filter displayed videos based on search
  function filterDisplayedVideos() {
    const videoCards = document.querySelectorAll('.video-card');
    let visibleCount = 0;

    videoCards.forEach(card => {
      const title = card.querySelector('.video-title').textContent.toLowerCase();
      
      if (currentSearch === '' || title.includes(currentSearch)) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    // Show empty state if no videos match
    const contentList = document.querySelector('.content-list');
    if (visibleCount === 0 && videoCards.length > 0) {
      const existingEmpty = contentList.querySelector('.empty-state');
      if (!existingEmpty) {
        contentList.insertAdjacentHTML('afterbegin', `
          <div class="empty-state search-empty">
            <i class="fas fa-search empty-icon"></i>
            <p>No videos found matching "${searchInput.value}"</p>
          </div>
        `);
      }
    } else {
      const searchEmpty = contentList.querySelector('.search-empty');
      if (searchEmpty) searchEmpty.remove();
    }
  }

  // No topic dropdown to populate, topic is now a free text input

  // Add event listeners for filters
  topicSelect.addEventListener('change', () => {
    currentTopic = topicSelect.value;
    displayBackendVideos(allVideos);
  });

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    displayBackendVideos(allVideos);
  });

  // ===== BACKEND INTEGRATION FUNCTIONS =====
  
  // Load videos from both YouTube and Internet Archive backends
  async function loadVideosFromBackend() {
    // Show cached data instantly, refresh in background (stale-while-revalidate)
    const cached = localStorage.getItem('cache_jfcm_talks');
    if (cached) {
      try {
        allVideos = JSON.parse(cached);
        populateTopicFilterDropdown(allVideos);
        displayBackendVideos(allVideos);
      } catch(e) { showSkeletonGrid(6); }
    } else {
      showSkeletonGrid(6);
    }

    try {
      // Fetch only from YouTube endpoint
      const _ctrl = new AbortController();
      const _tid = setTimeout(() => _ctrl.abort(), 20000);
      const youtubeResponse = await fetch(`${API_ENDPOINT}/videos?limit=50`, {
        signal: _ctrl.signal,
      });
      clearTimeout(_tid);
      
      let allVideosList = [];
      
      // Process YouTube videos
      if (youtubeResponse.ok) {
        const youtubeData = await youtubeResponse.json();
        if (youtubeData.videos) {
          allVideosList = youtubeData.videos.map(v => ({ ...v, source: 'youtube' }));
        }
      }
      allVideos = allVideosList;
      // Cache for instant display on next load
      try { localStorage.setItem('cache_jfcm_talks', JSON.stringify(allVideosList)); } catch(e) {}
      populateTopicFilterDropdown(allVideosList);
      displayBackendVideos(allVideosList);
    } catch (error) {
      console.error('Load videos error:', error);
      const msg = error.name === 'AbortError'
        ? 'Server is starting up &mdash; this can take up to 30 seconds on first load.'
        : 'Failed to load videos. Please try again.';
      contentList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-satellite-dish empty-icon"></i>
          <p>${msg}</p>
          <button onclick="window.location.reload()" style="margin-top:12px;padding:8px 20px;background:#3a4d2c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">&#8635; Retry</button>
        </div>
      `;
    }
  }

    // Populate topic filter dropdown with unique topics from all videos
    function populateTopicFilterDropdown(videos) {
      const topicSelect = document.getElementById('topicFilter');
      if (!topicSelect) return;
      const topicsSet = new Set();
      videos.forEach(video => {
        if (video.topic && video.topic.trim() !== '') {
          topicsSet.add(video.topic.trim());
        }
      });
      const topics = Array.from(topicsSet).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
      topicSelect.innerHTML = '<option value="all">All Topics</option>' +
        topics.map(topic => `<option value="${topic}">${topic}</option>`).join('');
    }

  // Helper function to format date
  function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  // Display videos from backend
  function displayBackendVideos(videos) {
    const contentList = document.querySelector('.content-list');
    const sortSelect = document.getElementById('sortFilter');
    const topicSelect = document.getElementById('topicFilter');
    const sort = sortSelect.value || 'newest';
    const selectedTopic = topicSelect.value || 'all';
    
    if (!videos || videos.length === 0) {
      const token = localStorage.getItem('access_token');
      const user = token ? parseJwt(token) : null;
      const isAdmin = user && user.role === 'admin';
      contentList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox empty-icon"></i>
          <p>No talks available${isAdmin ? '. Use the Upload button to add a video.' : '.'}</p>
        </div>
      `;
      return;
    }

    // Filter by topic (if topic filter is present and not 'all')
    let filteredVideos = videos;
    if (selectedTopic && selectedTopic !== 'all' && selectedTopic !== 'All Topics' && selectedTopic !== 'Choose topic') {
      filteredVideos = videos.filter(video => {
        const videoTopic = (video.topic || video.tags || '').toLowerCase().trim();
        const filterTopic = selectedTopic.toLowerCase().trim();
        return videoTopic === filterTopic;
      });
    }

    if (filteredVideos.length === 0) {
      contentList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox empty-icon"></i>
          <p>No videos found for topic "${selectedTopic}"</p>
        </div>
      `;
      return;
    }

    // Sort videos
    const sortedVideos = [...filteredVideos].sort((a, b) => {
      const dateA = new Date(a.uploaded_at || a.uploadedAt);
      const dateB = new Date(b.uploaded_at || b.uploadedAt);
      return sort === 'newest' ? dateB - dateA : dateA - dateB;
    });

    // Helper function to get thumbnail for YouTube videos
    function getThumbnailFallback(videoId) {
      return `
        onerror="
          if (this.src.includes('maxresdefault')) {
            this.src='https://img.youtube.com/vi/${videoId}/sddefault.jpg';
          } else if (this.src.includes('sddefault')) {
            this.src='https://img.youtube.com/vi/${videoId}/hqdefault.jpg';
          } else if (this.src.includes('hqdefault')) {
            this.src='https://img.youtube.com/vi/${videoId}/mqdefault.jpg';
          } else {
            this.style.display='none';
            this.parentElement.classList.add('thumbnail-error');
          }
        "
      `;
    }

    // Display videos
    const htmlContent = sortedVideos.map(video => {
      // Determine video source and properties
      const isYouTube = !!(video.source === 'youtube' || video.youtubeVideoId);
      const isIA = !!(video.source === 'ia' || video.identifier);
      const videoId = video.youtubeVideoId || video.identifier;
      const videoUrl = video.youtubeLink || video.url;
      const topic = video.customTopic || video.topic || video.tags || 'General';
      const description = video.description || '';
      const uploadDate = video.uploadedAt || video.uploaded_at;
      
      try {
        return `
          <div class="video-card" data-video-id="${escapeHtml(videoId)}">
            <div class="video-thumbnail-wrapper">
              ${isYouTube ? `
                <img 
                  src="https://img.youtube.com/vi/${escapeHtml(videoId)}/maxresdefault.jpg" 
                  alt="${escapeHtml(video.title)}" 
                  class="video-thumbnail"
                  ${getThumbnailFallback(videoId)}
                />
                <div class="thumbnail-placeholder">
                  <i class="fab fa-youtube"></i>
                </div>
                <div class="play-overlay">
                  <button class="play-button" data-video-id="${escapeHtml(videoId)}" aria-label="Play video">
                    <i class="fas fa-play"></i>
                  </button>
                </div>
              ` : `
                ${video.embed_url && video.embed_url !== 'pending' ? `
                  <iframe 
                    src="${escapeHtml(video.embed_url)}" 
                    frameborder="0" 
                    allowfullscreen
                    webkitallowfullscreen
                    mozallowfullscreen
                    allow="fullscreen"
                    style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"
                  ></iframe>
                ` : `
                  <div class="thumbnail-placeholder">
                    <i class="fas fa-video"></i>
                    <p>Processing...</p>
                  </div>
                `}
              `}
            </div>
            <div class="video-info">
              <h3 class="video-title">
                ${escapeHtml(video.title)}
                ${(!video.embed_url || video.embed_url === 'pending') && isIA ? `
                  <span class="upload-badge">
                    <i class="fas fa-cloud-upload-alt"></i> Processing...
                  </span>
                ` : ''}
              </h3>
              <div class="video-meta">
                <span class="video-topic">${escapeHtml(topic)}</span>
                <span class="video-date"><i class="fas fa-calendar"></i> ${formatDate(uploadDate)}</span>
              </div>
              ${description ? `<p class="video-description">${escapeHtml(description)}</p>` : ''}
              <div class="video-actions">
                ${videoUrl && videoUrl !== 'pending' ? `
                  <a href="${escapeHtml(videoUrl)}" target="_blank" class="btn-watch-external">
                    <i class="fas fa-external-link-alt"></i> Open in New Tab
                  </a>
                ` : ''}
                <button class="btn-delete admin-only" data-video-id="${escapeHtml(video.id)}" data-video-title="${escapeHtml(video.title)}" data-source="${escapeHtml(video.source)}" data-identifier="${escapeHtml(videoId)}">
                  <i class="fas fa-trash-alt"></i> Delete
                </button>
              </div>
            </div>
          </div>
        `;
      } catch (error) {
        console.error('Error rendering video:', video.title, error);
        return '';
      }
    }).join('');
    
    contentList.innerHTML = htmlContent;

    // Add event listeners for delete buttons
    const deleteButtons = contentList.querySelectorAll('.btn-delete');
    deleteButtons.forEach(button => {
      button.addEventListener('click', handleDeleteVideo);
    });

    // Add event listeners for play buttons (YouTube videos) - Play inline
    const playButtons = contentList.querySelectorAll('.play-button');
    playButtons.forEach(button => {
      button.addEventListener('click', function() {
        const videoId = this.getAttribute('data-video-id');
        const thumbnailWrapper = this.closest('.video-thumbnail-wrapper');
        
        // Replace thumbnail with YouTube embed
        thumbnailWrapper.innerHTML = `
          <iframe 
            width="100%" 
            height="100%" 
            src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
          ></iframe>
        `;
      });
    });
  }

  // Check upload status for videos
  async function checkUploadStatuses() {
    if (uploadingVideos.size === 0) return;

    let hasChanges = false;
    for (const [videoId, videoData] of uploadingVideos) {
      try {
        const response = await fetch(`${API_ENDPOINT}/upload-status/${videoId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          uploadingVideos.delete(videoId);
          showToast(`Video "${data.title}" is now available!`, 'success');
          hasChanges = true;
        } else if (data.status === 'failed') {
          uploadingVideos.delete(videoId);
          showToast(`Video "${data.title}" upload failed`, 'error');
          hasChanges = true;
        } else if (data.status === 'uploading' || data.status === 'processing') {
          // Update progress (estimate based on status)
          const newProgress = data.status === 'uploading' ? 30 : 60;
          if (videoData.progress !== newProgress) {
            videoData.progress = newProgress;
            hasChanges = true;
          }
        }
      } catch (error) {
        console.error('Status check error:', error);
      }
    }
    
    // Refresh display if there were any changes
    if (hasChanges) {
      loadVideosFromBackend();
    }
  }

  // Format date to human-readable format
  function formatDateAgo(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return date.toLocaleDateString();
  }
});
