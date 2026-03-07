// Listen for Google OAuth popup success and save Google Drive email to localStorage
window.addEventListener("message", (event) => {
  if (
    event.data &&
    event.data.type === "google-auth-success" &&
    event.data.email
  ) {
    localStorage.setItem("gdrive_user_email", event.data.email);
    sessionStorage.setItem("googleAuthCompleted", "true");
    window.location.reload();
  }
});

// Ensure modal and picker button event listeners are attached after DOM loads
document.addEventListener("DOMContentLoaded", () => {
  showSkeletonGrid(6);
  // Always render the account info box immediately using cached localStorage value
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
      // Just re-open the Picker to refresh
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
  const titleInput = document.getElementById("teachingTitle");
  if (titleInput) {
    titleInput.addEventListener("input", updateUploadButtonState);
  }

  checkAndShowGdriveSection();

  // Initialize filters and search
  initializeFilters();
  initializeSearch();

  // On page load, load teachings — list-files uses admin credential so all logged-in users can view
  loadTeachings();
});

function getCurrentUserEmail() {
  // Use gdrive_user_email for Google Drive logic
  return localStorage.getItem("gdrive_user_email") || "";
}

/* Teachings page JavaScript */

let connectedGoogleEmail = getCurrentUserEmail() || null;
let allConnectedGoogleAccounts = [];

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
    // Clear stored email and immediately open the OAuth account chooser
    localStorage.removeItem("gdrive_user_email");
    sessionStorage.removeItem("googleAuthCompleted");
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
      `${window.API_BASE_URL}/gdrive/teaching/auth/status`,
      {
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    if (!response.ok) return { authenticated: false };
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
    if (!userEmail) return null;
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/auth/token`,
      {
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    console.log("fetchGoogleOAuthToken: response status:", response.status);
    if (!response.ok) {
      console.warn(
        "fetchGoogleOAuthToken: response not ok",
        response.status,
        response.statusText,
      );
      return null;
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
  const isAuthenticated = status.authenticated;
  connectedGoogleEmail = status.email || null;
  updateConnectedGoogleAccountUI();
  console.log(
    "[DEBUG] checkAndShowGdriveSection: isAuthenticated=",
    isAuthenticated,
    "connectedGoogleEmail=",
    connectedGoogleEmail,
  );
  if (isAuthenticated) {
    oauthToken = await fetchGoogleOAuthToken();
    console.log("[DEBUG] checkAndShowGdriveSection: oauthToken=", oauthToken);
    if (pickerBtn) pickerBtn.disabled = false;
    if (authSection) authSection.style.display = "none";
    if (confirmBtn) confirmBtn.disabled = false;
    // Show create/refresh folder UI if present
    const gdriveFolderHelper = document.getElementById("gdriveFolderHelper");
    if (gdriveFolderHelper) gdriveFolderHelper.style.display = "block";
  } else {
    oauthToken = null;
    if (authSection) authSection.style.display = "block";
    if (pickerBtn) pickerBtn.disabled = true;
    if (confirmBtn) confirmBtn.disabled = true;
    console.log("[DEBUG] Not authenticated, showing auth section");
    // Hide create/refresh folder UI if present
    const gdriveFolderHelper = document.getElementById("gdriveFolderHelper");
    if (gdriveFolderHelper) gdriveFolderHelper.style.display = "none";
  }
}

async function logoutGoogleDriveAccount() {
  try {
    const gdriveEmail = localStorage.getItem("gdrive_user_email") || "";
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/auth/logout`,
      {
        method: "POST",
        headers: {
          "X-User-Email": gdriveEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    if (response.ok) {
      // Only clear Google Drive email, not app login
      localStorage.removeItem("gdrive_user_email");
      sessionStorage.removeItem("googleAuthCompleted");
      showToast(
        "Logged out from Google Drive. Please connect a new account.",
        "info",
      );
      connectedGoogleEmail = null;
      updateConnectedGoogleAccountUI();
      await checkAndShowGdriveSection();
    } else {
      showToast("Failed to logout Google Drive.", "error");
    }
  } catch (e) {
    showToast("Logout error.", "error");
  }
}

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
      .custom-modal .current-badge {
        background: #263820;
        color: #fff;
        font-size: 0.85rem;
        font-weight: 600;
        border-radius: 6px;
        padding: 2px 8px;
        margin-left: 6px;
        letter-spacing: 0.02em;
      }
      .custom-modal .account-date {
        font-size: 0.92rem;
        color: #7b7b8b;
        margin-top: 2px;
      }
      .custom-modal .account-actions {
        display: flex;
        gap: 8px;
      }
      .custom-modal .switch-btn {
        background: #3a4d2c;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 0.98rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
        box-shadow: 0 1px 2px rgba(30,34,54,0.06);
      }
      .custom-modal .switch-btn:hover {
        background: #263820;
      }
      .custom-modal .remove-btn {
        background: #f44336;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 14px;
        font-size: 0.98rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
        box-shadow: 0 1px 2px rgba(30,34,54,0.06);
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
      `${window.API_BASE_URL}/gdrive/teaching/auth/users`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      }
    );
    if (!response.ok) {
      showToast("Failed to fetch accounts.", "error");
      return;
    }
    const data = await response.json();
    console.log("[DEBUG] /gdrive/teaching/auth/users response:", data);
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
      const isCurrent = acc.email === currentEmail;
      const avatarLetter =
        acc.email && acc.email.length > 0 ? acc.email[0].toUpperCase() : "U";
      const displayEmail = acc.email || "<i>Unknown</i>";
      const lastUpdated = acc.last_updated
        ? `<span class="account-date">Last updated: ${acc.last_updated}</span>`
        : "";
      let accountClass = "account-item";
      if (isCurrent) accountClass += " current";
      html += `
        <li class="${accountClass}">
          <div class="account-avatar">${avatarLetter}</div>
          <div class="account-details">
            <div class="account-email">${displayEmail} ${isCurrent ? '<span class="current-badge">Current</span>' : ""}</div>
            ${lastUpdated}
          </div>
          <div class="account-actions">
            ${!isCurrent && acc.email ? `<button class="switch-btn" data-email="${acc.email}">Switch</button>` : ""}
            ${acc.email ? `<button class="remove-btn" data-email="${acc.email}">Remove</button>` : ""}
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
      overlay.classList.add("fade-out");
      setTimeout(() => overlay.remove(), 200);
    }

    document.getElementById("closeAccountsModal").onclick = closeModal;
    document.getElementById("closeAccountsModalFooter").onclick = closeModal;

    // Click outside to close
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // ESC key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // Switch logic
    document.querySelectorAll(".switch-btn").forEach((btn) => {
      btn.onclick = async function () {
        const email = this.getAttribute("data-email");
        if (!email) return;

        this.innerHTML = "Switching...";
        this.disabled = true;

        localStorage.setItem("gdrive_user_email", email);

        setTimeout(() => {
          showToast(`Switched to ${email}`, "success");
          closeModal();
          location.reload();
        }, 800);

        // Optionally, refresh UI to reflect new account
        await checkAndShowGdriveSection();
      };
    });

    // Remove logic
    document.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const email = btn.getAttribute("data-email");
        if (!email) return;
        showRemoveAccountModal(email, btn);
      });
    });

    // Custom modal for account removal confirmation
    function showRemoveAccountModal(email, btn) {
      // Remove any existing modal
      const existing = document.getElementById("removeAccountModal");
      if (existing) existing.remove();

      const modalHtml = `
      <div class="custom-modal-overlay" id="removeAccountModal">
        <div class="custom-modal">
          <div class="modal-header">
            <h3>Remove Google Drive Account</h3>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to remove <b>${escapeHtml(email)}</b> from connected Google Drive accounts?</p>
          </div>
          <div class="modal-footer">
            <button class="secondary-btn" id="cancelRemoveAccountBtn">Cancel</button>
            <button class="danger-btn" id="confirmRemoveAccountBtn">Remove</button>
          </div>
        </div>
      </div>
    `;
      document.body.insertAdjacentHTML("beforeend", modalHtml);

      const overlay = document.getElementById("removeAccountModal");
      document.getElementById("cancelRemoveAccountBtn").onclick = () =>
        overlay.remove();
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      document.getElementById("confirmRemoveAccountBtn").onclick = async () => {
        overlay.remove();
        try {
          const response = await fetch(
            `${window.API_BASE_URL}/gdrive/teaching/auth/remove`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-User-Email": email,
                Authorization: `Bearer ${localStorage.getItem("access_token")}`,
              },
            },
          );
          if (!response.ok) {
            showToast("Failed to remove account.", "error");
            return;
          }
          if (email === getCurrentUserEmail()) {
            localStorage.removeItem("gdrive_user_email");
            sessionStorage.removeItem("googleAuthCompleted");
            window.location.reload();
          } else {
            btn.closest(".account-item").remove();
            showToast("Account removed.", "success");
          }
        } catch (err) {
          showToast("Error removing account.", "error");
        }
      };
    }
  } catch (e) {
    showToast("Error showing accounts.", "error");
  }
}

// State management
let allTeachings = [];
let currentFilter = { title: "all", sort: "newest" };
let selectedFolderId = null;
let selectedFile = null;
let availableFolders = [];
let currentUser = null;
let pickerApiLoaded = false;
let oauthToken = null;
let selectedFolder = null;

// Load Google Picker API
function loadPickerApi() {
  gapi.load("picker", { callback: onPickerApiLoad });
}

// Function to initiate Google Drive auth from inside modal
async function initiateGoogleAuthInModal() {
  console.log("[DEBUG] initiateGoogleAuthInModal called");
  // Ensure API base URL is set
  window.API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";
  console.log("[DEBUG] API_BASE_URL:", window.API_BASE_URL);
  try {
    // Always send user_email as query param for consistent backend linkage
    const userEmail = getCurrentUserEmail();
    let url = `${window.API_BASE_URL}/gdrive/teaching/auth/login`;
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
      // Try to log the response body for debugging
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
    // Expecting a JSON response with authorization_url
    const data = await response.json();
    if (data.authorization_url) {
      // Open Google OAuth in popup window
      const authWindow = window.open(
        data.authorization_url,
        "Google Authentication",
        "width=600,height=700,left=100,top=100",
      );
      // Listen for success message from popup
      const messageHandler = (event) => {
        // Security: check origin if needed
        if (event.data && event.data.type === "google-auth-success") {
          window.removeEventListener("message", messageHandler);
          sessionStorage.setItem("googleAuthCompleted", "true");
          // Reload the page to refresh auth status
          window.location.reload();
        }
      };
      window.addEventListener("message", messageHandler);
      // Fallback: check if window was closed without message
      const checkWindowClosed = setInterval(() => {
        if (authWindow && authWindow.closed) {
          clearInterval(checkWindowClosed);
          window.removeEventListener("message", messageHandler);
          // If no success message received, just reload to check status
          if (sessionStorage.getItem("googleAuthCompleted") !== "true") {
            sessionStorage.setItem("googleAuthCompleted", "true");
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

function onPickerApiLoad() {
  pickerApiLoaded = true;
}

// Open Google Picker for folder selection
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
      // .setOrigin(window.location.protocol + '//' + window.location.host) // Do NOT force iframe
      .build();
    picker.setVisible(true);
  } catch (e) {
    showToast("Google Picker failed to open. Please try again.", "error");
    console.error("Picker open error:", e);
  }
}

function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const folder = data.docs[0];
    selectedFolder = { id: folder.id, name: folder.name };
    document.getElementById("selectedFolderName").textContent = folder.name;
    updateUploadButtonState();
  }
}

// Update upload button state to require selectedFolder
function updateUploadButtonState() {
  const confirmBtn = document.getElementById("confirmUploadBtn");
  const titleInput = document.getElementById("teachingTitle");
  
  const hasFile = selectedFile !== null;
  const hasFolder = selectedFolder !== null;
  const hasTitle = titleInput && titleInput.value.trim() !== "";
  
  confirmBtn.disabled = !(hasFile && hasFolder && hasTitle);
}

// On modal open, reset selectedFolder
function isUserAuthenticated() {
  // User is app-authenticated if a JWT access token is present
  return !!localStorage.getItem("access_token");
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
  document.getElementById("teachingTitle").value = "";
  document.getElementById("teachingTopic").value = "";
  initTopicSuggestions("teachingTopic", () =>
    allTeachings.map((t) => t.topic || t.category || "").filter(Boolean)
  );
  // Check Google Drive authentication and show appropriate section
  await checkAndShowGdriveSection();
  // Show success toast if just authenticated
  if (sessionStorage.getItem("showAuthSuccess") === "true") {
    sessionStorage.removeItem("showAuthSuccess");
    showToast("Google Drive connected successfully!", "success");
  }
}

function closeUploadModal() {
  const modal = document.getElementById("uploadModal");
  if (modal) modal.style.display = "none";
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
    const lastFolderId = localStorage.getItem("teachingFolderId");
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

function selectFileForUpload(file) {
  selectedFile = file;

  // Update UI
  const fileDropZone = document.getElementById("fileDropZone");
  const selectedFileInfo = document.getElementById("selectedFileInfo");
  const selectedFileName = document.getElementById("selectedFileName");

  fileDropZone.querySelector("i").style.display = "none";
  fileDropZone.querySelector("p").style.display = "none";
  selectedFileInfo.style.display = "flex";
  selectedFileName.textContent = file.name;

  updateUploadButtonState();
}

function clearSelectedFile() {
  selectedFile = null;

  const modalFileInput = document.getElementById("modalFileInput");
  modalFileInput.value = "";

  const fileDropZone = document.getElementById("fileDropZone");
  const selectedFileInfo = document.getElementById("selectedFileInfo");

  fileDropZone.querySelector("i").style.display = "block";
  fileDropZone.querySelector("p").style.display = "block";
  selectedFileInfo.style.display = "none";

  updateUploadButtonState();
}



async function createNewFolderInModal() {
  // Open Google Drive in new tab so user can create folder
  window.open("https://drive.google.com/drive/my-drive", "_blank");

  // Inform user what to do
  const folderSelect = document.getElementById("folderSelect");
  folderSelect.innerHTML =
    '<option value="">Create a folder in Google Drive, then click refresh</option>';
}

async function uploadFromModal() {
  try {
    if (!selectedFolder) {
      showToast("Please select a Google Drive folder.", "error");
      return;
    }
    const folderId = selectedFolder.id;
    const makePublic = document.getElementById("makePublicCheckbox").checked;
    const topic = document.getElementById("teachingTopic")?.value.trim() || "";
    const title = document.getElementById("teachingTitle")?.value.trim() || "";

    // Validation
    if (!selectedFile) {
      showToast("Please select a file", "error");
      return;
    }
    if (!title) {
      showToast("Please enter a title", "error");
      return;
    }
    if (!topic) {
      showToast("Please enter a topic", "error");
      return;
    }
    if (!folderId) {
      showToast("Please select a folder", "error");
      return;
    }

    const confirmBtn = document.getElementById("confirmUploadBtn");
    const originalContent = confirmBtn.innerHTML;
    confirmBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    confirmBtn.disabled = true;

    const userEmail = getCurrentUserEmail();

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("folder_id", folderId);
    formData.append("title", title);
    formData.append("topic", topic);
    formData.append("category", topic); // Use topic for category for compatibility
    formData.append("make_public", makePublic.toString());

    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/upload`,
      {
        method: "POST",
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Upload failed");
    }

    const result = await response.json();

    // Save last used folder — both localStorage and server-side so all users see it
    localStorage.setItem("teachingsFolderId", folderId);
    selectedFolderId = folderId;
    fetch(`${window.API_BASE_URL}/gdrive/teaching/config?folder_id=${encodeURIComponent(folderId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` }
    }).catch(() => {});

    showToast(`Teaching "${result.title}" uploaded successfully!`, "success");

    closeUploadModal();
    // Refresh teachings list after upload
    await loadTeachings();
  } catch (error) {
    console.error("Upload error:", error);
    if (
      error.message.includes("401") ||
      error.message.includes("authenticated")
    ) {
      showToast(
        "Authentication error. Please reconnect Google Drive.",
        "error",
      );
    } else {
      showToast(error.message || "Upload failed", "error");
    }
  }
}

