/** Serialized into the Node-only permissions container; never needs a shell. */
function copyUploads(task) {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const flags = fs.constants;
  if (!fs.existsSync('/proc/self/fd')) throw new Error('Linux descriptor paths are required');
  const descriptor = fd => `/proc/self/fd/${fd}`;
  const directory = file => fs.openSync(file, flags.O_RDONLY | flags.O_DIRECTORY | flags.O_NOFOLLOW);
  const owner = task.owner;
  let files = 0, directories = 0;
  const hashes = new Map();
  function harden(fd, mode) {
    if (owner) fs.fchownSync(fd, owner[0], owner[1]);
    fs.fchmodSync(fd, mode);
  }
  function copy(sourceFd, targetFd, relative, depth) {
    if (depth > task.maximumDepth) throw new Error('Upload directory depth exceeded');
    for (const name of fs.readdirSync(descriptor(sourceFd)).sort()) {
      const source = path.join(descriptor(sourceFd), name);
      const target = path.join(descriptor(targetFd), name);
      const entry = fs.lstatSync(source);
      if (entry.isSymbolicLink()) throw new Error('Uploads contain a symlink');
      if (entry.isDirectory()) {
        if (++directories > task.maximumDirectories) throw new Error('Upload directory count exceeded');
        fs.mkdirSync(target, {mode:0o700});
        const sourceChild = directory(source), targetChild = directory(target);
        try { copy(sourceChild, targetChild, `${relative}${name}/`, depth+1); harden(targetChild, 0o700); }
        finally { fs.closeSync(sourceChild); fs.closeSync(targetChild); }
      } else if (entry.isFile()) {
        if (++files > task.maximumFiles) throw new Error('Upload file count exceeded');
        const input = fs.openSync(source, flags.O_RDONLY | flags.O_NOFOLLOW);
        let output;
        try {
          const before = fs.fstatSync(input);
          if (!before.isFile()) throw new Error('Upload is no longer a regular file');
          output = fs.openSync(target, flags.O_WRONLY | flags.O_CREAT | flags.O_EXCL | flags.O_NOFOLLOW, 0o600);
          const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(64*1024);
          let length;
          while ((length = fs.readSync(input, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0,length));
            let offset=0; while(offset<length) offset+=fs.writeSync(output,buffer,offset,length-offset,null);
          }
          const after = fs.fstatSync(input);
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Upload changed while being copied');
          fs.fsyncSync(output); harden(output, before.mode & 0o111 ? 0o700 : 0o600);
          hashes.set(`uploads/${relative}${name}`, hash.digest('hex'));
        } finally { fs.closeSync(input); if(output!==undefined)fs.closeSync(output); }
      } else throw new Error('Uploads contain a non-regular entry');
    }
  }
  if (task.operation === 'restore-uploads' && fs.readdirSync(task.target).length) throw new Error('Restore upload target is not empty');
  fs.mkdirSync(task.target,{recursive:true,mode:0o700});
  const sourceFd=directory(task.source), targetFd=directory(task.target);
  try { copy(sourceFd,targetFd,'',0); harden(targetFd,0o700); }
  finally { fs.closeSync(sourceFd); fs.closeSync(targetFd); }
  if(task.hardenParent) {
    const parent=directory(path.dirname(task.target));
    try {harden(parent,0o700);} finally {fs.closeSync(parent);}
  }
  if(task.checksums) {
    const fd=fs.openSync(task.checksums,flags.O_RDONLY|flags.O_NOFOLLOW);
    let text;
    try {if(!fs.fstatSync(fd).isFile())throw new Error('Checksums are not a regular file');text=fs.readFileSync(fd,'utf8');}
    finally {fs.closeSync(fd);}
    const expected=new Map();
    for(const line of text.split('\n')) {
      const match=/^([a-f0-9]{64})  (uploads\/.+)$/.exec(line);
      if(match) {if(expected.has(match[2]))throw new Error('Duplicate upload checksum');expected.set(match[2],match[1]);}
    }
    if(expected.size!==hashes.size)throw new Error('Upload checksum inventory differs');
    for(const [file,hash] of hashes)if(expected.get(file)!==hash)throw new Error('Upload checksum mismatch');
  }
}

export function uploadCopyScript(task) {
  return `const task = ${JSON.stringify(task)};\n(${copyUploads.toString()})(task);`;
}
