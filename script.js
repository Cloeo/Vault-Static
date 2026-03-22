const intro = document.getElementById('intro');
const bar = document.getElementById('bar');
const scrollHint = document.getElementById('scroll-hint');
const main = document.getElementById('main');

let introGone = false;
let hintReady = false;

document.body.style.overflow = 'hidden';

window.addEventListener('load', () => {
  setTimeout(() => {
    bar.style.width = '100%';
  }, 600);

  setTimeout(() => {
    scrollHint.classList.add('show');
    hintReady = true;
  }, 3200);
});

function dismissIntro() {
  if (introGone || !hintReady) return;
  introGone = true;

  intro.classList.add('gone');
  main.classList.remove('hidden');

  setTimeout(() => {
    main.classList.add('visible');
    intro.style.display = 'none';
    document.body.style.overflow = '';
    document.body.classList.add('ready');
  }, 850);
}

window.addEventListener('wheel', (e) => {
  if (!hintReady) return;
  if (e.deltaY > 0) dismissIntro();
}, { passive: true });

window.addEventListener('touchend', () => {
  if (hintReady) dismissIntro();
}, { passive: true });

const faqItems = document.querySelectorAll('.faq-item');
const cta = document.getElementById('cta');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('in');
      }, i * 90);
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
