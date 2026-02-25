const API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";
const _e = window.escapeHtml || (s => String(s ?? ''));

// Helper: Get initials from name
function getInitials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Fetch and display all users
async function fetchUsers() {
  try {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${API_BASE_URL}/users/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      showToast(err.detail || "Failed to load users", "error");
      return;
    }
    const users = await response.json();
    const cardsGrid = document.querySelector(".cards-grid");
    cardsGrid.innerHTML = "";

    if (users.length === 0) {
      cardsGrid.innerHTML = '<div class="empty-state">No users found.</div>';
      return;
    }

    users.forEach((user) => {
      const statusDisplay = user.is_active ? "(Active)" : "(Inactive)";
      const cardClass = user.is_active ? "" : "inactive";
      const initials = getInitials(user.full_name);
      const newCard = document.createElement("div");
      newCard.className = `user-card card ${cardClass}`;
      newCard.dataset.userId = user.id;
      newCard.dataset.userEmail = user.email;
      newCard.dataset.userRole = user.role || "User";
      newCard.innerHTML = `
        <div>
          <button class="menu-btn">⋮</button>
          <div class="menu-dropdown" style="display: none;">
            <button class="menu-item update-details-btn">Update Details</button>
            <button class="menu-item change-password-btn">Change Password</button>
            <button class="menu-item archive-item delete-user-btn">Delete User</button>
          </div>
        </div>
        <div class="user-avatar">${_e(initials)}</div>
        <div class="user-info-container">
          <h3 class="user-name">${_e(user.full_name)}</h3>
          <p class="user-username">@${_e(user.username)}</p>
          <p class="user-role">${_e(user.role || "User")} <span class="user-status">${_e(statusDisplay)}</span></p>
        </div>
      `;
      cardsGrid.appendChild(newCard);
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    showToast("Failed to load users", "error");
  }
}

// Change Password button using event delegation (global, not inside fetchUsers)
document.addEventListener("click", (e) => {
  if (e.target.closest(".change-password-btn")) {
    e.stopPropagation();
    const card = e.target.closest(".user-card");
    if (card) {
      openChangePasswordModal(card);
    }
  }
});

// Change Password Modal Functions (global, not inside fetchUsers)
const changePasswordModal = document.getElementById("changePasswordModal");
const changePasswordModalClose = document.getElementById(
  "changePasswordModalClose",
);
const changePasswordCancelBtn = document.getElementById(
  "changePasswordCancelBtn",
);
const changePasswordForm = document.getElementById("changePasswordForm");

function openChangePasswordModal(card) {
  if (!changePasswordModal) return;
  changePasswordModal.classList.add("show");
  changePasswordModal.currentCard = card;
  // Set user info in modal
  const userInfoDiv = document.getElementById("changePasswordUserInfo");
  if (userInfoDiv) {
    const name = card.querySelector(".user-name")?.textContent || "";
    const username = card.querySelector(".user-username")?.textContent || "";
    userInfoDiv.textContent = `${name} | ${username}`.trim();
  }
  const npw = document.getElementById("newPassword");
  if (npw) npw.value = "";
  const cnpw = document.getElementById("confirmNewPassword");
  if (cnpw) cnpw.value = "";
}

function closeChangePasswordModal() {
  changePasswordModal.classList.remove("show");
}

if (changePasswordModalClose)
  changePasswordModalClose.addEventListener("click", closeChangePasswordModal);
if (changePasswordCancelBtn)
  changePasswordCancelBtn.addEventListener("click", closeChangePasswordModal);

if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("newPassword").value;
    const confirmNewPassword =
      document.getElementById("confirmNewPassword").value;
    if (!newPassword || !confirmNewPassword) {
      showToast("Both password fields are required.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }
    const card = changePasswordModal.currentCard;
    const userId = card.dataset.userId;
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(
        `${API_BASE_URL}/users/${userId}/change-password`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ new_password: newPassword }),
        },
      );
      if (response.ok) {
        closeChangePasswordModal();
        showToast("Password changed successfully!", "success");
        // EmailJS notification (password change)
        const name = card.querySelector(".user-name")?.textContent || "";
        const username =
          card.querySelector(".user-username")?.textContent || "";
        const email = card.dataset.userEmail;
        emailjs
          .send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, {
            to_email: email,
            to_name: name,
            username: username,
            action:
              "Your account password has been changed by an administrator.",
          })
          .then(
            function () {
              console.log("EmailJS: Password change notification sent");
            },
            function (error) {
              console.error("EmailJS error:", error);
            },
          );
      } else {
        const error = await response.json();
        showToast(error.detail || "Failed to change password", "error");
      }
    } catch (error) {
      console.error("Error changing password:", error);
      showToast("Failed to change password", "error");
    }
  });
}

