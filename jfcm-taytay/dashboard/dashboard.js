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
      // Handle uploaded file here
    }
  });
}