async function fetchGoogleDriveFolders() {
  try {
    const userEmail = getCurrentUserEmail();
    if (!userEmail) return [];

    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/list-files`,
      {
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
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

// ===================================
// UPLOAD BUTTON INITIALIZATION (OLD INPUT METHOD - REMOVED)
// ===================================

function initializeUploadButton() {
  // Upload button now opens modal - handled in initializeModal()
  // This function kept for compatibility but does nothing
}

// ===================================
// GOOGLE DRIVE AUTHENTICATION
// ===================================

async function initiateGoogleAuth() {
  try {
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/auth/login`,
    );
    const data = await response.json();

    // Open Google OAuth in popup window
    const authWindow = window.open(
      data.authorization_url,
      "Google Authentication",
      "width=600,height=700,left=100,top=100",
    );

    // Listen for success message from popup
    const messageHandler = (event) => {
      // Security: check origin if needed
      if (event.data && event.data.type === "google-auth-success") {
        window.removeEventListener("message", messageHandler);
        sessionStorage.setItem("googleAuthCompleted", "true");
        // Reload the page to refresh auth status
        window.location.reload();
      }
    };

    window.addEventListener("message", messageHandler);

    // Fallback: check if window was closed without message
    const checkWindowClosed = setInterval(() => {
      if (authWindow && authWindow.closed) {
        clearInterval(checkWindowClosed);
        window.removeEventListener("message", messageHandler);

        // If no success message received, just reload to check status
        if (sessionStorage.getItem("googleAuthCompleted") !== "true") {
          sessionStorage.setItem("googleAuthCompleted", "true");
          window.location.reload();
        }
      }
    }, 1000);
  } catch (error) {
    console.error("Auth error:", error);
    showToast(
      "Failed to initiate Google Drive authentication. Please try again.",
      "error",
    );
  }
}

