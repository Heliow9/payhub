import { describe,expect,it } from 'vitest';
import { urlBase64ToUint8Array } from './push-utils';

describe('web push helpers',()=>{it('converte chave VAPID base64url',()=>{expect(Array.from(urlBase64ToUint8Array('AQIDBA'))).toEqual([1,2,3,4]);});});
