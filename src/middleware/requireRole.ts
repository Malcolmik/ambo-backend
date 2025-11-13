import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

export function requireRole(...allowedRoles: string[]) {
  return function (req: AuthedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
}
