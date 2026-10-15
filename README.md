# asset-machine

## Local server

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

For development with automatic restart:

```sh
npm run dev
```

The server listens only on `127.0.0.1` (port `3000` by default).
Set the `PORT` environment variable to use a different port.

`GET http://127.0.0.1:3000/api/health` returns:

```json
{"status":"ok"}
```

There is no UI or asset-generation functionality yet.

**Copyright (c) 2026 Jason Posch (Technikhighknee). All rights reserved.**

This repository is public, but the project is **not open source**. No permission
to reuse, modify, or redistribute its contents is granted, except as permitted
by applicable law or GitHub's Terms of Service.

See [LICENSE](LICENSE) for details.

For inquiries or licensing requests, contact [poschjason@gmail.com](mailto:poschjason@gmail.com).
