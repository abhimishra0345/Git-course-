# ABHISHEK'S GIT HUB REPO.
<br>
Author - Abhishek

## Deploy

This project is a static site. You can deploy it directly from the repository with either Netlify or Vercel.

### Netlify

- Import the GitHub repository in Netlify.
- Build command: leave empty
- Publish directory: `.`
- Suggested site URL: `https://<your-site-name>.netlify.app`

### Vercel

- Import the GitHub repository in Vercel.
- Framework preset: `Other`
- Build command: leave empty
- Output directory: `.`
- Suggested site URL: `https://<your-project-name>.vercel.app`

### GitHub Pages

- Push the latest code to the `main` branch.
- In GitHub, open `Settings > Pages`.
- Set source to `Deploy from a branch`.
- Choose `main` and `/root`.
- URL pattern: `https://abhimishra0345.github.io/Git-course-/`

## Firebase Auth Setup

Cross-device login now uses Firebase Authentication instead of browser-only storage.

1. Create a Firebase project in the Firebase console.
2. Add a Web app to that project.
3. In `Authentication > Sign-in method`, enable `Email/Password`.
4. Copy your Firebase web config into [firebase-config.js](/Users/abhishekmishra/Desktop/GH/Git-course-/assets/js/firebase-config.js).
5. In `Authentication > Settings > Authorized domains`, add your deployed domains:
   - `abhimishra0345.github.io`
   - `git-course-food-demo.netlify.app`
   - `git-course-food-demo.vercel.app`

Until those keys are added, the UI will show that Firebase auth is not configured yet.