async function checkAuthStatus() {
  try {
    const userEmail = getCurrentUserEmail();
    if (!userEmail) return false;
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/auth/status`,
      {
        headers: {
          "X-User-Email": userEmail,
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      },
    );
    if (!response.ok) return false;
    const data = await response.json();
    return data.authenticated;
  } catch (error) {
    console.error("Auth status check error:", error);
    return false;
  }
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

async function loadTeachings() {
  try {
    // Check authentication first
    if (!isUserAuthenticated()) {
      displayEmptyState("Please log in to view teachings");
      return;
    }

    // Show cached data instantly, refresh in background (stale-while-revalidate)
    const cached = localStorage.getItem('cache_teachings_files');
    if (cached) {
      try {
        allTeachings = JSON.parse(cached);
        populateTopicFilter();
        applyFiltersAndDisplay();
      } catch(e) { showSkeletonGrid(6); }
    } else {
      showSkeletonGrid(6);
    }

    // Backend merges files from ALL connected Drive accounts — no folder_id needed
    const _ctrl = new AbortController();
    const _tid = setTimeout(() => _ctrl.abort(), 20000);
    const response = await fetch(
      `${window.API_BASE_URL}/gdrive/teaching/list-files`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        signal: _ctrl.signal,
      },
    );
    clearTimeout(_tid);

    if (response.status === 503) {
      displayEmptyState('No teachings folder configured yet. An admin needs to upload a teaching first.');
      return;
    }
    if (!response.ok) {
      throw new Error("Failed to load teachings");
    }

    const data = await response.json();
    allTeachings = data.files || [];

    // Filter out folders from the list (only show files)
    allTeachings = allTeachings.filter(
      (file) => file.mimeType !== "application/vnd.google-apps.folder",
    );

    // Parse description to extract title and category
    allTeachings = allTeachings.map(file => {
      const metadata = parseFileDescription(file.description);
      return { ...file, ...metadata };
    });

    // Cache for instant display on next load
    try { localStorage.setItem('cache_teachings_files', JSON.stringify(allTeachings)); } catch(e) {}

    populateTopicFilter();
    applyFiltersAndDisplay();
  } catch (error) {
    console.error("Load teachings error:", error);
    if (error.name === 'AbortError') {
      displayEmptyState('Server is starting up — this can take up to 30 seconds on first load. Please refresh the page to retry.');
    } else if (error.message.includes("authenticated")) {
      displayEmptyState("Connecting to Google Drive...");
      await initiateGoogleAuth();
    } else {
      displayEmptyState(
        'Failed to load teachings. Click "Upload" to select a folder.',
      );
    }
  }
}

// ===================================
// METADATA PARSING
// ===================================

function parseFileDescription(description) {
  const metadata = { title: null, category: null };
  
  if (!description) return metadata;
  
  // Parse "Title: xxx | Category: yyy" format
  const titleMatch = description.match(/Title:\s*([^|]+)/);
  const categoryMatch = description.match(/Category:\s*(.+)/);
  
  if (titleMatch) metadata.title = titleMatch[1].trim();
  if (categoryMatch) metadata.category = categoryMatch[1].trim();
  
  return metadata;
}

// ===================================
// DISPLAY FUNCTIONS
// ===================================

function applyFiltersAndDisplay() {
  let filteredTeachings = [...allTeachings];

  // Apply topic filter
  if (currentFilter.topic && currentFilter.topic !== "all") {
    filteredTeachings = filteredTeachings.filter((teaching) => {
      const topic = teaching.topic || teaching.category || "";
      return topic === currentFilter.topic;
    });
  }

  // Apply sorting
  filteredTeachings.sort((a, b) => {
    const dateA = new Date(a.createdTime);
    const dateB = new Date(b.createdTime);
    return currentFilter.sort === "newest" ? dateB - dateA : dateA - dateB;
  });

  displayTeachings(filteredTeachings);
}

function displayTeachings(teachings) {
  const contentList = document.querySelector(".content-list");

  if (!teachings || teachings.length === 0) {
    displayEmptyState("No teachings available");
    return;
  }

  // Inject enhanced teaching-style card CSS if not already present
  if (!document.getElementById("teachingCardStyles")) {
    const style = document.createElement("style");
    style.id = "teachingCardStyles";
    style.innerHTML = `
      .teaching-grid-modern {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
        margin-top: 0;
        width: 100%;
      }
      @media (min-width: 768px) {
        .teaching-grid-modern {
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        }
      }
      @media (min-width: 1200px) {
        .teaching-grid-modern {
          grid-template-columns: repeat(auto-fill, minmax(285px, 1fr));
        }
      }
      .teaching-card-modern {
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
      .teaching-card-modern:hover {
        transform: translateY(-6px);
        box-shadow: 0 12px 32px rgba(15,23,42,0.12);
        border-color: #cbd5e1;
      }
      .teaching-preview-modern {
        width: 100%;
        height: 180px;
        background: linear-gradient(135deg, #3a4d2c 0%, #263820 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }
      .teaching-preview-modern::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(58,77,44,0.9) 0%, rgba(38,56,32,0.9) 100%);
        z-index: 1;
      }
      .teaching-icon-modern {
        font-size: 3.5rem;
        color: rgba(255,255,255,0.95);
        z-index: 2;
        position: relative;
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
      }
      .file-type-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(255,255,255,0.95);
        color: #4338ca;
        font-weight: 600;
        z-index: 3;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .teaching-content-modern {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }
      .teaching-title-modern {
        font-size: 1.05rem;
        font-weight: 600;
        color: #1e293b;
        margin: 0;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 2.7rem;
      }
      .teaching-meta-modern {
        font-size: 0.875rem;
        color: #64748b;
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        align-items: center;
      }
      .teaching-meta-modern i {
        margin-right: 6px;
        color: #94a3b8;
      }
      .teaching-description-modern {
        font-size: 0.9rem;
        color: #64748b;
        line-height: 1.5;
        margin: 4px 0 0 0;
      }
      .teaching-topic-modern {
        font-size: 0.95rem;
        color: #3a4d2c;
        margin-bottom: 0.5rem;
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
      .teaching-actions-modern {
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

  // Use teaching-style markup for each teaching card
  function createTeachingModernCard(teaching) {
    const fileIcon = getFileIcon(teaching.mimeType);
    const fileSize = formatFileSize(teaching.size);
    const uploadDate = formatDate(teaching.createdTime);
    const fileType = getFileTypeLabel(teaching.mimeType);
    const displayTitle = teaching.title || teaching.category || teaching.name;
    const fileName = teaching.name || "";
    // category IS the topic (both sent from the upload form)
    const topic = teaching.topic || teaching.category || "";
    const gdriveAccount = teaching._uploaded_by || "";

    return `
      <div class="teaching-card-modern teaching-card" data-file-id="${teaching.id}" data-file-url="${teaching.webViewLink || teaching.webContentLink || ''}">
        <div class="teaching-preview-modern teaching-preview">
          <div class="file-type-badge">${fileType}</div>
          <i class="teaching-icon-modern teaching-icon ${fileIcon}"></i>
        </div>
        <div class="teaching-content-modern teaching-content">
          <h3 class="teaching-title-modern teaching-title">${escapeHtml(displayTitle)}</h3>
          <div class="teaching-meta-modern teaching-meta">
            <span><i class="fas fa-calendar"></i>${uploadDate}</span>
            ${fileSize ? `<span><i class="fas fa-hdd"></i>${fileSize}</span>` : ""}
            <span><i class="fas fa-file"></i>${escapeHtml(fileName)}</span>
          </div>
          <p class="teaching-description-modern teaching-description">${fileType} document</p>
          <p class="teaching-topic-modern teaching-topic"><strong>Topic:</strong> ${escapeHtml(topic)}</p>
          ${gdriveAccount ? `<p class="card-gdrive-account"><i class="fab fa-google-drive"></i> ${escapeHtml(gdriveAccount)}</p>` : ""}
        </div>
        <div class="teaching-actions-modern teaching-actions">
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

  contentList.innerHTML = `<div class="teaching-grid-modern">${teachings
    .map((teaching) => createTeachingModernCard(teaching))
    .join("")}</div>`;
  attachCardEventListeners();
}

function createTeachingCard(teaching) {
  const fileIcon = getFileIcon(teaching.mimeType);
  const fileSize = formatFileSize(teaching.size);
  const uploadDate = formatDate(teaching.createdTime);
  const fileType = getFileTypeLabel(teaching.mimeType);

  // Show title as main title, filename in meta
  const displayTitle = teaching.title || teaching.category || teaching.name;
  const fileName = teaching.name || "";
  // category IS the topic
  let topic = teaching.topic || teaching.category;
  if (!topic && teaching.category) {
    if (
      teaching.category !== displayTitle &&
      teaching.category !== teaching.name
    ) {
      topic = teaching.category;
    }
  }
  topic = topic || "";
  const gdriveAccount = teaching._uploaded_by || "";

  return `
    <div class="teaching-card" data-file-id="${teaching.id}" data-file-url="${teaching.webViewLink || teaching.webContentLink || ''}">
      <div class="teaching-preview">
        <div class="file-type-badge">${fileType}</div>
        <i class="teaching-icon ${fileIcon}"></i>
      </div>
      <div class="teachings-content">
        <h3 class="teaching-title">${escapeHtml(displayTitle)}</h3>
        <div class="teaching-meta">
          <span><i class="fas fa-calendar"></i>${uploadDate}</span>
          ${fileSize ? `<span><i class="fas fa-hdd"></i>${fileSize}</span>` : ""}
          <span><i class="fas fa-file"></i>${escapeHtml(fileName)}</span>
        </div>
        <p class="teaching-description">${fileType} document</p>
        <p class="teaching-topic"><strong>Topic:</strong> ${escapeHtml(topic)}</p>
        ${gdriveAccount ? `<p class="card-gdrive-account"><i class="fab fa-google-drive"></i> ${escapeHtml(gdriveAccount)}</p>` : ""}
      </div>
      <div class="teaching-actions">
        <button class="action-btn view" data-action="view">
          <i class="fas fa-external-link-alt"></i>
          <span>Open</span>
        </button>
        <button class="action-btn delete" data-action="delete">
          <i class="fas fa-trash"></i>
          <span>Delete</span>
        </button>
      </div>
    </div>
  `;
}

function attachCardEventListeners() {
  const cards = document.querySelectorAll(".teaching-card");
  
  cards.forEach((card) => {
    const fileId = card.getAttribute("data-file-id");
    const fileUrl = card.getAttribute("data-file-url");
    const viewBtn = card.querySelector(".action-btn.view");
    const deleteBtn = card.querySelector(".action-btn.delete");
    
    // View button
    if (viewBtn) {
      viewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (fileUrl) {
          window.open(fileUrl, "_blank");
        } else {
          showToast("Unable to open file", "error");
        }
      });
    }
    
    // Delete button
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteTeaching(fileId);
      });
    }
    
    // Click on preview or content area (but not buttons) to open file
    const preview = card.querySelector(".teaching-preview");
    const content = card.querySelector(".teaching-content");
    
    [preview, content].forEach(element => {
      if (element) {
        element.addEventListener("click", () => {
          if (fileUrl) {
            window.open(fileUrl, "_blank");
          } else {
            showToast("Unable to open file", "error");
          }
        });
      }
    });
  });
}

function displayEmptyState(message = "No teachings available") {
  const contentList = document.querySelector(".content-list");
  
  // Inject enhanced empty state styles if not present
  if (!document.getElementById("emptyStateStyles")) {
    const style = document.createElement("style");
    style.id = "emptyStateStyles";
    style.innerHTML = `
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 20px;
        text-align: center;
        animation: fadeIn 0.4s ease;
      }
      
      .empty-icon {
        font-size: 5rem;
        color: #cbd5e1;
        margin-bottom: 24px;
        animation: float 3s ease-in-out infinite;
      }
      
      .empty-state p {
        font-size: 1.15rem;
        color: #64748b;
        margin: 0 0 8px 0;
        font-weight: 500;
      }
      
      .empty-state-hint {
        font-size: 0.95rem;
        color: #94a3b8;
        margin-top: 8px;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  const hint = message.includes("log in") 
    ? "<div class='empty-state-hint'>Please sign in to access your teachings</div>"
    : message.includes("Upload")
    ? "<div class='empty-state-hint'>Start by uploading your first file</div>"
    : "<div class='empty-state-hint'>Try adjusting your filters or upload new content</div>";
  
  contentList.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-inbox empty-icon"></i>
      <p>${message}</p>
      ${hint}
    </div>
  `;
}

// ===================================
// DELETE FUNCTIONALITY
// ===================================

async function deleteTeaching(fileId) {
  const userEmail = getCurrentUserEmail();
  if (!userEmail) {
    showCustomAlert("You must connect a Google Drive account before deleting files.", "error");
    return;
  }

  // Check if the file belongs to a different Google Drive account
  const fileObj = allTeachings.find(t => t.id === fileId);
  const fileOwner = fileObj?._uploaded_by || "";
  if (fileOwner && fileOwner !== userEmail) {
    showToast(
      `This file belongs to ${fileOwner}. Switch to that Google Drive account to delete it.`,
      "warning"
    );
    return;
  }

  showCustomConfirm(
    "Delete Teaching?",
    "Are you sure you want to delete this teaching? This action cannot be undone.",
    async () => {
      try {
        const response = await fetch(
          `${window.API_BASE_URL}/gdrive/teaching/delete-file/${fileId}`,
          {
            method: "DELETE",
            headers: {
              "X-User-Email": userEmail,
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
          },
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const detail = err.detail || "";
          if (response.status === 401 || detail.toLowerCase().includes("not connected") || detail.toLowerCase().includes("insufficientfilepermissions")) {
            showToast(
              `Cannot delete: this file belongs to a different Google Drive account${fileOwner ? " (" + fileOwner + ")" : ""}. Switch to that account to delete it.`,
              "warning"
            );
          } else {
            showToast(detail || "Failed to delete teaching.", "error");
          }
          return;
        }

        showToast("Teaching deleted successfully!", "success");
        await loadTeachings();
      } catch (error) {
        console.error("Delete error:", error);
        showToast("Delete error. Please try again.", "error");
      }
    }
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
    sortFilter.addEventListener("change", (e) => {
      currentFilter.sort = e.target.value;
      applyFiltersAndDisplay();
    });
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
  if (!topicFilter) return;

  // Get unique topics (from .topic, fallback to .category only if not equal to title or name)
  const uniqueTopics = [...new Set(allTeachings.map(t => {
    if (t.topic) return t.topic;
    const displayTitle = t.title || t.category || t.name;
    if (
      t.category &&
      t.category !== displayTitle &&
      t.category !== t.name
    ) {
      return t.category;
    }
    return "";
  }).filter(Boolean))];
  uniqueTopics.sort();

  // Clear and repopulate
  topicFilter.innerHTML = '<option value="all">All Topics</option>';
  uniqueTopics.forEach(topic => {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    topicFilter.appendChild(option);
  });
}

function initializeSearch() {
  const searchBar = document.getElementById("searchInput");
  const suggestionsDiv = document.getElementById("searchSuggestions");

  if (!searchBar || !suggestionsDiv) return;

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

    if (!searchTerm) {
      suggestionsDiv.style.display = "none";
      displayTeachings(allTeachings);
      return;
    }

    // Filter teachings
    const filtered = allTeachings.filter((teaching) => {
      const title = (teaching.title || teaching.category || teaching.name || "").toLowerCase();
      return title.includes(searchTerm);
    });

    // Show suggestions
    const uniqueTitles = [...new Set(filtered.map(t => t.title || t.category || t.name).filter(Boolean))];
    
    if (uniqueTitles.length > 0 && searchTerm.length > 0) {
      suggestionsDiv.innerHTML = uniqueTitles.slice(0, 5).map(title => 
        `<div class="suggestion-item" data-title="${escapeHtml(title)}">
          <i class="fas fa-search"></i>${escapeHtml(title)}
        </div>`
      ).join("");
      suggestionsDiv.style.display = "block";

      // Add click handlers to suggestions
      suggestionsDiv.querySelectorAll(".suggestion-item").forEach(item => {
        item.addEventListener("click", () => {
          const title = item.getAttribute("data-title");
          searchBar.value = title;
          suggestionsDiv.style.display = "none";
          
          // Filter by selected title
          const filtered = allTeachings.filter(t => 
            (t.title || t.category || t.name) === title
          );
          displayTeachings(filtered);
        });
      });
    } else {
      suggestionsDiv.style.display = "none";
    }

    // Display filtered results
    displayTeachings(filtered);
  });

  // Hide suggestions when clicking outside
  document.addEventListener("click", (e) => {
    if (!searchBar.contains(e.target) && !suggestionsDiv.contains(e.target)) {
      suggestionsDiv.style.display = "none";
    }
  });
}

// ===================================
// UTILITY FUNCTIONS
// ===================================

function getFileTypeLabel(mimeType) {
  if (!mimeType) return "FILE";
  const map = {
    "application/pdf": "PDF",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-powerpoint": "PPT",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "text/plain": "TXT",
    "text/csv": "CSV",
    "application/zip": "ZIP",
    "application/x-zip-compressed": "ZIP",
    "video/mp4": "MP4",
    "video/webm": "WEBM",
    "audio/mpeg": "MP3",
    "image/jpeg": "JPG",
    "image/png": "PNG",
  };
  return map[mimeType] || mimeType.split("/").pop().split(".").pop().toUpperCase().slice(0, 8) || "FILE";
}

function getFileIcon(mimeType) {
  if (!mimeType) return "fas fa-file";
  if (mimeType.startsWith("application/pdf")) return "fas fa-file-pdf";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.wordprocessingml.document") || mimeType.startsWith("application/msword")) return "fas fa-file-word";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") || mimeType.startsWith("application/vnd.ms-excel")) return "fas fa-file-excel";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.presentationml.presentation") || mimeType.startsWith("application/vnd.ms-powerpoint")) return "fas fa-file-powerpoint";
  if (mimeType.includes("video")) return "fas fa-file-video";
  if (mimeType.includes("audio")) return "fas fa-file-audio";
  if (mimeType.includes("image")) return "fas fa-file-image";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "fas fa-file-archive";
  return "fas fa-file";
}

function formatFileSize(bytes) {
  if (!bytes) return "";

  const sizes = ["Bytes", "KB", "MB", "GB"];
  if (bytes === 0) return "0 Bytes";

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ===================================
// TOAST NOTIFICATIONS & CUSTOM MODALS
// ===================================

// Custom Confirm Modal
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
  
  // Inject modal styles if not present
  if (!document.getElementById("customConfirmStyles")) {
    const style = document.createElement("style");
    style.id = "customConfirmStyles";
    style.innerHTML = `
      .custom-confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        animation: fadeIn 0.2s ease;
      }
      .custom-confirm-modal {
        background: #fff;
        border-radius: 16px;
        width: 90%;
        max-width: 420px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
      }
      .confirm-header {
        padding: 24px 24px 16px 24px;
        border-bottom: 1px solid #e2e8f0;
      }
      .confirm-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1e293b;
      }
      .confirm-body {
        padding: 20px 24px;
      }
      .confirm-body p {
        margin: 0;
        font-size: 0.95rem;
        color: #64748b;
        line-height: 1.6;
      }
      .confirm-footer {
        padding: 16px 24px;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        border-top: 1px solid #e2e8f0;
      }
      .confirm-btn {
        padding: 10px 24px;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .confirm-btn.cancel {
        background: #f1f5f9;
        color: #475569;
      }
      .confirm-btn.cancel:hover {
        background: #e2e8f0;
      }
      .confirm-btn.confirm {
        background: #dc2626;
        color: #fff;
      }
      .confirm-btn.confirm:hover {
        background: #b91c1c;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.insertAdjacentHTML("beforeend", modalHTML);
  
  const modal = document.getElementById("customConfirmModal");
  const okBtn = document.getElementById("confirmOkBtn");
  const cancelBtn = document.getElementById("confirmCancelBtn");
  
  const closeModal = () => modal.remove();
  
  okBtn.onclick = () => {
    closeModal();
    if (onConfirm) onConfirm();
  };
  
  cancelBtn.onclick = () => {
    closeModal();
    if (onCancel) onCancel();
  };
  
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
      if (onCancel) onCancel();
    }
  };
}

// Custom Alert Modal
function showCustomAlert(message, type = "info", onClose = null) {
  const icons = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle"
  };
  
  const colors = {
    success: "#10b981",
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6"
  };
  
  const modalHTML = `
    <div class="custom-alert-overlay" id="customAlertModal">
      <div class="custom-alert-modal">
        <div class="alert-icon" style="color: ${colors[type]}">
          <i class="fas ${icons[type]}"></i>
        </div>
        <div class="alert-body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="alert-footer">
          <button class="alert-btn" id="alertOkBtn">OK</button>
        </div>
      </div>
    </div>
  `;
  
  // Inject modal styles if not present
  if (!document.getElementById("customAlertStyles")) {
    const style = document.createElement("style");
    style.id = "customAlertStyles";
    style.innerHTML = `
      .custom-alert-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        animation: fadeIn 0.2s ease;
      }
      .custom-alert-modal {
        background: #fff;
        border-radius: 16px;
        width: 90%;
        max-width: 380px;
        padding: 32px 24px 24px 24px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
        text-align: center;
      }
      .alert-icon {
        font-size: 3.5rem;
        margin-bottom: 16px;
      }
      .alert-body p {
        margin: 0 0 24px 0;
        font-size: 0.95rem;
        color: #475569;
        line-height: 1.6;
      }
      .alert-btn {
        padding: 10px 32px;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        background: #3b82f6;
        color: #fff;
        transition: all 0.2s ease;
        min-width: 120px;
      }
      .alert-btn:hover {
        background: #2563eb;
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.insertAdjacentHTML("beforeend", modalHTML);
  
  const modal = document.getElementById("customAlertModal");
  const okBtn = document.getElementById("alertOkBtn");
  
  const closeModal = () => {
    modal.remove();
    if (onClose) onClose();
  };
  
  okBtn.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

function showToast(message, type = "info") {
  // Remove existing toast if any
  const existingToast = document.querySelector(".toast-notification");
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;

  const icon =
    type === "success"
      ? "fa-check-circle"
      : type === "error"
        ? "fa-exclamation-circle"
        : "fa-info-circle";

  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}
