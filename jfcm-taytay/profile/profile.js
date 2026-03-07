// Profile picture upload functionality
const profileUploadBtn = document.getElementById("profileUploadBtn");
const profileFileInput = document.getElementById("profileFileInput");
const profilePicture = document.getElementById("profilePicture");

// Get logged-in user information
async function fetchCurrentUser() {
  try {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      showToast('Please login to view your profile', 'error');
      setTimeout(() => {
        window.location.href = '../login/login.html';
      }, 1500);
      return;
    }

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        showToast('Session expired. Please login again', 'error');
        localStorage.removeItem('access_token');
        setTimeout(() => {
          window.location.href = '../login/login.html';
        }, 1500);
        return;
      }
      throw new Error('Failed to fetch user information');
    }

    const user = await response.json();
    updateProfileUI(user);
    
  } catch (error) {
    console.error('Error fetching user:', error);
    showToast('Failed to load profile information', 'error');
  }
}

// Update UI with user data
function updateProfileUI(user) {
  // Update profile picture - show saved image or initials
  const profilePictureDiv = document.getElementById('profilePicture');
  if (user.profile_picture && user.profile_picture.startsWith('data:')) {
    // profile_picture is stored as a base64 data URL — use it directly
    profilePictureDiv.innerHTML = `<img src="${user.profile_picture}" alt="Profile Picture" style="width:100%;height:100%;object-fit:cover;" />`;
    // Show the remove button when a picture exists
    const removeBtn = document.getElementById('profileRemoveBtn');
    if (removeBtn) removeBtn.style.display = '';
  } else {
    // Show initials if no profile picture
    const initials = getInitials(user.full_name);
    profilePictureDiv.innerHTML = `<span style="font-size: inherit; font-weight: 600;">${initials}</span>`;
    // Hide remove button when no picture
    const removeBtn = document.getElementById('profileRemoveBtn');
    if (removeBtn) removeBtn.style.display = 'none';
  }
  
  // Update full name in multiple places
  const fullNameElements = document.querySelectorAll('.profile-full-name');
  fullNameElements.forEach(el => {
    el.textContent = user.full_name;
  });
  
  // Update username
  const usernameValue = document.getElementById('profile-username-value');
  if (usernameValue) {
    usernameValue.textContent = user.username;
  }
  
  // Update role (capitalize first letter)
  const roleValue = document.getElementById('profile-role-value');
  if (roleValue) {
    const roleCapitalized = user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
    roleValue.textContent = roleCapitalized;
  }
  
  // Update email
  const emailValue = document.getElementById('profile-email-value');
  if (emailValue) {
    emailValue.textContent = user.email;
  }
  
  // Update member since
  const memberSinceValue = document.getElementById('profile-member-since-value');
  if (memberSinceValue) {
    if (user.created_at) {
      const date = new Date(user.created_at);
      const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      memberSinceValue.textContent = monthYear;
    } else {
      memberSinceValue.textContent = '—';
    }
  }
  
  // Update sidebar user info
  updateSidebarUserInfo(user);
}