// Show skeleton user cards while fetching
function showUserSkeletons(count = 6) {
  const cardsGrid = document.querySelector(".cards-grid");
  if (!cardsGrid) return;
  if (!document.getElementById("userSkeletonStyles")) {
    const style = document.createElement("style");
    style.id = "userSkeletonStyles";
    style.textContent = `
      @keyframes userShimmer {
        0%   { background-position: -400px 0; }
        100% { background-position:  400px 0; }
      }
      .skeleton-user-card {
        background: #4A5E42;
        border-radius: 16px;
        padding: 12px 16px;
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 260px;
        flex: 1 1 260px;
        max-width: 340px;
        box-shadow: 0 2px 8px 0 rgba(74,94,66,0.1);
      }
      .skeleton-avatar-circle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        flex-shrink: 0;
        background: linear-gradient(90deg, rgba(255,255,255,0.12) 25%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.12) 75%);
        background-size: 400px 100%;
        animation: userShimmer 1.4s infinite linear;
      }
      .skeleton-user-lines {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }
      .skeleton-user-line {
        border-radius: 5px;
        background: linear-gradient(90deg, rgba(255,255,255,0.12) 25%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.12) 75%);
        background-size: 400px 100%;
        animation: userShimmer 1.4s infinite linear;
      }
      .sul-name   { height: 14px; width: 70%; }
      .sul-user   { height: 11px; width: 50%; }
      .sul-role   { height: 11px; width: 40%; }
    `;
    document.head.appendChild(style);
  }
  cardsGrid.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-user-card">
      <div class="skeleton-avatar-circle"></div>
      <div class="skeleton-user-lines">
        <div class="skeleton-user-line sul-name"></div>
        <div class="skeleton-user-line sul-user"></div>
        <div class="skeleton-user-line sul-role"></div>
      </div>
    </div>
  `).join("");
}

// Load users on page load
showUserSkeletons(6);
fetchUsers();

// User Management page specific JavaScript
const addUserBtn = document.querySelector(".add-user-btn");
const updateModal = document.getElementById("updateModal");
const deleteModal = document.getElementById("deleteModal");
const addUserModal = document.getElementById("addUserModal");
const updateModalClose = document.getElementById("updateModalClose");
const deleteModalClose = document.getElementById("deleteModalClose");
const addUserModalClose = document.getElementById("addUserModalClose");
const updateCancelBtn = document.getElementById("updateCancelBtn");
const deleteCancelBtn = document.getElementById("deleteCancelBtn");
const addUserCancelBtn = document.getElementById("addUserCancelBtn");
const updateForm = document.getElementById("updateForm");
const addUserForm = document.getElementById("addUserForm");
const deleteConfirmBtn = document.getElementById("deleteConfirmBtn");

// Menu button toggle using event delegation
document.addEventListener("click", (e) => {
  const menuBtn = e.target.closest(".menu-btn");
  if (menuBtn) {
    const dropdown = menuBtn.nextElementSibling;
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
    e.stopPropagation();
  }
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-btn") && !e.target.closest(".menu-dropdown")) {
    document.querySelectorAll(".menu-dropdown").forEach((menu) => {
      menu.style.display = "none";
    });
  }
});

// Update Details button using event delegation
document.addEventListener("click", (e) => {
  if (e.target.closest(".update-details-btn")) {
    e.stopPropagation();
    const card = e.target.closest(".user-card");
    if (card) {
      openUpdateModal(card);
    }
  }
});

// Delete User button using event delegation - Show confirmation with details
document.addEventListener("click", (e) => {
  if (e.target.closest(".delete-user-btn")) {
    e.stopPropagation();
    const card = e.target.closest(".user-card");
    const dropdown = e.target.closest(".menu-dropdown");
    if (dropdown) {
      dropdown.style.display = "none";
    }
    if (card) {
      const fullName = card.querySelector(".user-name").textContent;
      const username = card
        .querySelector(".user-username")
        .textContent.replace("@", "");
      const email = card.dataset.userEmail;
      const role = card.dataset.userRole;

      // Show confirmation modal with details
      document.getElementById("confirmDeleteFullName").textContent = fullName;
      document.getElementById("confirmDeleteUsername").textContent = username;
      document.getElementById("confirmDeleteEmail").textContent = email;
      document.getElementById("confirmDeleteRole").textContent = role;

      deleteModal.currentCard = card;
      document.getElementById("deleteConfirmModal").classList.add("show");
    }
  }
});

// Update Details Modal Functions
function openUpdateModal(card) {
  updateModal.classList.add("show");
  const fullName = card.querySelector(".user-name").textContent;
  const username = card
    .querySelector(".user-username")
    .textContent.replace("@", "");
  const email = card.dataset.userEmail;
  // Use dataset.userRole and trim/normalize for select value
  let role = card.dataset.userRole || "";
  role = role.trim();
  let roleValue = "";
  if (role.toLowerCase() === "admin") roleValue = "admin";
  else if (role.toLowerCase() === "user") roleValue = "user";
  document.getElementById("fullName").value = fullName;
  document.getElementById("username").value = username;
  document.getElementById("email").value = email;
  document.getElementById("updateRole").value = roleValue;
  const isActive = !card.classList.contains("inactive");
  document.getElementById("status").checked = isActive;
  document.getElementById("statusText").textContent = isActive
    ? "Active"
    : "Inactive";
  updateModal.currentCard = card;
}

function closeUpdateModal() {
  updateModal.classList.remove("show");
}

// Delete User Modal Functions
function openDeleteModal() {
  deleteModal.classList.add("show");
}

function closeDeleteModal() {
  deleteModal.classList.remove("show");
}

// Add User Modal Functions
function openAddUserModal() {
  addUserModal.classList.add("show");
  const addFullName = document.getElementById("addFullName");
  const addUsername = document.getElementById("addUsername");
  const addEmail = document.getElementById("addEmail");
  const addPassword = document.getElementById("addPassword");
  const addConfirmPassword = document.getElementById("addConfirmPassword");
  const role = document.getElementById("role");
  const addStatus = document.getElementById("addStatus");
  const addStatusText = document.getElementById("addStatusText");

  if (addFullName) addFullName.value = "";
  if (addUsername) addUsername.value = "";
  if (addEmail) addEmail.value = "";
  if (addPassword) addPassword.value = "";
  if (addConfirmPassword) addConfirmPassword.value = "";
  if (addStatus) addStatus.checked = true;
  if (addStatusText) addStatusText.textContent = "Active";
    const addRole = document.getElementById("addRole");
    if (addRole) addRole.value = "user";
}

function closeAddUserModal() {
  addUserModal.classList.remove("show");
}

// Event listeners for Update Modal
updateModalClose.addEventListener("click", closeUpdateModal);
updateCancelBtn.addEventListener("click", closeUpdateModal);

// Status toggle listener
const statusCheckbox = document.getElementById("status");
const statusText = document.getElementById("statusText");

statusCheckbox.addEventListener("change", () => {
  statusText.textContent = statusCheckbox.checked ? "Active" : "Inactive";
});

// Event listener for Update Form Submit - Show confirmation
if (updateForm) {
  updateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    // ...existing code for summary logic...
    const fullName = document.getElementById("fullName").value;
    const username = document.getElementById("username").value;
    const newIsActive = document.getElementById("status").checked;
    const role = document.getElementById("updateRole").value;
    const email = document.getElementById("email").value;

    // ...existing code for summary logic...

    // Get original values from the card
    const card = updateModal.currentCard;
    const originalFullName = card.querySelector(".user-name").textContent;
    const originalUsername = card
      .querySelector(".user-username")
      .textContent.replace("@", "");
    const originalEmail = card.dataset.userEmail;
    const originalRole = card.dataset.userRole;
    const originalIsActive = !card.classList.contains("inactive");

    // Show confirmation modal with details and highlight changes
    const confirmFullNameItem = document.getElementById(
      "confirmUpdateFullName",
    ).parentElement;
    const confirmUsernameItem = document.getElementById(
      "confirmUpdateUsername",
    ).parentElement;
    const confirmEmailItem =
      document.getElementById("confirmUpdateEmail").parentElement;
    const confirmRoleItem =
      document.getElementById("confirmUpdateRole").parentElement;
    const confirmStatusItem = document.getElementById(
      "confirmUpdateStatus",
    ).parentElement;
    // Remove all 'changed' classes first
    document
      .querySelectorAll("#updateConfirmModal .confirm-item")
      .forEach((item) => item.classList.remove("changed"));

    // Set values and mark changed items with from/to format
    if (fullName !== originalFullName) {
      document.getElementById("confirmUpdateFullName").innerHTML =
        `<span class="from-value">${_e(originalFullName)}</span> → <span class="to-value">${_e(fullName)}</span>`;
      confirmFullNameItem.classList.add("changed");
    } else {
      document.getElementById("confirmUpdateFullName").textContent = fullName;
    }

    if (username !== originalUsername) {
      document.getElementById("confirmUpdateUsername").innerHTML =
        `<span class="from-value">${_e(originalUsername)}</span> → <span class="to-value">${_e(username)}</span>`;
      confirmUsernameItem.classList.add("changed");
    } else {
      document.getElementById("confirmUpdateUsername").textContent = username;
    }

    if (email !== originalEmail) {
      document.getElementById("confirmUpdateEmail").innerHTML =
        `<span class="from-value">${_e(originalEmail)}</span> → <span class="to-value">${_e(email)}</span>`;
      confirmEmailItem.classList.add("changed");
    } else {
      document.getElementById("confirmUpdateEmail").textContent = email;
    }

    // Case-insensitive role comparison, only mark as changed if actually changed
    if (
      role &&
      originalRole &&
      role.toLowerCase() !== originalRole.toLowerCase()
    ) {
      document.getElementById("confirmUpdateRole").innerHTML =
        `<span class="from-value">${_e(originalRole)}</span> → <span class="to-value">${_e(role)}</span>`;
      confirmRoleItem.classList.add("changed");
    } else {
      document.getElementById("confirmUpdateRole").textContent = role;
    }

    const newStatusText = newIsActive ? "Active" : "Inactive";
    const originalStatusText = originalIsActive ? "Active" : "Inactive";
    if (newIsActive !== originalIsActive) {
      document.getElementById("confirmUpdateStatus").innerHTML =
        `<span class="from-value">${_e(originalStatusText)}</span> → <span class="to-value">${_e(newStatusText)}</span>`;
      confirmStatusItem.classList.add("changed");
    } else {
      document.getElementById("confirmUpdateStatus").textContent =
        newStatusText;
    }

    closeUpdateModal();
    document.getElementById("updateConfirmModal").classList.add("show");
  });
}

// Confirm update button
document
  .getElementById("updateConfirmBtn")
  .addEventListener("click", async () => {
    const fullName = document.getElementById("fullName").value;
    const username = document.getElementById("username").value;
    const newIsActive = document.getElementById("status").checked;
    const role = document.getElementById("updateRole").value;
    const email = document.getElementById("email").value;
    const card = updateModal.currentCard;
    const userId = card.dataset.userId;
    const oldIsActive = !card.classList.contains("inactive");

    try {
      const token = localStorage.getItem("access_token");
      // Update user details first
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ full_name: fullName, username, email, role }),
      });

      if (response.ok) {
        if (oldIsActive !== newIsActive) {
          const statusEndpoint = newIsActive ? "restore" : "archive";
          const statusResponse = await fetch(
            `${API_BASE_URL}/users/${userId}/${statusEndpoint}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          if (!statusResponse.ok) {
            const error = await statusResponse.json();
            showToast(
              error.detail || `Failed to ${statusEndpoint} user`,
              "error",
            );
            document
              .getElementById("updateConfirmModal")
              .classList.remove("show");
            return;
          }
        }
        document.getElementById("updateConfirmModal").classList.remove("show");
        await fetchUsers();
        showToast("User updated successfully!", "success");
        // Only send notification if email was changed
        if (email !== card.dataset.userEmail) {
          emailjs
            .send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, {
              to_email: email,
              to_name: fullName,
              username: username,
              role: role,
              status: newIsActive ? "Active" : "Inactive",
              action: "Your email was changed by an admin.",
              details:
                "If this was not you, please contact support immediately.",
            })
            .then(
              function () {
                console.log("EmailJS: Email change notification sent");
              },
              function (error) {
                console.error("EmailJS error:", error);
              },
            );
        }
        if (typeof fetchCurrentUserForSidebar === "function") {
          fetchCurrentUserForSidebar();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        document.getElementById("updateConfirmModal").classList.remove("show");
        showToast(errorData.detail || "Failed to update user", "error");
        if (typeof fetchCurrentUserForSidebar === "function") {
          fetchCurrentUserForSidebar();
        }
      }
    } catch (error) {
      console.error("Error updating user:", error);
      document.getElementById("updateConfirmModal").classList.remove("show");
      showToast("Failed to update user", "error");
    }
  });

