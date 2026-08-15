/* Local development server for the API (Vercel runs api/index.js as a serverless function). */
const app = require('./api/index.js');
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API dev server → http://localhost:${port}/api/health`);
});
