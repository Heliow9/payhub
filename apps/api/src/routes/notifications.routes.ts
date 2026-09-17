import { Router } from 'express';
import { z } from 'zod';
import { csrf,requireAuth } from '../middleware/auth.js';
import { ALL_NOTIFICATION_CATEGORIES } from '../services/notification-policy.js';
import type { NotificationService } from '../services/notification.service.js';

const categoryEnum=z.enum(ALL_NOTIFICATION_CATEGORIES);
export function notificationsRoutes(service:NotificationService){const r=Router();r.use(requireAuth);
  r.get('/',async(req,res,next)=>{try{res.json(await service.list(req.principal!,req.query.limit?Number(req.query.limit):60));}catch(e){next(e);}});
  r.get('/vapid-key',(_req,res)=>res.json(service.publicInfo()));
  r.get('/preferences',async(req,res,next)=>{try{res.json({preferences:await service.preferences(req.principal!)});}catch(e){next(e);}});
  r.put('/preferences',csrf,async(req,res,next)=>{try{const body=z.record(categoryEnum,z.boolean()).parse(req.body);await service.updatePreferences(req.principal!,body);res.status(204).end();}catch(e){next(e);}});
  r.post('/subscribe',csrf,async(req,res,next)=>{try{const body=z.object({endpoint:z.string().url(),keys:z.object({p256dh:z.string().min(10),auth:z.string().min(5)})}).parse(req.body);await service.subscribe(req.principal!,body,req.get('user-agent')??null);res.status(204).end();}catch(e){next(e);}});
  r.post('/unsubscribe',csrf,async(req,res,next)=>{try{const body=z.object({endpoint:z.string().url()}).parse(req.body);await service.unsubscribe(req.principal!,body.endpoint);res.status(204).end();}catch(e){next(e);}});
  r.post('/read-all',csrf,async(req,res,next)=>{try{await service.markAllRead(req.principal!);res.status(204).end();}catch(e){next(e);}});
  r.post('/:id/read',csrf,async(req,res,next)=>{try{await service.markRead(req.principal!,Number(req.params.id));res.status(204).end();}catch(e){next(e);}});
  return r;
}