// Update confirmation modal close buttons
document
  .getElementById("updateConfirmModalClose")
  .addEventListener("click", () => {
    document.getElementById("updateConfirmModal").classList.remove("show");
  });
document
  .getElementById("updateConfirmCancelBtn")
  .addEventListener("click", () => {
    document.getElementById("updateConfirmModal").classList.remove("show");
  });

// Event listeners for Delete Modal
deleteModalClose.addEventListener("click", closeDeleteModal);
deleteCancelBtn.addEventListener("click", closeDeleteModal);

// Event listeners for Add User Modal
addUserBtn.addEventListener("click", openAddUserModal);
addUserModalClose.addEventListener("click", closeAddUserModal);
addUserCancelBtn.addEventListener("click", closeAddUserModal);

// Event listener for Add User Form Submit - Show confirmation
addUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fullName = document.getElementById("addFullName").value;
  const username = document.getElementById("addUsername").value;
  const email = document.getElementById("addEmail").value;
  const password = document.getElementById("addPassword").value;
  const reenterPassword = document.getElementById("addConfirmPassword").value;
  const role = document.getElementById("addRole").value;
  const isActive = document.getElementById("addStatus").checked;

  // Password validation before confirmation
  if (password !== reenterPassword) {
    showToast("Passwords do not match.", "error");
    return;
  }
  if (password.length < 8) {
    showToast("Password must be at least 8 characters.", "error");
    return;
  }

  // Show confirmation modal with details
  document.getElementById("confirmAddFullName").textContent = fullName;
  document.getElementById("confirmAddUsername").textContent = username;
  document.getElementById("confirmAddEmail").textContent = email;
  document.getElementById("confirmAddRole").textContent = role;
  document.getElementById("confirmAddStatus").textContent = isActive
    ? "Active"
    : "Inactive";

  closeAddUserModal();
  document.getElementById("addConfirmModal").classList.add("show");
});

