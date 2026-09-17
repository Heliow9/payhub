import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import webpush from 'web-push';
import type { Env } from '../config/env.js';
import { sha256 } from '../core/security.js';
import type { Principal } from '../core/types.js';
import { ALL_NOTIFICATION_CATEGORIES,defaultPushCategories,notificationPayload,type NotificationCategory } from './notification-policy.js';

export type RecipientType='USER'|'EMPLOYEE';
export type NotificationRecipient={type:RecipientType;id:number;role?:'MASTER'|'ANALISTA'};
export type NotificationInput={category:NotificationCategory;title:string;body:string;url?:string|null;dedupKey?:string|null};

function principalRecipient(principal:Principal):NotificationRecipient{return principal.kind==='USER'?{type:'USER',id:principal.id,role:principal.role}:{type:'EMPLOYEE',id:principal.id};}

export class NotificationService{
  private pushEnabled=false;
  constructor(private pool:Pool,private env:Env){
    if(env.VAPID_SUBJECT&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY){
      try{webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);this.pushEnabled=true;}catch(error){console.error('[PayHub Push] configuração VAPID inválida',error);}
    }
  }

  publicInfo(){return{enabled:this.pushEnabled,publicKey:this.pushEnabled?this.env.VAPID_PUBLIC_KEY:''};}

  async list(principal:Principal,limit=60){const recipient=principalRecipient(principal);const safe=Math.min(Math.max(limit,1),100);const [rows]=await this.pool.query<RowDataPacket[]>(`SELECT id,category,title,body,url,read_at readAt,created_at createdAt FROM notifications WHERE recipient_type='${recipient.type}' AND recipient_id=${Number(recipient.id)} ORDER BY id DESC LIMIT ${safe}`);const [countRows]=await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) value FROM notifications WHERE recipient_type=? AND recipient_id=? AND read_at IS NULL`,[recipient.type,recipient.id]);return{notifications:rows,unreadCount:Number(countRows[0]?.value??0)};}

  async markRead(principal:Principal,id:number):Promise<void>{const r=principalRecipient(principal);await this.pool.execute(`UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE id=? AND recipient_type=? AND recipient_id=?`,[id,r.type,r.id]);}
  async markAllRead(principal:Principal):Promise<void>{const r=principalRecipient(principal);await this.pool.execute(`UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE recipient_type=? AND recipient_id=? AND read_at IS NULL`,[r.type,r.id]);}

  private defaults(principal:Principal):NotificationCategory[]{return principal.kind==='EMPLOYEE'?defaultPushCategories({kind:'EMPLOYEE'}):defaultPushCategories({kind:'USER',role:principal.role});}
  async preferences(principal:Principal){const r=principalRecipient(principal);const defaults=new Set(this.defaults(principal));const result=Object.fromEntries(ALL_NOTIFICATION_CATEGORIES.map((category)=>[category,defaults.has(category)])) as Record<NotificationCategory,boolean>;const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT category,enabled FROM push_preferences WHERE principal_type=? AND principal_id=?`,[r.type,r.id]);for(const row of rows){const category=String(row.category) as NotificationCategory;if(ALL_NOTIFICATION_CATEGORIES.includes(category))result[category]=Boolean(row.enabled);}return result;}
  async updatePreferences(principal:Principal,values:Partial<Record<NotificationCategory,boolean>>):Promise<void>{const r=principalRecipient(principal);for(const [category,enabled] of Object.entries(values)){if(!ALL_NOTIFICATION_CATEGORIES.includes(category as NotificationCategory))continue;await this.pool.execute(`INSERT INTO push_preferences (principal_type,principal_id,category,enabled,updated_at) VALUES (?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),updated_at=UTC_TIMESTAMP()`,[r.type,r.id,category,enabled?1:0]);}}

  async subscribe(principal:Principal,subscription:{endpoint:string;keys:{p256dh:string;auth:string}},userAgent:string|null):Promise<void>{const r=principalRecipient(principal);if(!subscription.endpoint||!subscription.keys?.p256dh||!subscription.keys?.auth)throw new Error('Subscription Web Push inválida.');const endpointHash=sha256(subscription.endpoint);await this.pool.execute(`INSERT INTO push_subscriptions (principal_type,principal_id,endpoint_hash,endpoint,p256dh,auth_secret,user_agent,created_at,updated_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE principal_type=VALUES(principal_type),principal_id=VALUES(principal_id),endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth_secret=VALUES(auth_secret),user_agent=VALUES(user_agent),updated_at=UTC_TIMESTAMP()`,[r.type,r.id,endpointHash,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,userAgent?.slice(0,500)??null]);}
  async unsubscribe(principal:Principal,endpoint:string):Promise<void>{const r=principalRecipient(principal);await this.pool.execute(`DELETE FROM push_subscriptions WHERE principal_type=? AND principal_id=? AND endpoint_hash=?`,[r.type,r.id,sha256(endpoint)]);}

  private async pushAllowed(recipient:NotificationRecipient,category:NotificationCategory):Promise<boolean>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT enabled FROM push_preferences WHERE principal_type=? AND principal_id=? AND category=? LIMIT 1`,[recipient.type,recipient.id,category]);if(rows[0])return Boolean(rows[0].enabled);if(recipient.type==='EMPLOYEE')return defaultPushCategories({kind:'EMPLOYEE'}).includes(category);let role=recipient.role;if(!role){const [users]=await this.pool.execute<RowDataPacket[]>(`SELECT role FROM users WHERE id=? LIMIT 1`,[recipient.id]);role=users[0]?.role as 'MASTER'|'ANALISTA'|undefined;}return role?defaultPushCategories({kind:'USER',role}).includes(category):false;}

  async notifyRecipient(recipient:NotificationRecipient,input:NotificationInput):Promise<number|null>{const dedup=input.dedupKey?`${input.dedupKey}:${recipient.type}:${recipient.id}`.slice(0,190):null;const [insert]=await this.pool.execute<ResultSetHeader>(`INSERT IGNORE INTO notifications (recipient_type,recipient_id,category,title,body,url,dedup_key,read_at,created_at) VALUES (?,?,?,?,?,?,?,NULL,UTC_TIMESTAMP())`,[recipient.type,recipient.id,input.category,input.title.slice(0,190),input.body.slice(0,500),input.url?.slice(0,500)??null,dedup]);if(insert.affectedRows===0)return null;const id=insert.insertId;if(this.pushEnabled&&await this.pushAllowed(recipient,input.category))await this.sendPush(recipient,{...input,notificationId:id});return id;}

  async notifyEmployee(employeeId:number,input:NotificationInput){return this.notifyRecipient({type:'EMPLOYEE',id:employeeId},input);}
  async notifyAdmins(input:NotificationInput,roles:Array<'MASTER'|'ANALISTA'>=['MASTER','ANALISTA']){const placeholders=roles.map(()=>'?').join(',');const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,role FROM users WHERE status='ACTIVE' AND role IN (${placeholders})`,roles);await Promise.allSettled(rows.map((row)=>this.notifyRecipient({type:'USER',id:Number(row.id),role:String(row.role) as 'MASTER'|'ANALISTA'},input)));}

  private async sendPush(recipient:NotificationRecipient,input:NotificationInput&{notificationId:number}){const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,endpoint,p256dh,auth_secret authSecret FROM push_subscriptions WHERE principal_type=? AND principal_id=?`,[recipient.type,recipient.id]);const payload=JSON.stringify(notificationPayload({title:input.title,body:input.body,url:input.url,category:input.category,notificationId:input.notificationId}));await Promise.allSettled(rows.map(async(row)=>{try{await webpush.sendNotification({endpoint:String(row.endpoint),keys:{p256dh:String(row.p256dh),auth:String(row.authSecret)}},payload,{TTL:60*60*24});await this.pool.execute(`UPDATE push_subscriptions SET last_success_at=UTC_TIMESTAMP(),last_failure_at=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?`,[row.id]);}catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await this.pool.execute(`DELETE FROM push_subscriptions WHERE id=?`,[row.id]);else await this.pool.execute(`UPDATE push_subscriptions SET last_failure_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?`,[row.id]);}}));}
}
