function showModal(message) {
  const modal = document.getElementById("login-modal");
  const modalMsg = document.getElementById("modal-message");
  const modalIcon = document.getElementById("modal-icon");
  const closeBtn = document.getElementById("modal-close");

  modalMsg.textContent = message || "";
  modalIcon.innerHTML = "<span>✅</span>";
  modalMsg.style.color = "#2e7d32";

  modal.style.display = "flex";

  closeBtn.onclick = function () {
    modal.style.display = "none";
  };
  window.onclick = function (event) {
    if (event.target === modal) modal.style.display = "none";
  };
}

// Only call showModal on successful login!
document
  .getElementById("login-btn")
  .addEventListener("click", async function (e) {
    e.preventDefault();

    const identifier = document.getElementById("identifier").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("login-error");
    errorDiv.textContent = "";

    const response = await fetch("http://localhost:8000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("user_email", data.email);
      showModal("Logged in successfully!");
      setTimeout(() => {
        window.location.href = "../dashboard/dashboard.html";
      }, 1200);
    } else {
      const error = await response.json();
      errorDiv.textContent = error.detail || "Login failed";
      errorDiv.style.display = "flex";
      setTimeout(() => {
        errorDiv.style.display = "none";
        errorDiv.textContent = "";
      }, 3000);
    }
  });
