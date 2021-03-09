const path = require('path');
const url = require('url');
const fs = require('fs');
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');

const ftp = require("basic-ftp");

let mainWindow;
let connectWindow;
let promptWindow;

let connection = false;
let updater;

const client = new ftp.Client();

let fileContextMenu = new Menu.buildFromTemplate([{
    label: 'Create Directory',
    icon: './assets/img/file-list/dir.png',
    click() {
        if (connection) {
            promptWindow = new BrowserWindow({
                width: 700,
                height: 180,
                icon: __dirname + "/assets/img/icon.png",
                slashes: true,
                webPreferences: {
                    nativeWindowOpen: true,
                    nodeIntegrationInWorker: true,
                    nodeIntegration: true
                },
                parent: mainWindow,
                modal: true,
                maximizable: false,
                fullscreenable: false,
                resizable: false
            });

            promptWindow.setMenu(Menu.buildFromTemplate(secondaryMenuTemplate));

            promptWindow.loadURL(url.format({
                pathname: path.join(__dirname, 'prompt.html'),
                protocol: 'file:',
                slashes: true,
            }));

            promptWindow.on('closed', () => {
                promptWindow = null;
            });

            ipcMain.on('item', (e, dirname) => {
                if (promptWindow) {
                    promptWindow.close();
                    promptWindow = null;
                }
                mkdir(dirname);
            });
        }
    }
}]);

const secondaryMenuTemplate = [{
    label: 'File',
    submenu: [{
        label: 'Close',
        accelerator: 'CmdOrCtrl+Q',
        click(item, window, key) {
            disconnect();
            window.close();
        }
    }]
}];

const mainMenuTemplate = [{
    label: 'File',
    submenu: [{
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click() {
            disconnect();
            app.quit();
        }
    }]
}, {
    label: 'FTP',
    submenu: [{
        label: 'Connect',
        accelerator: 'CmdOrCtrl+Shift+C',
        click() {
            if (connection) {
                let result = dialog.showMessageBoxSync({
                    type: 'question',
                    buttons: ['Yes', 'No'],
                    defaultId: 1,
                    title: 'Connection is already opened',
                    message: 'Do you want to continue?',
                    detail: 'Current connection will be closed.',
                    noLink: true
                });

                if (result === 1) {
                    return;
                } else {
                    disconnect();
                }
            }

            connectWindow = new BrowserWindow({
                width: 700,
                height: 375,
                icon: __dirname + "/assets/img/icon.png",
                slashes: true,
                webPreferences: {
                    nativeWindowOpen: true,
                    nodeIntegrationInWorker: true,
                    nodeIntegration: true
                },
                parent: mainWindow,
                modal: true,
                maximizable: false,
                fullscreenable: false,
                resizable: false
            });

            connectWindow.setMenu(Menu.buildFromTemplate(secondaryMenuTemplate));

            connectWindow.loadURL(url.format({
                pathname: path.join(__dirname, 'connect.html'),
                protocol: 'file:',
                slashes: true,
            }));

            connectWindow.on('closed', () => {
                connectWindow = null;
            });

            ipcMain.on('ftp:connection-established', (e, host, port, user, password) => {
                if (connectWindow) {
                    connectWindow.close();
                    connectWindow = null;
                }
                connect(host, port, user, password);
            });
        }
    }, {
        label: 'Disconnect',
        accelerator: 'CmdOrCtrl+Shift+D',
        click() {
            disconnect();
        }
    }, {
        label: 'Refresh List',
        accelerator: 'CmdOrCtrl+Shift+R',
        click() {
            if (connection) updateList();
        }
    }]
}];

if (process.env.NODE_ENV !== 'production') {
    mainMenuTemplate.push({
        label: 'Developer Tools',
        submenu: [{
            label: 'Toggle DevTools',
            accelerator: 'CmdOrCtrl+I',
            click(item, focusedWindow) {
                focusedWindow.toggleDevTools();
            }
        }, {
            role: 'reload'
        }]
    });
}

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        icon: __dirname + "/assets/img/icon.png",
        slashes: true,
        webPreferences: {
            nativeWindowOpen: true,
            nodeIntegrationInWorker: true,
            nodeIntegration: true
        }
    });

    const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    Menu.setApplicationMenu(mainMenu);

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true,
    }));

    mainWindow.on('closed', () => {
        disconnect();
        win = null;
        app.quit();
    });

    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault();
        if (connection) fileContextMenu.popup();
    });
});

app.on('window-all-closed', () => {
    disconnect();
    app.quit();
});

//process.env.NODE_ENV = 'production';

ipcMain.on('ftp:cd', (e, dirname) => {
    if (!client.closed) cd(dirname);
});

ipcMain.on('ftp:updir', (e) => {
    if (!client.closed) cdup();
});

async function updateList() {
    mainWindow.webContents.send('ftp:pwd', await client.pwd());
    mainWindow.webContents.send('ftp:list', await client.list());
}

async function mkdir(dirname) {
    await client.ensureDir(dirname);
    updateList();
}

async function cd(dirname) {
    let curdir = await client.pwd();
    await client.cd(path.join(curdir, dirname));
    updateList();
}

async function cdup() {
    await client.cdup();
    updateList();
}

function clearList(listType = 'server') {
    mainWindow.webContents.send('list:clear', listType);
}

async function connect(host = 'localhost', port = 21, user = 'guest', password = 'guest') {
    client.close();
    clearList('server');
    //clearInterval(updater);
    //client.ftp.verbose = true;
    try {
        await client.access({
            host: host,
            user: user,
            password: password,
            port: port
        });
        //updater = setInterval(updateList, 1000);
        updateList();
        connection = true;
    } catch (err) {
        // console.log(err);
    }
}

async function disconnect() {
    if (connection) {
        client.close();
        clearList('server');
        //clearInterval(updater);
        connection = false;
    }
}