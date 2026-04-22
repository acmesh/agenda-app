# Agenda App

A personal task management app with Google Calendar integration.

## Features

- Create and manage tasks across 10 categories (Calls, Mails, Answers, Articles, Posts, Documents, Projects, Applications, Home Stuff, Todo)
- Track task status: In Progress, Urgent, Done
- Search and filter tasks
- Add events/reminders directly to Google Calendar

## Requirements

- Node.js 18+
- A Google Cloud project with the Calendar API enabled (only needed for calendar features)

## Installation

```bash
# Clone the repo and install dependencies
git clone <repo-url>
cd agenda-app
npm install
```

## Configuration

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
PORT=3000   # optional, defaults to 3000
```

### Getting Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Calendar API** under *APIs & Services → Library*
4. Go to *APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID*
5. Set application type to **Web application**
6. Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI
7. Copy the **Client ID** and **Client Secret** into your `.env` file

> Google Calendar integration is optional. The app works fully for task management without it.

## Running

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Data

Tasks are stored locally in `tasks.json`. Google OAuth tokens are saved to `.tokens.json` (gitignored).

## `agenda` helper script

A convenience script at `~/bin/agenda` manages the server as a background process.

### Setup

Make sure `~/bin` is in your `PATH` (add this to `~/.bashrc` or `~/.zshrc` if needed):

```bash
export PATH="$HOME/bin:$PATH"
```

Make the script executable:

```bash
chmod +x ~/bin/agenda
```

The script hardcodes the app directory to `/home/acme/Cubbit/Claude/APP/agenda-app` and the port to `3000`. If you move the project or change the port, update `APP_DIR` and `PORT` at the top of `~/bin/agenda`.

### Usage

```bash
agenda           # start the server (default)
agenda start     # start the server
agenda stop      # stop the server
agenda restart   # stop then start
agenda status    # show whether the server is running
agenda log       # tail the live log
```

The server runs in the background. Output is written to `.agenda.log` inside the project directory. A `.agenda.pid` file tracks the process ID (both are gitignored).
