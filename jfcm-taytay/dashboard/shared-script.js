// Get burger menu and sidebar elements
const burger = document.getElementById('burger');
const sidebar = document.getElementById('sidebar');
const dashboardMain = document.querySelector('.dashboard-main');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Helper: open/close sidebar + overlay
function openSidebar() {
  sidebar.classList.add('active');
  burger.classList.add('active');
  if (dashboardMain) dashboardMain.classList.add('sidebar-open');
  if (sidebarOverlay) sidebarOverlay.classList.add('active');
}

function closeSidebar() {
  sidebar.classList.remove('active');
  burger.classList.remove('active');
  if (dashboardMain) dashboardMain.classList.remove('sidebar-open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

// Fetch and display current user info in sidebar
async function fetchCurrentUserForSidebar() {
  const token = localStorage.getItem('access_token');
  if (!token) return;

  // Show cached user info immediately while API loads
  const cached = localStorage.getItem('user_info');
  if (cached) {
    try { updateSidebarUserInfo(JSON.parse(cached)); } catch(e) {}
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const user = await response.json();
      localStorage.setItem('user_info', JSON.stringify(user));
      updateSidebarUserInfo(user);
    }
  } catch (error) {
    console.error('Error fetching user for sidebar:', error);
  }
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
  
  // Update avatar with profile picture or initials
  if (sidebarAvatar) {
    if (user.profile_picture && user.profile_picture.startsWith('data:')) {
      // profile_picture is a base64 data URL — use it directly
      sidebarAvatar.innerHTML = `<img src="${user.profile_picture}" alt="Profile" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      // Show initials
      const initials = getInitials(user.full_name);
      sidebarAvatar.innerHTML = initials;
      sidebarAvatar.style.fontSize = '18px';
    }
  }
}

// Get initials from name
function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Logout function
function handleLogout(event) {
  event.preventDefault();
  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal) {
    logoutModal.classList.add('active');
  }
}

// Close logout modal
function closeLogoutModal() {
  const logoutModal = document.getElementById('logoutModal');
  if (logoutModal) {
    logoutModal.classList.remove('active');
  }
}

// Confirm logout
function confirmLogout() {
  // Clear JWT token and cached user info
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_info');
  sessionStorage.removeItem('showAuthSuccess');

  // Redirect to login page
  window.location.href = '../login/login.html';
}

// Load user info on page load and apply RBAC UI logic
if (typeof API_BASE_URL !== 'undefined') {
  // Scripts are at bottom of body so DOM is already ready — call directly.
  // Fall back to DOMContentLoaded in case script is ever moved to <head>.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      fetchCurrentUserForSidebar();
      applyRoleBasedUI();
    });
  } else {
    fetchCurrentUserForSidebar();
    applyRoleBasedUI();
  }

  // Debounce visibility/focus refresh to avoid hammering the /auth/me endpoint.
  // Minimum 30 seconds between automatic refreshes.
  let _lastSidebarRefresh = 0;
  function _debouncedSidebarRefresh() {
    const now = Date.now();
    if (now - _lastSidebarRefresh < 30_000) return;
    _lastSidebarRefresh = now;
    fetchCurrentUserForSidebar();
    applyRoleBasedUI();
  }

  // Also refresh user info when page becomes visible (e.g., when navigating back)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      _debouncedSidebarRefresh();
    }
  });

  // Refresh user info when window gains focus
  window.addEventListener('focus', _debouncedSidebarRefresh);
}

// RBAC: Hide admin-only UI and block admin pages for non-admins
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

  // Block admin-only pages for non-admins
  const adminPages = [
    '/jfcm-taytay/user-management/',
    '/jfcm-taytay/admin-panel.html',
    '/jfcm-taytay/admin-panel',
    '/jfcm-taytay/admin/'
  ];
  const currentPath = window.location.pathname.replace(/\\/g, '/');
  if (userRole !== 'admin' && adminPages.some(page => currentPath.includes(page))) {
    document.body.innerHTML = '<h2 style="text-align:center;margin-top:80px;">Unauthorized Access</h2>';
  }
}

// Toggle sidebar when burger menu is clicked
if (burger) {
  burger.addEventListener('click', () => {
    if (sidebar.classList.contains('active')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
}

// Close sidebar when a link is clicked
const sidebarLinks = sidebar.querySelectorAll('a');
sidebarLinks.forEach(link => {
  link.addEventListener('click', () => {
    closeSidebar();
  });
});

// Close sidebar when clicking outside of it (or on overlay)
document.addEventListener('click', (event) => {
  if (!sidebar.contains(event.target) && !burger.contains(event.target)) {
    closeSidebar();
  }
});

// Close sidebar when overlay is tapped on mobile
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    closeSidebar();
  });
}

// Modules dropdown toggle
const modulesToggle = document.getElementById('modulesToggle');
const modulesSubmenu = document.getElementById('modulesSubmenu');

if (modulesToggle) {
  modulesToggle.addEventListener('click', (e) => {
    e.preventDefault();
    modulesToggle.classList.toggle('open');
    modulesSubmenu.classList.toggle('open');
  });
}

// Upload button functionality
const uploadBtn = document.querySelector('.upload-btn');
const fileInput = document.getElementById('fileInput');

if (uploadBtn && fileInput) {
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      console.log('File selected:', files[0].name);
    }
  });
}
