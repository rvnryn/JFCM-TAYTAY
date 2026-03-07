const dropdowns = document.querySelectorAll('.has-dropdown');

dropdowns.forEach(currentDropdown => {
  const toggle = currentDropdown.querySelector('.dropdown-toggle');
  const menu = currentDropdown.querySelector('.dropdown-menu');

  toggle.addEventListener('click', () => {
    dropdowns.forEach(dropdown => {
      if (dropdown !== currentDropdown) {
        dropdown.querySelector('.dropdown-menu').style.display = 'none';
      }
    });

    menu.style.display =  
      menu.style.display === 'block' ? 'none' : 'block';
  });
});

// Mobile hamburger menu
const navHamburger = document.getElementById('nav-hamburger');
const navMenu = document.getElementById('nav-menu');

if (navHamburger && navMenu) {
  navHamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    navHamburger.classList.toggle('active');
    navMenu.classList.toggle('open');
  });

  // Close menu when a nav link is clicked
  navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navHamburger.classList.remove('active');
      navMenu.classList.remove('open');
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navMenu.contains(e.target) && !navHamburger.contains(e.target)) {
      navHamburger.classList.remove('active');
      navMenu.classList.remove('open');
    }
  });
}


const slides = [
    {
      image: "images/slide1.jpg",
      text: "We win people to the Lord Jesus Christ through the ministry of evangelism and church planting."
    },
    {
      image: "images/slide2.jpg",
      text: "We train people to do the work of the ministry through discipleship, ministry and mission training."
    },
    {
      image: "images/slide3.jpg",
      text: "We send people to do ministry and mission according to their God-given abilities."
    }
  ];

  let currentSlide = 0;

  function showSlide(index) {
    document.getElementById("slide-image").src = slides[index].image;
    document.getElementById("slide-text").textContent = slides[index].text;
  }

  function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
  }

  function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    showSlide(currentSlide);
  }

// Scroll to Top
const scrollToTopBtn = document.getElementById('scroll-to-top');

window.addEventListener('scroll', () => {
  if (window.scrollY > 300) {
    scrollToTopBtn.classList.add('visible');
  } else {
    scrollToTopBtn.classList.remove('visible');
  }
});

scrollToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});