// Confirm add button
document.getElementById("addConfirmBtn").addEventListener("click", async () => {
  const fullName = document.getElementById("addFullName").value;
  const username = document.getElementById("addUsername").value;
  const email = document.getElementById("addEmail").value;
  const password = document.getElementById("addPassword").value;
  const reenterPassword = document.getElementById("addConfirmPassword").value;
  const role = document.getElementById("addRole").value;
  const isActive = document.getElementById("addStatus").checked;

  // Password match validation (redundant, but for safety)
  if (password !== reenterPassword) {
    showToast("Passwords do not match.", "error");
    return;
  }
  if (password.length < 8) {
    showToast("Password must be at least 8 characters.", "error");
    return;
  }

  try {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${API_BASE_URL}/users/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        full_name: fullName,
        username,
        email,
        password,
        role,
        is_active: isActive,
      }),
    });

    if (response.ok) {
      document.getElementById("addConfirmModal").classList.remove("show");
      await fetchUsers();
      showToast("User added successfully!", "success");
      // EmailJS notification (admin notification)
      emailjs
        .send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, {
          to_email: email,
          to_name: fullName,
          username: username,
          role: role,
          status: isActive ? "Active" : "Inactive",
          action: "Your account has been created by the system administrator.",
          details:
            "You can now log in using your assigned username.",
        })
        .then(
          function () {
            console.log("EmailJS: User creation notification sent");
          },
          function (error) {
            console.error("EmailJS error:", error);
          },
        );
    } else {
      const error = await response.json();
      document.getElementById("addConfirmModal").classList.remove("show");
      showToast(error.detail || "Failed to add user", "error");
    }
  } catch (error) {
    console.error("Error adding user:", error);
    document.getElementById("addConfirmModal").classList.remove("show");
    showToast(error.message || "Failed to add user", "error");
  }
});

