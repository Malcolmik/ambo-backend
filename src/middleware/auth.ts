import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    name: string;
  };
}

export function optionalAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  
  // No token = continue without user (public access)
  if (!header || !header.startsWith("Bearer ")) {
    return next();
  }
  
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as any;
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      name: decoded.name,
    };
  } catch (err) {
    // Invalid token = continue without user (don't fail)
  }
  
  next();
}


export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as any;
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}
