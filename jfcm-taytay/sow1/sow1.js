// Format ISO date string to readable date (e.g., Feb 18, 2026)
function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
// Format file size in bytes to human-readable string (e.g., 1.2 MB)
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Bytes";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + " " + sizes[i];
}
// Return icon class for a given mimeType (similar to Teachings)
function getFileIcon(mimeType) {
  if (!mimeType) return "fas fa-file";
  if (mimeType.startsWith("application/pdf")) return "fas fa-file-pdf";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.wordprocessingml.document") || mimeType.startsWith("application/msword")) return "fas fa-file-word";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") || mimeType.startsWith("application/vnd.ms-excel")) return "fas fa-file-excel";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.presentationml.presentation") || mimeType.startsWith("application/vnd.ms-powerpoint")) return "fas fa-file-powerpoint";
  return "fas fa-file";
}
// ===================================
// TOAST NOTIFICATIONS & CUSTOM MODALS
// ===================================
function showToast(message, type = "info") {
  // Remove any existing toast
  const existing = document.querySelector(".toast-notification");
  if (existing) existing.remove();

  // Icon selection
  let icon = "";
  if (type === "success") icon = '<i class="fas fa-check-circle"></i>';
  else if (type === "error") icon = '<i class="fas fa-times-circle"></i>';
  else if (type === "warning") icon = '<i class="fas fa-exclamation-triangle"></i>';
  else icon = '<i class="fas fa-info-circle"></i>';

  // Toast HTML
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `${icon}<span>${message}</span>`;

  document.body.appendChild(toast);
  // Animate in
  setTimeout(() => toast.classList.add("show"), 10);
  // Animate out after 3s
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}


// Listen for Google OAuth popup success and save Google Drive email to localStorage
window.addEventListener("message", (event) => {
  if (
    event.data &&
    event.data.type === "google-auth-success" &&
    event.data.email
  ) {
    localStorage.setItem("gdrive_user_email_sow1", event.data.email);
    localStorage.setItem("gdrive_user_email", event.data.email); // shared key so other sections recognize the same account
    sessionStorage.setItem("googleAuthCompletedSow1", "true");
    window.location.reload();
  }
});

// Ensure modal and picker button event listeners are attached after DOM loads
document.addEventListener("DOMContentLoaded", () => {
  showSkeletonGrid(6);
  // Always render the info box at least once
  updateConnectedGoogleAccountUI();
  // Use id for reliable event binding
  const uploadBtn = document.getElementById("uploadBtn");
  const uploadModal = document.getElementById("uploadModal");
  const closeModalBtn = document.querySelector(".close-modal");

  if (uploadBtn) {
    uploadBtn.addEventListener("click", openUploadModal);
  }
  if (closeModalBtn && uploadModal) {
    closeModalBtn.addEventListener("click", () => {
      uploadModal.style.display = "none";
    });
  }

  // Picker button opens Google Picker
  const pickerBtn = document.getElementById("openPickerBtn");
  if (pickerBtn) {
    pickerBtn.addEventListener("click", openDriveFolderPicker);
  }

  // Add event for 'Create Folder' button (if present)
  const createFolderBtn = document.getElementById("createGdriveFolderBtn");
  if (createFolderBtn) {
    createFolderBtn.addEventListener("click", () => {
      window.open("https://drive.google.com/drive/my-drive", "_blank");
      showToast(
        "Create your folder in Google Drive, then click 'Refresh Folders' to see it here.",
        "info",
      );
    });
  }

  // Add event for 'Refresh Folders' button (if present)
  const refreshFoldersBtn = document.getElementById("refreshGdriveFoldersBtn");
  if (refreshFoldersBtn) {
    refreshFoldersBtn.addEventListener("click", () => {
      openDriveFolderPicker();
      showToast(
        "Folders refreshed. If you just created a folder, it should now appear.",
        "info",
      );
    });
  }

  // Auth button for Google Drive
  const authBtn = document.getElementById("authGdriveBtn");
  if (authBtn) {
    authBtn.addEventListener("click", initiateGoogleAuthInModal);
  }

  // Cancel button closes modal
  const cancelBtn = document.getElementById("cancelUploadBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeUploadModal);
  }

  // File input logic
  const fileDropZone = document.getElementById("fileDropZone");
  const modalFileInput = document.getElementById("modalFileInput");
  if (fileDropZone && modalFileInput) {
    fileDropZone.addEventListener("click", () => modalFileInput.click());
    modalFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        selectFileForUpload(e.target.files[0]);
      }
    });
  }

  // Remove file button
  const removeFileBtn = document.getElementById("removeFileBtn");
  if (removeFileBtn) {
    removeFileBtn.addEventListener("click", clearSelectedFile);
  }

  // Confirm upload button
  const confirmBtn = document.getElementById("confirmUploadBtn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", uploadFromModal);
  }

  // Title input validation
  const titleInput = document.getElementById("sow1Title");
  if (titleInput) {
    titleInput.addEventListener("input", updateUploadButtonState);
  }

  checkAndShowGdriveSection();

  // Initialize filters and search
  initializeFilters();
  initializeSearch();

  // On page load, load SOW1 files — list-files uses admin credential so all logged-in users can view
  loadSow1Files();
});

function getCurrentUserEmail() {
  // Use section-specific key first, fall back to shared gdrive_user_email (set by Teachings auth)
  return localStorage.getItem("gdrive_user_email_sow1") || localStorage.getItem("gdrive_user_email") || "";
}


let connectedGoogleEmail = getCurrentUserEmail() || null;
let allConnectedGoogleAccounts = [];
let allSow1Files = [];
let currentFilter = {
  topic: "all",
  sort: "newest",
  search: ""
};
let pickerApiLoaded = false;
let oauthToken = null;
let selectedFile = null;
let selectedFolder = null;


function updateConnectedGoogleAccountUI() {
  const accountInfo = document.getElementById("connectedGoogleAccountInfo");
  if (accountInfo) {
    if (connectedGoogleEmail) {
      accountInfo.innerHTML = `
    <div class="gdrive-account-card">
      <div class="gdrive-account-info">
        <div class="account-label">Connected Google Drive</div>
        <div class="account-email">${escapeHtml(connectedGoogleEmail)}</div>
      </div>

      <div class="gdrive-actions">
        <button class="btn btn-secondary" id="showAllGoogleAccountsBtn">
          View Accounts
        </button>
        <button class="btn btn-primary admin-only" id="switchGoogleAccountBtn">
          Sign in with Different Account
        </button>
      </div>
    </div>
  `;
    } else {
      accountInfo.innerHTML = `
  <div class="gdrive-account-card empty">
    <div class="account-label">No Google Drive account connected</div>
    <button class="btn btn-primary" id="connectGoogleAccountBtn">
      Connect Google Drive
    </button>
  </div>
`;
      setTimeout(() => {
        const connectBtn = document.getElementById("connectGoogleAccountBtn");
        if (connectBtn) {
          connectBtn.onclick = initiateGoogleAuthInModal;
        }
      }, 0);
    }
  }
}

document.body.addEventListener("click", function (e) {
  if (e.target && e.target.id === "switchGoogleAccountBtn") {
    // Clear all stored email keys so the new account becomes the active one
    localStorage.removeItem("gdrive_user_email_sow1");
    localStorage.removeItem("gdrive_user_email");
    sessionStorage.removeItem("googleAuthCompletedSow1");
    initiateGoogleAuthInModal();
  }
  if (e.target && e.target.id === "showAllGoogleAccountsBtn") {
    showAllConnectedAccounts();
  }
});