// Add confirmation modal close buttons
document
  .getElementById("addConfirmModalClose")
  .addEventListener("click", () => {
    document.getElementById("addConfirmModal").classList.remove("show");
  });
document.getElementById("addConfirmCancelBtn").addEventListener("click", () => {
  document.getElementById("addConfirmModal").classList.remove("show");
});

// Event listener for Delete Confirm (new confirmation modal)
document
  .getElementById("deleteConfirmBtn2")
  .addEventListener("click", async () => {
    const card = deleteModal.currentCard;
    const userId = card.dataset.userId;

    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok || response.status === 204) {
        document.getElementById("deleteConfirmModal").classList.remove("show");
        await fetchUsers();
        showToast("User removed successfully!", "success");
      } else {
        const error = await response.json();
        document.getElementById("deleteConfirmModal").classList.remove("show");
        showToast(error.detail || "Failed to remove user", "error");
      }
    } catch (error) {
      console.error("Error removing user:", error);
      document.getElementById("deleteConfirmModal").classList.remove("show");
      showToast("Failed to remove user", "error");
    }
  });

// Delete confirmation modal close buttons
document
  .getElementById("deleteConfirmModalClose")
  .addEventListener("click", () => {
    document.getElementById("deleteConfirmModal").classList.remove("show");
  });
