import { Router } from 'express';
export function healthRoutes(){const r=Router();r.get('/',(_req,res)=>res.json({ok:true,service:'payhub-api',version:'0.3.0',time:new Date().toISOString()}));return r;}