async function fetchGoogleDriveAuthStatus() {
  try {
    const userEmail = getCurrentUserEmail();
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/sow1/auth/status`,
      {
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    return await response.json();
  } catch (e) {
    return { authenticated: false };
  }
}

// Fetch Google OAuth token for Picker
async function fetchGoogleOAuthToken() {
  try {
    const userEmail = getCurrentUserEmail();
    console.log("fetchGoogleOAuthToken: using email:", userEmail);
    if (!userEmail) {
      throw new Error("No user email provided");
    }
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/sow1/auth/token`,
      {
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    console.log("fetchGoogleOAuthToken: response status:", response.status);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    console.log("fetchGoogleOAuthToken: response data:", data);
    return data.access_token || null;
  } catch (e) {
    console.error("fetchGoogleOAuthToken: error", e);
    return null;
  }
}

async function checkAndShowGdriveSection() {
  const authSection = document.getElementById("gdriveAuthSection");
  const pickerBtn = document.getElementById("openPickerBtn");
  const confirmBtn = document.getElementById("confirmUploadBtn");
  // Hide auth section and disable picker by default
  if (authSection) authSection.style.display = "none";
  if (pickerBtn) pickerBtn.disabled = true;
  if (confirmBtn) confirmBtn.disabled = true;

  const status = await fetchGoogleDriveAuthStatus();
  console.log("[DEBUG] /gdrive/sow1/auth/status response:", status);
  const isAuthenticated = status.authenticated;
  connectedGoogleEmail = status.email || null;
  console.log("[DEBUG] connectedGoogleEmail:", connectedGoogleEmail);
  updateConnectedGoogleAccountUI();
  if (isAuthenticated) {
    oauthToken = await fetchGoogleOAuthToken();
    if (pickerBtn) {
      pickerBtn.disabled = false;
    }
    if (authSection) {
      authSection.style.display = "none"; // <-- FIXED
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
    }
    // Show create/refresh folder UI if present
    const gdriveFolderHelper = document.getElementById("gdriveFolderHelper");
    if (gdriveFolderHelper) {
      gdriveFolderHelper.style.display = "block";
    }
  } else {
    oauthToken = null;
    if (authSection) {
      authSection.style.display = "block";
    }
    if (pickerBtn) {
      pickerBtn.disabled = false;
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
    }
    // Hide create/refresh folder UI if present
    const gdriveFolderHelper = document.getElementById("gdriveFolderHelper");
    if (gdriveFolderHelper) {
      gdriveFolderHelper.style.display = "none";
    }
  }
  
if (pickerBtn) {
  pickerBtn.removeEventListener("click", openDriveFolderPicker); // Remove if already attached
  pickerBtn.addEventListener("click", openDriveFolderPicker);
}
}

async function logoutGoogleDriveAccount() {
  try {
    const gdriveEmail = getCurrentUserEmail();
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/sow1/auth/logout`,
      {
        method: "POST",
        headers: {
          "X-User-Email": gdriveEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    if (response.ok) {
      localStorage.removeItem("gdrive_user_email_sow1");
      localStorage.removeItem("gdrive_user_email");
      sessionStorage.removeItem("googleAuthCompletedSow1");
      window.location.reload();
    } else {
      throw new Error("Logout error");
    }
  } catch (e) {
    showToast("Logout error.", "error");
  }
}

// Show all connected Google accounts (stub for SOW1, implement as needed)
async function showAllConnectedAccounts() {
  // Inject improved modal CSS if not already present
  if (!document.getElementById("customModalStyles")) {
    const style = document.createElement("style");
    style.id = "customModalStyles";
    style.innerHTML = `
      .custom-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        width: 100vw; height: 100vh;
        background: rgba(30, 34, 54, 0.38);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .custom-modal {
        background: #f9fafe;
        border-radius: 18px;
        box-shadow: 0 8px 32px rgba(30,34,54,0.18);
        min-width: 370px;
        max-width: 98vw;
        min-height: 120px;
        padding: 32px 32px 24px 32px;
        z-index: 100000;
        display: flex;
        flex-direction: column;
        animation: modalPopIn 0.18s cubic-bezier(.4,2,.6,1) 1;
      }
      .custom-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }
      .custom-modal .modal-header h2 {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 700;
        color: #232946;
      }
      .custom-modal .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: #888;
        cursor: pointer;
        transition: color 0.15s;
      }
      .custom-modal .close-btn:hover {
        color: #232946;
      }
      .custom-modal .account-list {
        list-style: none;
        margin: 0 0 18px 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .custom-modal .account-item {
        display: flex;
        align-items: center;
        background: #f1f3fa;
        border-radius: 10px;
        padding: 12px 16px;
        gap: 16px;
        box-shadow: 0 1px 2px rgba(30,34,54,0.04);
        transition: box-shadow 0.15s, background 0.15s;
      }
      .custom-modal .account-item.current {
        background: #e3e8ff;
        box-shadow: 0 2px 8px rgba(80, 100, 255, 0.08);
      }
      .custom-modal .account-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3a4d2c 0%, #263820 100%);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        font-weight: 600;
        box-shadow: 0 1px 4px rgba(30,34,54,0.08);
      }
      .custom-modal .account-details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .custom-modal .account-email {
        font-size: 1.08rem;
        font-weight: 500;
        color: #232946;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .custom-modal .account-email {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .custom-modal .current-badge {
        background: #263820;
        color: #fff;
        font-size: 0.97rem;
        font-weight: 600;
        border-radius: 5px;
        padding: 0 18px;
        letter-spacing: 0.01em;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 28px;
        min-width: 72px;
        border: none;
        box-sizing: border-box;
        line-height: 1.1;
        margin: 0;
        cursor: default;
      }
      .custom-modal .account-date {
        font-size: 0.92rem;
        color: #7b7b8b;
        margin-top: 2px;
      }
      .custom-modal .account-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .custom-modal .switch-btn,
      .custom-modal .current-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 28px;
        min-width: 72px;
        padding: 0 18px;
        font-size: 0.97rem;
        font-weight: 600;
        border-radius: 5px;
        border: none;
        box-sizing: border-box;
        line-height: 1.1;
        margin: 0;
        letter-spacing: 0.01em;
      }
      .custom-modal .switch-btn {
        background: #3a4d2c;
        color: #fff;
        cursor: pointer;
        transition: background 0.15s;
        box-shadow: 0 1px 2px rgba(30,34,54,0.06);
      }
      .custom-modal .switch-btn:hover {
        background: #263820;
      }
      .custom-modal .current-badge {
        background: #263820;
        color: #fff;
        cursor: default;
        border: none;
      }
      .custom-modal .remove-btn {
        background: #f44336;
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 0 18px;
        height: 28px;
        font-size: 0.97rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
        box-shadow: 0 1px 2px rgba(30,34,54,0.06);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .custom-modal .remove-btn:hover {
        background: #d32f2f;
      }
      .custom-modal .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 10px;
      }
      .custom-modal .secondary-btn {
        background: #e3e8ff;
        color: #232946;
        border: none;
        border-radius: 6px;
        padding: 7px 22px;
        font-weight: 500;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.15s;
      }
      .custom-modal .secondary-btn:hover {
        background: #c7d0ff;
      }
      @keyframes modalPopIn {
        from { transform: scale(0.95) translateY(30px); opacity: 0; }
        to { transform: scale(1) translateY(0); opacity: 1; }
      }
      @media (max-width: 500px) {
        .custom-modal { min-width: 98vw; padding: 16px 4vw 16px 4vw; }
        .custom-modal .account-item { flex-direction: column; align-items: flex-start; gap: 8px; }
        .custom-modal .account-actions { width: 100%; justify-content: flex-end; }
      }
    `;
    document.head.appendChild(style);
  }
  try {
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/sow1/auth/users`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      }
    );
    if (!response.ok) throw new Error("Failed to fetch accounts");
    const data = await response.json();
    allConnectedGoogleAccounts = data.users || [];
    const currentEmail = getCurrentUserEmail();
    let html = `
<div class="custom-modal-overlay">
  <div class="custom-modal">
    <div class="modal-header">
      <h2>Connected Google Drive Accounts</h2>
      <button class="close-btn" id="closeAccountsModal">&times;</button>
    </div>
    <ul class="account-list">
`;
    for (const acc of allConnectedGoogleAccounts) {
      html += `
      <li class="account-item${acc.email === currentEmail ? " current" : ""}">
        <div class="account-avatar">${acc.email.charAt(0).toUpperCase()}</div>
        <div class="account-details">
          <div class="account-email">${escapeHtml(acc.email)}${acc.email === currentEmail ? '<span class="current-badge">Current</span>' : ''}</div>
          <div class="account-date">Connected: ${acc.connected_at ? escapeHtml(acc.connected_at) : 'Unknown'}</div>
        </div>
        <div class="account-actions">
          ${acc.email !== currentEmail ? `<button class="switch-btn" data-email="${escapeHtml(acc.email)}">Switch</button>` : ''}
          <button class="remove-btn" data-email="${escapeHtml(acc.email)}">Remove</button>
        </div>
      </li>
      `;
    }
    html += `
    </ul>
    <div class="modal-footer">
      <button id="closeAccountsModalFooter" class="secondary-btn">Close</button>
    </div>
  </div>
</div>
`;
    document.body.insertAdjacentHTML("beforeend", html);
    const overlay = document.querySelector(".custom-modal-overlay");
    const modal = document.querySelector(".custom-modal");
    function closeModal() {
      overlay.remove();
    }
    document.getElementById("closeAccountsModal").onclick = closeModal;
    document.getElementById("closeAccountsModalFooter").onclick = closeModal;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); }, { once: true });
    // Switch logic
    document.querySelectorAll(".switch-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        localStorage.setItem("gdrive_user_email_sow1", btn.dataset.email);
        showToast("Switched account!", "success");
        setTimeout(() => window.location.reload(), 600);
      });
    });
    // Remove logic
    document.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`Remove account ${btn.dataset.email}?`)) return;
        try {
          const resp = await fetch(`${window.API_BASE_URL}/gdrive/sow1/auth/remove`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}`, "X-User-Email": btn.dataset.email } });
          if (resp.ok) {
            showToast("Account removed.", "success");
            closeModal();
            setTimeout(() => window.location.reload(), 600);
          } else {
            showToast("Failed to remove account.", "error");
          }
        } catch {
          showToast("Failed to remove account.", "error");
        }
      });
    });
  } catch (e) {
    showToast("Error showing accounts.", "error");
  }
}
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Load Google Picker API
function loadPickerApi() {
  if (typeof gapi !== "undefined") {
    gapi.load("picker", { callback: onPickerApiLoad });
  }
}

function onPickerApiLoad() {
  pickerApiLoaded = true;
}

// Google Picker callback for folder selection
function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const folder = data.docs[0];
    selectedFolder = { id: folder.id, name: folder.name };
    setSow1FolderId(folder.id); // Save selected folder for future loads
    document.getElementById("selectedFolderName").textContent = folder.name;
    updateUploadButtonState();
    loadSow1Files(); // Reload file list for new folder
  }
}

// Update upload button state to require selectedFolder
function updateUploadButtonState() {
  const confirmBtn = document.getElementById("confirmUploadBtn");
  const titleInput = document.getElementById("sow1Title");
  const hasFile = selectedFile !== null;
  const hasFolder = selectedFolder !== null;
  const hasTitle = titleInput && titleInput.value.trim() !== "";
  if (confirmBtn) confirmBtn.disabled = !(hasFile && hasFolder && hasTitle);
}

// Basic check: user_email in localStorage
function isUserAuthenticated() {
  return !!localStorage.getItem("gdrive_user_email_sow1");
}

function closeUploadModal() {
  const modal = document.getElementById("uploadModal");
  if (modal) modal.style.display = "none";
}

// Open Google Drive in new tab so user can create folder
async function createNewFolderInModal() {
  window.open("https://drive.google.com/drive/my-drive", "_blank");
  const folderSelect = document.getElementById("folderSelect");
  if (folderSelect) {
    folderSelect.innerHTML =
      '<option value="">Create a folder in Google Drive, then click refresh</option>';
  }
}

function selectFileForUpload(file) {
  selectedFile = file;
  const fileDropZone = document.getElementById("fileDropZone");
  const selectedFileInfo = document.getElementById("selectedFileInfo");
  const selectedFileName = document.getElementById("selectedFileName");
  if (fileDropZone && selectedFileInfo && selectedFileName) {
    fileDropZone.querySelector("i").style.display = "none";
    fileDropZone.querySelector("p").style.display = "none";
    selectedFileInfo.style.display = "flex";
    selectedFileName.textContent = file.name;
  }
  updateUploadButtonState();
}

function clearSelectedFile() {
  selectedFile = null;
  const modalFileInput = document.getElementById("modalFileInput");
  if (modalFileInput) modalFileInput.value = "";
  const fileDropZone = document.getElementById("fileDropZone");
  const selectedFileInfo = document.getElementById("selectedFileInfo");
  if (fileDropZone && selectedFileInfo) {
    fileDropZone.querySelector("i").style.display = "block";
    fileDropZone.querySelector("p").style.display = "block";
    selectedFileInfo.style.display = "none";
  }
  updateUploadButtonState();
}

// Upload file from modal (copied and adapted from teachings.js)
async function uploadFromModal() {
  try {
    const titleInput = document.getElementById("sow1Title");
    const confirmBtn = document.getElementById("confirmUploadBtn");
    if (confirmBtn) confirmBtn.disabled = true;
    if (!selectedFile) {
      showToast("Please select a file to upload.", "warning");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }
    if (!selectedFolder) {
      showToast("Please select a Google Drive folder.", "warning");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }
    if (!titleInput.value.trim()) {
      showToast("Please enter a title.", "warning");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("folder_id", selectedFolder.id);
    formData.append("title", titleInput.value.trim());
    // Add topic as category (required by backend)
    const topicInput = document.getElementById("sow1Topic");
    if (topicInput && topicInput.value.trim()) {
      formData.append("category", topicInput.value.trim());
    }
    const userEmail = getCurrentUserEmail();
    const response = await fetch(`${window.API_BASE_URL}/gdrive/sow1/upload`, {
      method: "POST",
      headers: {
        "X-User-Email": userEmail,
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      body: formData,
    });
    if (!response.ok) {
      let errorText = await response.text();
      showToast("Upload failed: " + errorText, "error");
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }
    showToast("File uploaded successfully!", "success");
    closeUploadModal();
    setSow1FolderId(selectedFolder.id); // Remember last upload folder
    console.log('[DEBUG] Saved last upload folder to localStorage:', selectedFolder.id);
    await loadSow1Files();
  } catch (error) {
    showToast("Upload failed. Please try again.", "error");
    if (confirmBtn) confirmBtn.disabled = false;
    console.error("uploadFromModal error:", error);
  }
}

// Fetch Google Drive folders for SOW1 (stub, implement as needed)
async function fetchGoogleDriveFolders() {
  try {
    const userEmail = getCurrentUserEmail();
    if (!userEmail) return [];

    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/list-files`,
      {
        headers: {
          "X-User-Email": userEmail,
        },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch folders");
    }

    const data = await response.json();

    // Filter only folders
    const folders = data.files.filter(
      (file) => file.mimeType === "application/vnd.google-apps.folder",
    );

    return folders;
  } catch (error) {
    console.error("Fetch folders error:", error);
    return [];
  }
}


