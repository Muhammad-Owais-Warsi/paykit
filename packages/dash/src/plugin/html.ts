// During development, proxy to the Vite dev server.
// In production, this will be replaced with the built SPA bundle inline.

const DEV_PORT = 5173;

export function getDashboardHTML(basePath: string): string {
  const devMode = process.env.NODE_ENV !== "production";

  if (devMode) {
    // Proxy to Vite dev server — enables HMR during development
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PayKit Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script>window.__PAYKIT_BASE_PATH__ = "${basePath}";</script>
  <script type="module">
    import RefreshRuntime from "http://localhost:${String(DEV_PORT)}/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <script type="module" src="http://localhost:${String(DEV_PORT)}/@vite/client"></script>
  <script type="module" src="http://localhost:${String(DEV_PORT)}/src/main.tsx"></script>
</body>
</html>`;
  }

  // TODO: In production, inline the built JS/CSS bundle here
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PayKit Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script>window.__PAYKIT_BASE_PATH__ = "${basePath}";</script>
  <p>Dashboard not built. Run: bun --filter @paykitjs/dash build</p>
</body>
</html>`;
}

export function getUnauthorizedHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PayKit Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    h1 { font-size: 1.5rem; font-weight: 500; color: #666; }
  </style>
</head>
<body>
  <h1>Unauthorized</h1>
</body>
</html>`;
}
