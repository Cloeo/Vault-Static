const intro = document.getElementById('intro');
const bar = document.getElementById('bar');
const scrollHint = document.getElementById('scroll-hint');
const main = document.getElementById('main');

let introGone = false;

window.addEventListener('load', () => {
  setTimeout(() => {
    bar.style.width = '100%';
  }, 1000);

  setTimeout(() => {
    scrollHint.classList.add('show');
  }, 3600);
});

function dismissIntro() {
  if (introGone) return;
  introGone = true;

  intro.classList.add('gone');
  main.classList.remove('hidden');
  document.body.classList.add('ready');

  setTimeout(() => {
    main.classList.add('visible');
    intro.style.display = 'none';
  }, 850);
}

window.addEventListener('wheel', (e) => {
  if (!scrollHint.classList.contains('show')) return;
  if (e.deltaY > 0) dismissIntro();
}, { passive: true });

window.addEventListener('touchstart', () => {
  if (scrollHint.classList.contains('show')) dismissIntro();
}, { passive: true });

const faqItems = document.querySelectorAll('.faq-item');
const cta = document.getElementById('cta');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('in');
      }, i * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

faqItems.forEach(item => observer.observe(item));

const ctaObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      cta.classList.add('in');
      ctaObserver.unobserve(cta);
    }
  });
}, { threshold: 0.3 });

ctaObserver.observe(cta);