async function loadFoldersForModal() {
  try {
    const folderSelect = document.getElementById("folderSelect");
    folderSelect.innerHTML = '<option value="">Loading folders...</option>';

    availableFolders = await fetchGoogleDriveFolders();

    if (availableFolders.length === 0) {
      folderSelect.innerHTML =
        '<option value="">No folders found. Create one below.</option>';
      return;
    }

    folderSelect.innerHTML =
      '<option value="">Select a folder...</option>' +
      availableFolders
        .map(
          (folder) =>
            `<option value="${folder.id}">${escapeHtml(folder.name)} (${folder.id})</option>`,
        )
        .join("");

    // Pre-select last used folder if available
    const lastFolderId = localStorage.getItem("sow1_folder_id");
    if (lastFolderId && availableFolders.find((f) => f.id === lastFolderId)) {
      folderSelect.value = lastFolderId;
      // Set selectedFolder to match dropdown
      const folder = availableFolders.find((f) => f.id === lastFolderId);
      if (folder) {
        selectedFolder = { id: folder.id, name: folder.name };
      } else {
        selectedFolder = null;
      }
      updateUploadButtonState();
    } else {
      selectedFolder = null;
      updateUploadButtonState();
    }
    // Add change event to folderSelect to update selectedFolder and button state
    folderSelect.onchange = function () {
      const val = folderSelect.value;
      if (val) {
        const folder = availableFolders.find((f) => f.id === val);
        if (folder) {
          selectedFolder = { id: folder.id, name: folder.name };
        } else {
          selectedFolder = null;
        }
      } else {
        selectedFolder = null;
      }
      updateUploadButtonState();
    };
  } catch (error) {
    console.error("Load folders error:", error);
    const folderSelect = document.getElementById("folderSelect");
    folderSelect.innerHTML = '<option value="">Error loading folders</option>';
  }
}