document
  .getElementById("deleteConfirmCancelBtn2")
  .addEventListener("click", () => {
    document.getElementById("deleteConfirmModal").classList.remove("show");
  });

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMessage = toast.querySelector(".toast-message");

  // Remove previous type classes
  toast.classList.remove("success", "error", "info", "warning");

  // Set message and type
  toastMessage.textContent = message;
  toast.classList.add(type);

  // Show toast
  toast.classList.add("show");

  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Status toggle listeners
const addStatusCheckbox = document.getElementById("addStatus");
const addStatusText = document.getElementById("addStatusText");

if (addStatusCheckbox && addStatusText) {
  addStatusCheckbox.addEventListener("change", () => {
    addStatusText.textContent = addStatusCheckbox.checked
      ? "Active"
      : "Inactive";
  });
}

// Close modal when clicking outside of it
document.addEventListener("click", (e) => {
  if (e.target === updateModal) {
    closeUpdateModal();
  }
  if (e.target === deleteModal) {
    closeDeleteModal();
  }
  if (e.target === addUserModal) {
    closeAddUserModal();
  }
  if (e.target.id === "addConfirmModal") {
    document.getElementById("addConfirmModal").classList.remove("show");
  }
  if (e.target.id === "updateConfirmModal") {
    document.getElementById("updateConfirmModal").classList.remove("show");
  }
  if (e.target.id === "deleteConfirmModal") {
    document.getElementById("deleteConfirmModal").classList.remove("show");
  }
});
