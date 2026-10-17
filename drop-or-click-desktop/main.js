const { app, BrowserWindow, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// 앱이 불러올 사이트 주소
const APP_URL = 'https://drag-or-click.vercel.app';
const APP_ORIGIN = new URL(APP_URL).origin;

let win = null;

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

// 같은 이름이 있으면 "이름 (1).확장자"처럼 겹치지 않게
function uniquePath(dir, filename) {
  const { name, ext } = path.parse(filename);
  let candidate = path.join(dir, filename);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

// 다운로드: 저장 창 없이 "다운로드" 폴더로 바로 저장
function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    const savePath = uniquePath(
      app.getPath('downloads'),
      path.basename(item.getFilename())
    );
    item.setSavePath(savePath);

    item.on('updated', () => {
      const total = item.getTotalBytes();
      if (total > 0 && win) win.setProgressBar(item.getReceivedBytes() / total);
    });

    item.once('done', (_e, state) => {
      if (win) win.setProgressBar(-1);
      if (state === 'completed' && process.platform === 'darwin') {
        app.dock.downloadFinished(savePath); // 독의 다운로드 아이콘이 튀어
      }
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Drop Or Click',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on('closed', () => {
    win = null;
  });

  // 사이트가 "앱 안에서 열렸는지" 알아볼 수 있게 표시를 붙여둬
  win.webContents.setUserAgent(
    `${win.webContents.getUserAgent()} DropOrClickDesktop`
  );

  win.loadURL(APP_URL);

  // 인터넷이 안 되거나 사이트가 안 열리면 안내 화면
  win.webContents.on(
    'did-fail-load',
    (_e, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      win.loadFile(path.join(__dirname, 'offline.html'), {
        query: { url: APP_URL },
      });
    }
  );

  // 새 창: 사이트 안 주소면 그대로 열고, 바깥 주소면 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      win.loadURL(url);
    } else if (/^https?:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 사이트 밖으로 화면이 넘어가는 걸 막아 (바탕화면 파일을 잘못 놓았을 때 포함)
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
}

// 앱을 두 번 켜면 새로 안 띄우고 기존 창을 앞으로
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    setupDownloads();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}