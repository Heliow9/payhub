import { Router } from 'express';
export function healthRoutes(){const r=Router();r.get('/',(_req,res)=>res.json({ok:true,service:'PayHub API',version:'0.5.3',time:new Date().toISOString()}));return r;}