function applyFiltersAndDisplay() {
  let filtered = allSow1Files;
  // Filter by topic
  if (currentFilter.topic && currentFilter.topic !== "all") {
    filtered = filtered.filter(f => (f.topic || f.category || "") === currentFilter.topic);
  }
  // Filter by search
  if (currentFilter.search && currentFilter.search.trim() !== "") {
    const q = currentFilter.search.trim().toLowerCase();
    filtered = filtered.filter(f =>
      (f.title && f.title.toLowerCase().includes(q)) ||
      (f.name && f.name.toLowerCase().includes(q)) ||
      (f.category && f.category.toLowerCase().includes(q))
    );
  }
  // Sort
  if (currentFilter.sort === "newest") {
    filtered = filtered.slice().sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  } else if (currentFilter.sort === "oldest") {
    filtered = filtered.slice().sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
  } else if (currentFilter.sort === "az") {
    filtered = filtered.slice().sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || ""));
  } else if (currentFilter.sort === "za") {
    filtered = filtered.slice().sort((a, b) => (b.title || b.name || "").localeCompare(a.title || a.name || ""));
  }
  displaySow1Files(filtered);
}

function displaySow1Files(sow1Files) {
  const contentList = document.querySelector(".content-list");
  // Always clear skeleton before rendering anything
  contentList.querySelector('.skeleton-grid')?.remove();
  if (!sow1Files || sow1Files.length === 0) {
    contentList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox empty-icon"></i><p>No SOW1 files uploaded yet.</p></div>`;
    return;
  }
  // Inject enhanced card CSS if not already present
  if (!document.getElementById("sow1CardStyles")) {
    const style = document.createElement("style");
    style.id = "sow1CardStyles";
    style.innerHTML = `
      .sow1-grid-modern {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
        margin-top: 0;
        width: 100%;
      }
      @media (min-width: 768px) {
        .sow1-grid-modern {
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        }
      }
      @media (min-width: 1200px) {
        .sow1-grid-modern {
          grid-template-columns: repeat(auto-fill, minmax(285px, 1fr));
        }
      }
      .sow1-card-modern {
        background: #fff;
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        border: 1px solid #e2e8f0;
        transition: all 0.2s ease;
        position: relative;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(15,23,42,0.04);
        width: 100%;
      }
      .sow1-card-modern:hover {
        transform: translateY(-6px);
        box-shadow: 0 12px 32px rgba(15,23,42,0.12);
        border-color: #cbd5e1;
      }
      .sow1-preview {
        width: 100%;
        height: 180px;
        background: linear-gradient(135deg, #3a4d2c 0%, #263820 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 3.2rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        position: relative;
      }
      .file-type-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        background: #fff;
        color: #263820;
        font-size: 0.85rem;
        font-weight: 700;
        border-radius: 6px;
        padding: 2px 10px;
        box-shadow: 0 1px 2px rgba(30,34,54,0.08);
        z-index: 2;
      }
      .sow1-icon {
        font-size: 3.2rem;
        color: #fff;
        opacity: 0.92;
      }
      .sow1-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 18px 18px 12px 18px;
      }
      .sow1-title {
        font-size: 1.18rem;
        font-weight: 700;
        color: #232946;
        margin: 0 0 6px 0;
        line-height: 1.2;
        word-break: break-word;
      }
      .sow1-meta {
        display: flex;
        gap: 12px;
        font-size: 0.98rem;
        color: #6b7280;
        margin-bottom: 4px;
        flex-wrap: wrap;
      }
      .sow1-meta i {
        margin-right: 4px;
        color: #b0b7c3;
      }
      .sow1-description {
        font-size: 0.97rem;
        color: #6b7280;
        margin: 0 0 4px 0;
      }
      .sow1-topic {
        font-size: 0.97rem;
        color: #3a4d2c;
        margin: 0;
      }
      .card-gdrive-account {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 0.78rem;
        color: #5f6d7e;
        margin: 4px 0 0 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-gdrive-account i {
        color: #4285f4;
        flex-shrink: 0;
      }
      .sow1-actions {
        padding: 12px 12px;
        border-top: 1px solid #f1f5f9;
        display: flex;
        gap: 8px;
        background: #fafbfc;
      }
      .action-btn {
        flex: 1 1 0;
        padding: 9px 14px;
        border: none;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 95px;
        white-space: nowrap;
      }
      .action-btn.view {
        background: #3b82f6;
        color: #ffffff;
      }
      .action-btn.view:hover {
        background: #2563eb;
        box-shadow: 0 4px 12px rgba(59,130,246,0.3);
      }
      .action-btn.delete {
        background: #ffffff;
        color: #dc2626;
        border: 1px solid #fecaca;
      }
      .action-btn.delete:hover {
        background: #fef2f2;
        border-color: #f87171;
      }
      .action-btn i {
        font-size: 0.75rem;
        flex-shrink: 0;
      }
      .action-btn span {
        display: inline-block;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }
  contentList.innerHTML = `<div class="sow1-grid sow1-grid-modern">${sow1Files.map((file) => createSow1FileCard(file)).join("")}</div>`;
  attachCardEventListeners();
}

function createSow1FileCard(file) {
  const fileIcon = getFileIcon(file.mimeType);
  const fileSize = formatFileSize(file.size);
  const uploadDate = formatDate(file.createdTime);
  const fileType = file.mimeType?.split("/")[1]?.toUpperCase() || "FILE";
  const fileName = file.name || "";

  // Parse title and topic from description, fallback to file fields if not found
  let parsed = { title: null, topic: null };
  if (file.description) {
    parsed = parseTitleAndTopicFromDescription(file.description);
  }
  const displayTitle = (parsed.title && parsed.title.trim()) || file.title || "";
  let displayTopic = (parsed.topic && parsed.topic.trim()) || file.topic || "";
  const gdriveAccount = file._uploaded_by || "";

  return `
    <div class="sow1-card sow1-card-modern" data-file-id="${file.id}" data-file-url="${file.webViewLink || file.webContentLink || ''}">
      <div class="sow1-preview">
        <div class="file-type-badge">${fileType}</div>
        <i class="sow1-icon ${fileIcon}"></i>
      </div>
      <div class="sow1-content">
        <h3 class="sow1-title">${escapeHtml(displayTitle)}</h3>
        <div class="sow1-meta">
          <span><i class="fas fa-calendar"></i>${uploadDate}</span>
          ${fileSize ? `<span><i class="fas fa-hdd"></i>${fileSize}</span>` : ""}
          <span><i class="fas fa-file"></i>${escapeHtml(fileName)}</span>
        </div>
        <p class="sow1-description">${fileType} document</p>
        <p class="sow1-topic"><strong>Topic:</strong> ${escapeHtml(displayTopic)}</p>
        ${gdriveAccount ? `<p class="card-gdrive-account"><i class="fab fa-google-drive"></i> ${escapeHtml(gdriveAccount)}</p>` : ""}
      </div>
      <div class="sow1-actions">
        <button class="action-btn view" data-action="view">
          <i class="fas fa-external-link-alt"></i>
          <span>Open</span>
        </button>
        <button class="action-btn delete admin-only" data-action="delete">
          <i class="fas fa-trash"></i>
          <span>Delete</span>
        </button>
      </div>
    </div>
  `;
}

async function openUploadModal() {
  console.log("[DEBUG] openUploadModal called");
  if (!isUserAuthenticated()) {
    showCustomAlert("Please log in to upload files.", "warning", () => {
      window.location.href = "../login/login.html";
    });
    return;
  }

  // Always reset Google Drive auth state on modal open (but NOT app login)
  oauthToken = null;
  connectedGoogleEmail = null;
  selectedFolder = null;
  // Open modal
  const modal = document.getElementById("uploadModal");
  modal.style.display = "flex";
  // Reset form
  clearSelectedFile();
  document.getElementById("sow1Title").value = "";
  const _sow1TopicEl = document.getElementById("sow1Topic");
  if (_sow1TopicEl) _sow1TopicEl.value = "";
  initTopicSuggestions("sow1Topic", () =>
    allSow1Files.map((f) => f.topic || f.category || "").filter(Boolean)
  );
  // Check Google Drive authentication and show appropriate section
  await checkAndShowGdriveSection();
  // Show success toast if just authenticated
  if (sessionStorage.getItem("showAuthSuccess") === "true") {
    sessionStorage.removeItem("showAuthSuccess");
    showToast("Google Drive connected successfully!", "success");
  }
}

function attachCardEventListeners() {
  const cards = document.querySelectorAll(".sow1-card");
  cards.forEach((card) => {
    card.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "view") {
        window.open(card.dataset.fileUrl, "_blank");
      } else if (btn.dataset.action === "delete") {
        deleteSow1File(card.dataset.fileId);
      }
    });
  });
}

function displayEmptyState(message = "No SOW 1 files available") {
  const contentList = document.querySelector(".content-list");
  contentList.innerHTML = `<div class="sow1-grid">${message}</div>`;
}

// ===================================
// DELETE FUNCTIONALITY
// ===================================

function showCustomConfirm(title, message, onConfirm, onCancel = null) {
  const modalHTML = `
    <div class="custom-confirm-overlay" id="customConfirmModal">
      <div class="custom-confirm-modal">
        <div class="confirm-header">
          <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="confirm-body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="confirm-footer">
          <button class="confirm-btn cancel" id="confirmCancelBtn">Cancel</button>
          <button class="confirm-btn confirm" id="confirmOkBtn">Confirm</button>
        </div>
      </div>
    </div>
  `;
  if (!document.getElementById("customConfirmStyles")) {
    const style = document.createElement("style");
    style.id = "customConfirmStyles";
    style.innerHTML = `
      .custom-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100000;animation:fadeIn .2s ease}
      .custom-confirm-modal{background:#fff;border-radius:16px;width:90%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:slideUp .3s ease}
      .confirm-header{padding:24px 24px 16px;border-bottom:1px solid #e2e8f0}
      .confirm-header h3{margin:0;font-size:1.25rem;font-weight:600;color:#1e293b}
      .confirm-body{padding:20px 24px}
      .confirm-body p{margin:0;font-size:.95rem;color:#64748b;line-height:1.6}
      .confirm-footer{padding:16px 24px;display:flex;gap:12px;justify-content:flex-end;border-top:1px solid #e2e8f0}
      .confirm-btn{padding:10px 24px;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;transition:all .2s ease}
      .confirm-btn.cancel{background:#f1f5f9;color:#475569}
      .confirm-btn.cancel:hover{background:#e2e8f0}
      .confirm-btn.confirm{background:#dc2626;color:#fff}
      .confirm-btn.confirm:hover{background:#b91c1c}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
    `;
    document.head.appendChild(style);
  }
  document.body.insertAdjacentHTML("beforeend", modalHTML);
  const modal = document.getElementById("customConfirmModal");
  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");
  const closeModal = () => modal.remove();
  okBtn.onclick = () => { closeModal(); if (onConfirm) onConfirm(); };
  cancelBtn.onclick = () => { closeModal(); if (onCancel) onCancel(); };
  modal.onclick = (e) => { if (e.target === modal) { closeModal(); if (onCancel) onCancel(); } };
}

async function deleteSow1File(fileId) {
  const userEmail = getCurrentUserEmail();

  // Check if the file belongs to a different Google Drive account
  const fileObj = allSow1Files.find(f => f.id === fileId);
  const fileOwner = fileObj?._uploaded_by || "";
  if (fileOwner && userEmail && fileOwner !== userEmail) {
    showToast(
      `This file belongs to ${fileOwner}. Switch to that Google Drive account to delete it.`,
      "warning"
    );
    return;
  }

  showCustomConfirm(
    "Delete SOW 1 file?",
    "Are you sure you want to delete this SOW 1 file? This action cannot be undone.",
    async () => {
      try {
        const response = await fetch(
          `${window.API_BASE_URL}/gdrive/sow1/delete-file/${fileId}`,
          {
            method: "DELETE",
            headers: {
              "X-User-Email": userEmail,
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
          },
        );
        if (response.ok) {
          allSow1Files = allSow1Files.filter((file) => file.id !== fileId);
          populateTopicFilter();
          applyFiltersAndDisplay();
          showToast("SOW 1 file deleted successfully!", "success");
        } else {
          const err = await response.json().catch(() => ({}));
          const detail = err.detail || "";
          if (response.status === 401 || detail.toLowerCase().includes("not connected") || detail.toLowerCase().includes("insufficientfilepermissions")) {
            showToast(
              `Cannot delete: this file belongs to a different Google Drive account${fileOwner ? " (" + fileOwner + ")" : ""}. Switch to that account to delete it.`,
              "warning"
            );
          } else {
            showToast(detail || "Failed to delete file.", "error");
          }
        }
      } catch (e) {
        showToast("Delete error. Please try again.", "error");
      }
    },
  );
}

// ===================================
// FILTER AND SEARCH
// ===================================

function initializeFilters() {
  const topicFilter = document.getElementById("topicFilter");
  const sortFilter = document.getElementById("sortFilter");
  if (topicFilter) {
    topicFilter.addEventListener("change", (e) => {
      currentFilter.topic = e.target.value;
      applyFiltersAndDisplay();
    });
  }
  if (sortFilter) {
    // Fix: ensure event is attached and value updates currentFilter.sort
    sortFilter.addEventListener("change", (e) => {
      currentFilter.sort = e.target.value;
      applyFiltersAndDisplay();
    });
    // Also, set the dropdown to currentFilter.sort on load
    sortFilter.value = currentFilter.sort;
  }
}

function initTopicSuggestions(inputId, getTopicsFn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const oldBox = document.getElementById(inputId + "-suggestions");
  if (oldBox) oldBox.remove();
  const wrap = input.parentElement;
  wrap.style.position = "relative";
  const box = document.createElement("div");
  box.id = inputId + "-suggestions";
  box.style.cssText =
    "position:absolute;z-index:9999;background:#fff;border:1px solid #d1d5db;" +
    "border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);max-height:180px;" +
    "overflow-y:auto;width:100%;display:none;top:calc(100% + 2px);left:0;";
  wrap.appendChild(box);
  function render(query) {
    const topics = [...new Set(getTopicsFn().filter(Boolean))].sort();
    const q = query.trim().toLowerCase();
    const matches = q ? topics.filter((t) => t.toLowerCase().includes(q)) : topics;
    if (!matches.length) { box.style.display = "none"; return; }
    box.innerHTML = matches
      .map(
        (t) =>
          `<div class="topic-suggestion-item" data-value="${t.replace(/"/g, "&quot;")}"
            style="padding:9px 14px;cursor:pointer;font-size:14px;color:#333;border-bottom:1px solid #f3f4f6;"
            onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background=''">${t}</div>`,
      )
      .join("");
    box.style.display = "block";
  }
  input.addEventListener("input", () => render(input.value));
  input.addEventListener("focus", () => render(input.value));
  box.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".topic-suggestion-item");
    if (item) { input.value = item.dataset.value; box.style.display = "none"; }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) box.style.display = "none";
  }, { capture: true });
}

function populateTopicFilter() {
  const topicFilter = document.getElementById("topicFilter");
  if (!topicFilter) {
    return;
  }
  // Get unique topics
  const uniqueTopics = [
    ...new Set(
      allSow1Files.map((f) => f.topic || f.category || "").filter(Boolean),
    ),
  ];
  uniqueTopics.sort();
  // Only show first 5 topics, add 'Others...' if more
  topicFilter.innerHTML = '<option value="all">All Topics</option>';
  const maxVisible = 5;
  const visibleTopics = uniqueTopics.slice(0, maxVisible);
  visibleTopics.forEach((topic) => {
    topicFilter.innerHTML += `<option value="${topic}">${topic}</option>`;
  });
  if (uniqueTopics.length > maxVisible) {
    topicFilter.innerHTML += '<option value="__others__">Others...</option>';
  }
  // Add event for 'Others...' to show all topics in a custom modal
  topicFilter.onchange = function(e) {
    if (topicFilter.value === "__others__") {
      showTopicModal(uniqueTopics, (selectedTopic) => {
        if (selectedTopic) {
          // If the selected topic is not in the first 5, add it as a temporary option and select it
          let found = false;
          for (let i = 0; i < topicFilter.options.length; i++) {
            if (topicFilter.options[i].value === selectedTopic) {
              found = true;
              break;
            }
          }
          if (!found) {
            // Insert after the last visible topic, before 'Others...'
            const opt = document.createElement('option');
            opt.value = selectedTopic;
            opt.textContent = selectedTopic;
            // Insert before the last option (which is 'Others...')
            topicFilter.insertBefore(opt, topicFilter.options[topicFilter.options.length - 1]);
          }
          topicFilter.value = selectedTopic;
          currentFilter.topic = selectedTopic;
        } else {
          topicFilter.value = "all";
          currentFilter.topic = "all";
        }
        applyFiltersAndDisplay();
      });
    } else {
      currentFilter.topic = topicFilter.value;
      applyFiltersAndDisplay();
    }
  };
}

// Show a custom modal for topic selection
function showTopicModal(topics, onSelect) {
  // Remove any existing modal
  const existing = document.getElementById("topicModalOverlay");
  if (existing) existing.remove();
  // Inject improved styles if not present
  if (!document.getElementById("topicModalStyles")) {
    const style = document.createElement("style");
    style.id = "topicModalStyles";
    style.textContent = `
      .topic-modal-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(30,34,54,0.18); z-index: 99999; display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .topic-modal {
        background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(30,34,54,0.18);
        padding: 28px 28px 18px 28px; min-width: 340px; max-width: 96vw; width: 370px;
        display: flex; flex-direction: column; align-items: stretch; position: relative;
        animation: popIn 0.18s;
      }
      @keyframes popIn { from { transform: scale(0.97); opacity: 0.7; } to { transform: scale(1); opacity: 1; } }
      .topic-modal h2 {
        font-size: 1.25rem; font-weight: 600; margin-bottom: 12px; color: #2d3748;
      }
      .topic-modal-search {
        margin-bottom: 10px; display: flex; align-items: center;
      }
      .topic-modal-search input {
        width: 100%; padding: 7px 12px; border: 1px solid #d1d5db; border-radius: 7px;
        font-size: 1rem; outline: none; transition: border 0.2s;
      }
      .topic-modal-search input:focus {
        border: 1.5px solid #3182ce;
      }
      .topic-list {
        max-height: 220px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;
        background: #f9f9fb; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      }
      .topic-list-item {
        padding: 10px 16px; cursor: pointer; font-size: 1rem; color: #2d3748;
        border-bottom: 1px solid #ececec; transition: background 0.13s, color 0.13s;
        user-select: none;
      }
      .topic-list-item:last-child { border-bottom: none; }
      .topic-list-item:hover, .topic-list-item.active {
        background: #e3eafe; color: #234e9b;
      }
      .topic-list-item.selected {
        background: #3182ce; color: #fff;
      }
      .topic-modal-footer {
        display: flex; justify-content: flex-end; margin-top: 0;
      }
      .topic-modal-cancel {
        background: #f3f4f6; color: #374151; border: none; border-radius: 7px;
        padding: 7px 18px; font-size: 1rem; cursor: pointer; transition: background 0.15s;
      }
      .topic-modal-cancel:hover {
        background: #e2e8f0;
      }
      @media (max-width: 500px) {
        .topic-modal { min-width: 0; width: 98vw; padding: 16px 4vw 10px 4vw; }
      }
    `;
    document.head.appendChild(style);
  }

  // Modal HTML with search
  const overlay = document.createElement("div");
  overlay.id = "topicModalOverlay";
  overlay.className = "topic-modal-overlay";
  overlay.innerHTML = `
    <div class="topic-modal" tabindex="-1">
      <h2>Select a Topic</h2>
      <div class="topic-modal-search">
        <input type="text" id="topicSearchInput" placeholder="Search topics..." autocomplete="off" />
      </div>
      <div class="topic-list" id="topicList">
        ${topics.map(t => `<div class='topic-list-item' data-topic="${t}">${escapeHtml(t)}</div>`).join("")}
      </div>
      <div class="topic-modal-footer">
        <button class="topic-modal-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Focus search input on open
  setTimeout(() => {
    const searchInput = document.getElementById("topicSearchInput");
    if (searchInput) searchInput.focus();
  }, 100);

  // Keyboard navigation and selection
  let currentIdx = -1;
  let filteredTopics = topics.slice();
  const topicListDiv = overlay.querySelector('#topicList');
  const searchInput = overlay.querySelector('#topicSearchInput');

  function renderList(filter = "") {
    filteredTopics = topics.filter(t => t.toLowerCase().includes(filter.toLowerCase()));
    topicListDiv.innerHTML = filteredTopics.length
      ? filteredTopics.map((t, i) => `<div class='topic-list-item${i === currentIdx ? ' active' : ''}' data-topic="${t}">${escapeHtml(t)}</div>`).join("")
      : `<div class='topic-list-item' style='color:#888;cursor:default;'>No topics found</div>`;
    // Re-attach click handlers
    topicListDiv.querySelectorAll('.topic-list-item').forEach((item, i) => {
      if (filteredTopics.length) {
        item.onclick = function() {
          selectTopic(filteredTopics[i]);
        };
        item.onmouseenter = function() {
          currentIdx = i;
          updateActive();
        };
      }
    });
    updateActive();
  }

  function updateActive() {
    topicListDiv.querySelectorAll('.topic-list-item').forEach((item, i) => {
      if (i === currentIdx) item.classList.add('active');
      else item.classList.remove('active');
    });
  }

  function selectTopic(topic) {
    overlay.remove();
    if (onSelect) onSelect(topic);
  }

  // Initial render
  renderList("");

  // Search input event
  searchInput.addEventListener('input', function(e) {
    currentIdx = -1;
    renderList(this.value);
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', function(e) {
    if (!filteredTopics.length) return;
    if (e.key === 'ArrowDown') {
      currentIdx = Math.min(filteredTopics.length - 1, currentIdx + 1);
      updateActive();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      currentIdx = Math.max(0, currentIdx - 1);
      updateActive();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (currentIdx >= 0 && currentIdx < filteredTopics.length) {
        selectTopic(filteredTopics[currentIdx]);
      }
    }
  });

  // Cancel button
  overlay.querySelector('.topic-modal-cancel').onclick = function() {
    overlay.remove();
    if (onSelect) onSelect(null);
  };

  // Close on overlay click (not modal click)
  overlay.onclick = function(e) {
    if (e.target === overlay) {
      overlay.remove();
      if (onSelect) onSelect(null);
    }
  };

  // Close on Escape key
  function escHandler(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      if (onSelect) onSelect(null);
      document.removeEventListener('keydown', escHandler);
    }
  }
  document.addEventListener('keydown', escHandler);
}

function initializeSearch() {
  const searchBar = document.getElementById("searchInput");
  if (!searchBar) return;

  // Create suggestions dropdown if not present
  let suggestionsDiv = document.getElementById("searchSuggestions");
  if (!suggestionsDiv) {
    suggestionsDiv = document.createElement("div");
    suggestionsDiv.id = "searchSuggestions";
    suggestionsDiv.className = "search-suggestions";
    searchBar.parentNode.appendChild(suggestionsDiv);
  }

  // Add CSS for suggestions if not present
  if (!document.getElementById("searchSuggestionsStyles")) {
    const style = document.createElement("style");
    style.id = "searchSuggestionsStyles";
    style.innerHTML = `
      .search-suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin-top: 4px;
        max-height: 300px;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
      }
      .suggestion-item {
        padding: 12px 16px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.2s;
      }
      .suggestion-item:last-child {
        border-bottom: none;
      }
      .suggestion-item:hover {
        background: #f5f5f5;
      }
      .suggestion-item i {
        margin-right: 8px;
        color: #666;
      }
    `;
    document.head.appendChild(style);
  }

  searchBar.addEventListener("input", (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    currentFilter.search = searchTerm;
    // Only show suggestions if input is not empty
    if (!searchTerm) {
      suggestionsDiv.innerHTML = "";
      suggestionsDiv.style.display = "none";
      applyFiltersAndDisplay();
      return;
    }
    // Filter unique titles
    const filtered = allSow1Files.filter((file) => {
      const title = (file.title || file.name || "").toLowerCase();
      return title.includes(searchTerm);
    });
    const uniqueTitles = [...new Set(filtered.map(f => f.title || f.name).filter(Boolean))];
    if (uniqueTitles.length === 0) {
      suggestionsDiv.innerHTML = "";
      suggestionsDiv.style.display = "none";
      applyFiltersAndDisplay();
      return;
    }
    suggestionsDiv.innerHTML = uniqueTitles.map(title =>
      `<div class="suggestion-item"><i class='fas fa-file-alt'></i>${escapeHtml(title)}</div>`
    ).join("");
    suggestionsDiv.style.display = "block";
    // Add click event to each suggestion
    Array.from(suggestionsDiv.children).forEach((item, idx) => {
      item.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        searchBar.value = uniqueTitles[idx];
        currentFilter.search = uniqueTitles[idx].toLowerCase();
        suggestionsDiv.innerHTML = "";
        suggestionsDiv.style.display = "none";
        // Filter strictly to this title
        const filteredFiles = allSow1Files.filter(f => (f.title || f.name) === uniqueTitles[idx]);
        displaySow1Files(filteredFiles);
      });
    });
    // Optionally, filter as you type
    applyFiltersAndDisplay();
  });

  // Hide suggestions when clicking outside
  document.addEventListener("click", (e) => {
    if (!searchBar.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.innerHTML = "";
      suggestionsDiv.style.display = "none";
    }
  });
}

// ===================================
// UTILITY FUNCTIONS
// ===================================

// =============================
// GOOGLE DRIVE AUTH & PICKER (SOW1)
// =============================

// Initiate Google OAuth flow for SOW1
async function initiateGoogleAuthInModal() {
  console.log("[DEBUG] initiateGoogleAuthInModal called (SOW1)");
  window.API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";
  try {
    const userEmail = getCurrentUserEmail();
    let url = `${window.API_BASE_URL}/gdrive/sow1/auth/login`;
    if (userEmail && userEmail !== "undefined") {
      url += `?user_email=${encodeURIComponent(userEmail)}`;
    }
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
    });
    console.log("[DEBUG] Google Drive auth fetch URL:", url);
    console.log(
      "[DEBUG] Google Drive auth fetch response status:",
      response.status,
      response.statusText,
    );
    if (!response.ok) {
      let errorText = await response.text();
      console.error(
        "[DEBUG] Google Drive auth failed. Response status:",
        response.status,
        response.statusText,
      );
      console.error(
        "[DEBUG] Google Drive auth failed. Response body:",
        errorText,
      );
      showToast("Failed to connect Google Drive. Please try again.", "error");
      const authBtn = document.getElementById("authGdriveBtn");
      if (authBtn) {
        authBtn.innerHTML =
          '<i class="fab fa-google"></i> Connect Google Drive';
        authBtn.disabled = false;
      }
      return;
    }
    const data = await response.json();
    if (data.authorization_url) {
      const authWindow = window.open(
        data.authorization_url,
        "Google Authentication",
        "width=600,height=700,left=100,top=100",
      );
      const messageHandler = (event) => {
        if (event.data && event.data.type === "google-auth-success") {
          window.removeEventListener("message", messageHandler);
          sessionStorage.setItem("googleAuthCompletedSow1", "true");
          window.location.reload();
        }
      };
      window.addEventListener("message", messageHandler);
      const checkWindowClosed = setInterval(() => {
        if (authWindow && authWindow.closed) {
          clearInterval(checkWindowClosed);
          window.removeEventListener("message", messageHandler);
          if (sessionStorage.getItem("googleAuthCompletedSow1") !== "true") {
            sessionStorage.setItem("googleAuthCompletedSow1", "true");
            window.location.reload();
          }
        }
      }, 1000);
    } else {
      showToast("Failed to get Google authorization URL.", "error");
    }
  } catch (error) {
    console.error("Error initiating Google auth:", error);
    showToast("Failed to connect Google Drive. Please try again.", "error");
    const authBtn = document.getElementById("authGdriveBtn");
    if (authBtn) {
      authBtn.innerHTML = '<i class="fab fa-google"></i> Connect Google Drive';
      authBtn.disabled = false;
    }
  }
}

// Open Google Picker for folder selection (SOW1)
function openDriveFolderPicker() {
  // If Picker API not loaded, load it and delay Picker opening
  if (!pickerApiLoaded) {
    showToast("Loading Google Picker...", "info");
    if (typeof gapi !== "undefined") {
      loadPickerApi();
      // Wait for Picker API to load, then try again
      let waitCount = 0;
      const maxWait = 20; // 20 x 250ms = 5s
      const waitForPicker = () => {
        if (pickerApiLoaded) {
          openDriveFolderPicker();
        } else if (waitCount < maxWait) {
          waitCount++;
          setTimeout(waitForPicker, 250);
        } else {
          showToast("Google Picker failed to load. Please try again.", "error");
        }
      };
      waitForPicker();
    } else {
      showToast("Google API not available. Please refresh the page.", "error");
    }
    return;
  }
  if (!oauthToken) {
    showToast(
      "Google Picker not authenticated. Please reconnect Google Drive.",
      "error",
    );
    return;
  }
  try {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(oauthToken)
      .setDeveloperKey(window.GOOGLE_API_KEY)
      .setCallback(pickerCallback)
      .setTitle("Select a Google Drive Folder")
      .build();
    picker.setVisible(true);
  } catch (e) {
    showToast("Google Picker failed to open. Please try again.", "error");
    console.error("Picker open error:", e);
  }
}

// --- SOW1 folder ID logic: remember last selected folder in localStorage ---
function getSow1FolderId() {
  return localStorage.getItem("sow1_folder_id") || null;
}
function setSow1FolderId(id) {
  if (id) {
    localStorage.setItem("sow1_folder_id", id);
    console.log('[DEBUG] setSow1FolderId: saved', id, 'to localStorage');
    // Also persist to server so all users (including user-role) can access
    fetch(`${window.API_BASE_URL}/gdrive/sow1/config?folder_id=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }
    }).catch(() => {});
  }
}

