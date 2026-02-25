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
  if (user.profile_picture) {
    // Load saved profile picture from backend
    const imgUrl = `${API_BASE_URL}/auth/profile-picture/${user.profile_picture}?t=${Date.now()}`;
    profilePictureDiv.innerHTML = `<img src="${imgUrl}" alt="Profile Picture" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    // Show initials if no profile picture
    const initials = getInitials(user.full_name);
    profilePictureDiv.innerHTML = `<span style="font-size: inherit; font-weight: 600;">${initials}</span>`;
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
  
  // Update member since (if created_at exists)
  const memberSinceValue = document.getElementById('profile-member-since-value');
  if (memberSinceValue && user.created_at) {
    const date = new Date(user.created_at);
    const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    memberSinceValue.textContent = monthYear;
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
      const imgUrl = `${API_BASE_URL}/auth/profile-picture/${user.profile_picture}?t=${Date.now()}`;
      sidebarAvatar.innerHTML = `<img src="${imgUrl}" alt="Profile" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      const initials = getInitials(user.full_name);
      sidebarAvatar.innerHTML = initials;
      sidebarAvatar.style.fontSize = '18px';
    }
  }
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
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size should not exceed 5MB', 'error');
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      showToast('Please login to upload profile picture', 'error');
      return;
    }

    // Create FormData and upload to backend
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile-picture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update profile picture preview with saved image
        profilePicture.style.opacity = '0';
        setTimeout(() => {
          const imgUrl = `${API_BASE_URL}/auth/profile-picture/${data.filename}?t=${Date.now()}`;
          profilePicture.innerHTML = `<img src="${imgUrl}" alt="Profile Picture" style="width:100%;height:100%;object-fit:cover;" />`;
          profilePicture.style.opacity = '1';
          
          // Also update sidebar avatar immediately
          const sidebarAvatar = document.getElementById('sidebar-user-avatar');
          if (sidebarAvatar) {
            sidebarAvatar.innerHTML = `<img src="${imgUrl}" alt="Profile" style="width:100%;height:100%;object-fit:cover;">`;
          }
          
          showToast('Profile picture updated successfully!', 'success');
        }, 300);
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