// Update sidebar with current user info
function updateSidebarUserInfo(user) {
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  const sidebarAvatar = document.getElementById('sidebar-user-avatar');
  
  if (sidebarName) {
    sidebarName.textContent = user.full_name;
  }
  
  if (sidebarRole) {
    const roleCapitalized = user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
    sidebarRole.textContent = roleCapitalized;
  }
  
  // Update sidebar avatar with profile picture or initials
  if (sidebarAvatar) {
    if (user.profile_picture) {
      sidebarAvatar.innerHTML = `<img src="${user.profile_picture}" alt="Profile" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      const initials = getInitials(user.full_name);
      sidebarAvatar.innerHTML = initials;
      sidebarAvatar.style.fontSize = '18px';
    }
  }
}

// Compress image client-side to keep DB payload small (~30-50 KB)
function compressImage(file, maxSize = 300, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else       { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Get initials from full name
function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Profile picture upload - saves to backend
if (profileUploadBtn) {
  profileUploadBtn.addEventListener("click", () => {
    profileFileInput.click();
  });

  profileFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      showToast('Please login to upload profile picture', 'error');
      return;
    }

    showToast('Uploading...', 'info');

    try {
      // Compress to max 300×300 px, ~30-50 KB before sending
      const compressed = await compressImage(file);

      const formData = new FormData();
      formData.append('file', compressed, 'profile.jpg');

      const response = await fetch(`${API_BASE_URL}/auth/profile-picture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        // Read compressed blob as data URL for instant preview (no extra round-trip)
        const reader = new FileReader();
        reader.onload = (re) => {
          const dataUrl = re.target.result;
          profilePicture.style.opacity = '0';
          setTimeout(() => {
            profilePicture.innerHTML = `<img src="${dataUrl}" alt="Profile Picture" style="width:100%;height:100%;object-fit:cover;" />`;
            profilePicture.style.opacity = '1';
            const removeBtn = document.getElementById('profileRemoveBtn');
            if (removeBtn) removeBtn.style.display = '';
            const sidebarAvatar = document.getElementById('sidebar-user-avatar');
            if (sidebarAvatar) {
              sidebarAvatar.innerHTML = `<img src="${dataUrl}" alt="Profile" style="width:100%;height:100%;object-fit:cover;">`;
            }
            showToast('Profile picture updated successfully!', 'success');
          }, 300);
        };
        reader.readAsDataURL(compressed);
      } else {
        const error = await response.json();
        showToast(error.detail || 'Failed to upload profile picture', 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Failed to upload profile picture', 'error');
    }
  });
}

// Remove profile picture — with confirmation modal
const profileRemoveBtn = document.getElementById('profileRemoveBtn');
const removePhotoModal = document.getElementById('removePhotoModal');
const removePhotoCancelBtn = document.getElementById('removePhotoCancelBtn');
const removePhotoConfirmBtn = document.getElementById('removePhotoConfirmBtn');

if (profileRemoveBtn) {
  profileRemoveBtn.addEventListener('click', () => {
    if (removePhotoModal) removePhotoModal.classList.add('active');
  });
}

if (removePhotoCancelBtn) {
  removePhotoCancelBtn.addEventListener('click', () => {
    removePhotoModal.classList.remove('active');
  });
}

// Close modal on backdrop click
if (removePhotoModal) {
  removePhotoModal.addEventListener('click', (e) => {
    if (e.target === removePhotoModal) removePhotoModal.classList.remove('active');
  });
}

if (removePhotoConfirmBtn) {
  removePhotoConfirmBtn.addEventListener('click', async () => {
    removePhotoModal.classList.remove('active');
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile-picture`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        profilePicture.innerHTML = `<i class="fas fa-user"></i>`;
        if (profileRemoveBtn) profileRemoveBtn.style.display = 'none';
        const sidebarAvatar = document.getElementById('sidebar-user-avatar');
        if (sidebarAvatar) {
          sidebarAvatar.innerHTML = localStorage.getItem('user_initials') || 'U';
          sidebarAvatar.style.fontSize = '18px';
        }
        showToast('Profile picture removed', 'success');
      } else {
        const err = await response.json();
        showToast(err.detail || 'Failed to remove profile picture', 'error');
      }
    } catch (err) {
      console.error('Remove error:', err);
      showToast('Failed to remove profile picture', 'error');
    }
  });
}

// Toast notification system
function showToast(message, type = 'info') {
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  
  // Add icon based on type
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  else if (type === 'error') icon = 'fa-exclamation-circle';
  else if (type === 'warning') icon = 'fa-exclamation-triangle';
  
  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add smooth scroll animation on page load
document.addEventListener('DOMContentLoaded', () => {
  // Fetch current user data
  fetchCurrentUser();
  
  const profileContainer = document.querySelector('.profile-container');
  if (profileContainer) {
    profileContainer.style.opacity = '0';
    profileContainer.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      profileContainer.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      profileContainer.style.opacity = '1';
      profileContainer.style.transform = 'translateY(0)';
    }, 100);
  }
});