// Parse title and topic from description (like Teachings)
function parseTitleAndTopicFromDescription(description) {
  if (!description) return { title: "", topic: "" };
  let title = "";
  let topic = "";
  // Try to match "Title: ... | Topic: ..."
  const match = description.match(/Title:\s*([^|]+)\|\s*Topic:\s*(.+)/i);
  if (match) {
    title = match[1].trim();
    topic = match[2].trim();
  } else {
    // Try to match "Title: ... | Category: ..."
    const catMatch = description.match(/Title:\s*([^|]+)\|\s*Category:\s*(.+)/i);
    if (catMatch) {
      title = catMatch[1].trim();
      topic = catMatch[2].trim();
    } else {
      // Try to match "Title: ..."
      const tMatch = description.match(/Title:\s*(.+)/i);
      if (tMatch) title = tMatch[1].trim();
      // Try to match "Topic: ..."
      const cMatch = description.match(/Topic:\s*(.+)/i);
      if (cMatch) topic = cMatch[1].trim();
      // Fallback: Try to match "Category: ..." as topic
      if (!topic) {
        const catOnlyMatch = description.match(/Category:\s*(.+)/i);
        if (catOnlyMatch) topic = catOnlyMatch[1].trim();
      }
    }
  }
  return { title, topic };
}

