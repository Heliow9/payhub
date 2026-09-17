import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../core/security.js';

export class StorageService{
  constructor(private root:string){}
  private full(relative:string):string{
    const clean=relative.replace(/\\/g,'/').replace(/^\/+/, '');
    const resolved=path.resolve(this.root,clean);const base=path.resolve(this.root)+path.sep;
    if(!resolved.startsWith(base))throw new Error('Caminho de armazenamento inválido.');
    return resolved;
  }
  async write(relative:string,data:Buffer):Promise<{path:string;sha256:string}>{const target=this.full(relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data,{mode:0o600});return {path:relative.replace(/\\/g,'/'),sha256:sha256(data)};}
  async read(relative:string):Promise<Buffer>{return fs.readFile(this.full(relative));}
  async exists(relative:string):Promise<boolean>{try{await fs.access(this.full(relative));return true;}catch{return false;}}
  async remove(relative:string):Promise<void>{try{await fs.rm(this.full(relative),{force:true});}catch{}}
  async removeTree(relative:string):Promise<void>{try{await fs.rm(this.full(relative),{recursive:true,force:true});}catch{}}
}

