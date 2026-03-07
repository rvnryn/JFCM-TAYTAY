// Modules page specific functionality
document.addEventListener('DOMContentLoaded', () => {
  // Dropdown toggle functionality
  const modulesToggle = document.getElementById('modulesToggle');
  const modulesSubmenu = document.getElementById('modulesSubmenu');

  if (modulesToggle && modulesSubmenu) {
    modulesToggle.addEventListener('click', (e) => {
      e.preventDefault();
      modulesSubmenu.classList.toggle('active');
      modulesToggle.classList.toggle('active');
    });
  }
});