function showSkeletonGrid(count = 6) {
  const contentList = document.querySelector(".content-list");
  if (!contentList) return;
  if (!document.getElementById("skeletonStyles")) {
    const style = document.createElement("style");
    style.id = "skeletonStyles";
    style.textContent = `
      @keyframes shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position:  600px 0; }
      }
      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
        width: 100%;
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
        height: 180px;
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
  `).join("");
  contentList.innerHTML = `<div class="skeleton-grid">${cards}</div>`;
}

async function loadSow1Files() {
  try {
    showSkeletonGrid(6);
    // Backend merges files from ALL connected Drive accounts — no folder_id needed
    const response = await fetch(`${window.API_BASE_URL}/gdrive/sow1/list-files`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
    });
    if (response.status === 503) {
      const contentList = document.querySelector(".content-list");
      if (contentList) contentList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox empty-icon"></i><p>No SOW1 folder configured yet. An admin needs to upload a file first.</p></div>`;
      return;
    }
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    // Parse title and topic from description for each file, match Teachings logic
    allSow1Files = (data.files || []).map(file => {
      if (file.description) {
        const parsed = parseTitleAndTopicFromDescription(file.description);
        if (parsed.title) file.title = parsed.title;
        if (parsed.topic) {
          file.topic = parsed.topic;
        } else {
          file.topic = file.topic || "";
        }
      }
      return file;
    });
    populateTopicFilter();
    applyFiltersAndDisplay();
  } catch (error) {
    console.error("loadSow1Files: error", error);
    const contentList = document.querySelector(".content-list");
    if (contentList) contentList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox empty-icon"></i><p>Failed to load files. Please reconnect Google Drive.</p></div>`;
  }
}
