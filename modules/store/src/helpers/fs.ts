export const FILE_EXISTS = 1;
export const FILE_DOESNT_EXIST = 0;

let fs;
let path;

function requireFsModule() {
  if (!fs) {
    fs = require("fs");
  }
}

function requirePathModule() {
  if (!path) {
    path = require("path");
  }
}

export function getNodeJSModule(name: string) {
  try {
    const result = require(name);
    return result;
  } catch (e) {
    console.error(e);
  }
}

export function fsRead(path: string): Promise<any> {
  requireFsModule();
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path)) {
      resolve(undefined);
    }
    fs.readFile(path, "utf-8", (err, data) => {
      if (err) {
        return reject(err);
      }
      resolve(data);
    });
  });
}
export function fsWrite(path: string, data: any): Promise<void> {
  requireFsModule();
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, err => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

export function fsUnlink(path: string): Promise<void> {
  requireFsModule();
  return new Promise((resolve, reject) => {
    fs.unlink(path, err => {
      if (err) {
        if (err.code === "ENOENT") {
          return resolve();
        }
        return reject(err);
      }
      resolve();
    });
  });
}

export function fsStat(path: string): Promise<any> {
  requireFsModule();
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stat) => {
      if (err) {
        return reject(err);
      }
      resolve(stat);
    });
  });
}

export function fsMkDir(path: string): Promise<void> {
  requireFsModule();
  return new Promise((resolve, reject) => {
    fs.mkdir(path, err => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

export function sanitizeExt(ext: string): string {
  const result = ext
    .match(/\.?([^.\s]\w)+/gi)
    .join("")
    .toLowerCase();
  const separator = ".";
  return result.startsWith(separator) ? result : `${separator}${result}`;
}

export function checkFile(path: string): Promise<number> {
  requireFsModule();
  return new Promise((resolve, reject) => {
    const mode = fs.constants.F_OK | fs.constants.W_OK;
    fs.access(path, mode, err => {
      if (err) {
        if (err.code === "ENOENT") {
          return resolve(FILE_DOESNT_EXIST);
        }
        return reject(err);
      }
      return resolve(FILE_EXISTS);
    });
  });
}

export async function safeFsRead(path: string): Promise<any> {
  if ((await checkFile(path)) === FILE_DOESNT_EXIST) {
    return Promise.resolve(undefined);
  }
  return fsRead(path);
}

export async function isFile(path: string): Promise<boolean> {
  const fileStat = await fsStat(path);
  return fileStat.isFile();
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const fileStat = await fsStat(path);
    return fileStat.isDirectory();
  } catch (e) {
    return false;
  }
}

export async function createDirectory(path: string): Promise<void> {
  requireFsModule();
  if (!fs.existsSync(path)) {
    return fsMkDir(path);
  }
  return;
}

export function isDirectorySync(path: string): boolean {
  requireFsModule();
  try {
    return fs.lstatSync(path).isDirectory();
  } catch (e) {
    return false;
  }
}

export function createDirectorySync(path: string): void {
  requireFsModule();
  if (!fs.existsSync(path)) {
    return fs.mkdirSync(path, { recursive: true });
  }
  return;
}

export function getDirectoryFiles(path: string): Promise<string[]> {
  requireFsModule();
  return new Promise((resolve: any, reject: any): void => {
    fs.readdir(path, (err: Error, files: string[]) => {
      if (err) {
        return reject(err);
      }
      return resolve(files);
    });
  });
}

export function pathJoin(...args: string[]) {
  requirePathModule();
  return path.join(...args);
}
