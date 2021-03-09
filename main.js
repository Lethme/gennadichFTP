const path = require('path');
const url = require('url');
const fs = require('fs');
const request = require('request');
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');

const ftp = require("basic-ftp");

let mainWindow;
let connectWindow;

let connection = false;

const client = new ftp.Client();

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
            if (connection) return;
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
});

app.on('window-all-closed', () => {
    disconnect();
    app.quit();
});

//process.env.NODE_ENV = 'production';

ipcMain.on('ftp:cd', (e, dirname) => {
    cd(dirname);
});

ipcMain.on('ftp:updir', (e) => {
    cdup();
});

async function updateList() {
    mainWindow.webContents.send('ftp:pwd', await client.pwd());
    mainWindow.webContents.send('ftp:list', await client.list());
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

async function connect(host = 'localhost', port = 21, user = 'guest', password = 'guest') {
    client.ftp.verbose = true;
    try {
        await client.access({
            host: host,
            user: user,
            password: password,
            port: port
        });
        updateList();
        connection = true;
    } catch (err) {
        console.log(err);
    }
}

function disconnect() {
    if (connection) {
        client.close();
        connection = false;
    }
}