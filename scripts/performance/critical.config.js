module.exports = {
  src: 'https://fynony.ease-joy.fun',
  target: {
    css: 'app/styles/critical.css',
    uncritical: 'app/styles/non-critical.css',
  },
  dimensions: [
    { width: 375, height: 812 },   // iPhone X
    { width: 768, height: 1024 },  // iPad
    { width: 1920, height: 1080 }, // Desktop
  ],
  penthouse: {
    puppeteer: {
      args: ['--no-sandbox'],
    },
  },
};
