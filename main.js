const path = require('path');
const url = require('url');
const fs = require('fs');
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');

const ftp = require("basic-ftp");

let mainWindow;
let connectWindow;
let promptWindow;
let propertyWindow;

let connection = false;
let hostname = '';
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
                promptWindow = undefined;
            });

            ipcMain.on('item', (e, dirname) => {
                if (promptWindow) {
                    promptWindow.close();
                    promptWindow = undefined;
                }
                mkdir(dirname);
            });
        }
    }
}, {
    label: 'Refresh',
    icon: './assets/img/file-list/refresh.png',
    click() {
        if (connection) updateList();
    }
}, {
    label: 'Properties',
    icon: './assets/img/file-list/property.png',
    click() {
        mainWindow.webContents.send('ftp:selected');
        ipcMain.on('ftp:selected', (e, type, name) => {
            if (connection && type === 'dir' && propertyWindow === undefined) {
                propertyWindow = new BrowserWindow({
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

                propertyWindow.setMenu(Menu.buildFromTemplate(secondaryMenuTemplate));

                propertyWindow.loadURL(url.format({
                    pathname: path.join(__dirname, 'property.html'),
                    protocol: 'file:',
                    slashes: true,
                }));

                propertyWindow.on('closed', () => {
                    propertyWindow = undefined;
                });

                propertyWindow.on('ready-to-show', () => {
                    client.pwd().then(pwd => {
                        dirSize(pwd === '/' ? pwd + name : pwd + '/' + name).then(result => {
                            propertyWindow.webContents.send('ftp:properties', pwd === '/' ? pwd + name : pwd + '/' + name, result.size);
                        });
                    });
                });
            }
        });
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
                connectWindow = undefined;
            });

            ipcMain.on('ftp:connection-established', (e, host, port, user, password) => {
                if (connectWindow) {
                    connectWindow.close();
                    connectWindow = undefined;
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

async function pwd() {
    return await client.pwd();
}

async function updateList() {
    // mainWindow.webContents.send('ftp:pwd', await client.pwd());
    // mainWindow.webContents.send('ftp:list', await client.list());
    let pwd = await client.pwd();
    let list = await client.list();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        for (let i = 0; i < list.length; i++) {
            if (list[i].type === 2) {
                await dirSize(pwd === '/' ? '/' + list[i].name : pwd + '/' + list[i].name).then(result => {
                    list[i].size = result.size;
                });
            }
        }
    }
    mainWindow.webContents.send('ftp:pwd', pwd);
    mainWindow.webContents.send('ftp:list', list);
}

async function mkdir(dirname) {
    await client.ensureDir(dirname);
    updateList();
}

async function cd(dirname) {
    let curdir = await client.pwd();
    await client.cd(path.join(curdir, dirname).replace(/\\/gmi, '/'));
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
    client.ftp.verbose = true;
    try {
        await client.access({
            host: host,
            user: user,
            password: password,
            port: port
        });
        hostname = host;
        //updater = setInterval(updateList, 1000);
        let pwd = await client.pwd();
        let list = await client.list();
        connection = true;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            for (let i = 0; i < list.length; i++) {
                if (list[i].type === 2) {
                    await dirSize(pwd === '/' ? '/' + list[i].name : pwd + '/' + list[i].name).then(result => {
                        list[i].size = result.size;
                    });
                }
            }
        }
        mainWindow.webContents.send('ftp:pwd', pwd);
        mainWindow.webContents.send('ftp:list', list);
    } catch (err) {
        console.log(err);
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

async function dirSize(directory) {
    if (connection) {
        let list = await client.list(directory);
        let directories = [];
        let size = 0;
        list.forEach(file => {
            if (file.type === 1) {
                size += file.size;
            }
            if (file.type === 2) directories.push(file);
        });
        for (const dir of directories) {
            await dirSize(directory === '/' ? '/' + dir.name : directory + '/' + dir.name).then((res) => {
                size += res.size;
            });
        }
        return { size, directories };
    }
}