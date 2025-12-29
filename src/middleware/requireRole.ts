import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

/**
 * Role hierarchy for permission checks
 * Higher index = more permissions
 */
const ROLE_HIERARCHY: Record<string, number> = {
  CLIENT_VIEWER_PENDING: 0,
  CLIENT_VIEWER: 1,
  WORKER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/**
 * Middleware to require specific role(s)
 * Supports multiple roles: requireRole("ADMIN", "SUPER_ADMIN")
 * 
 * @param allowedRoles - One or more roles that are allowed
 */
export function requireRole(...allowedRoles: string[]) {
  return function (req: AuthedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized: Authentication required" 
      });
    }

    const userRole = req.user.role;

    // Check if user's role is in the allowed list
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // Return forbidden with helpful message
    return res.status(403).json({ 
      success: false, 
      message: `Forbidden: This action requires one of these roles: ${allowedRoles.join(", ")}` 
    });
  };
}

/**
 * Middleware to require minimum role level
 * Uses role hierarchy to allow higher roles
 * 
 * Example: requireMinRole("ADMIN") allows ADMIN and SUPER_ADMIN
 * 
 * @param minRole - Minimum role required
 */
export function requireMinRole(minRole: string) {
  return function (req: AuthedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized: Authentication required" 
      });
    }

    const userRole = req.user.role;
    const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 999;

    if (userLevel >= requiredLevel) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      message: `Forbidden: Minimum role required: ${minRole}` 
    });
  };
}

/**
 * Check if a role has admin-level permissions (ADMIN or SUPER_ADMIN)
 */
export function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Check if a role is SUPER_ADMIN
 */
export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string): string {
  const displayNames: Record<string, string> = {
    SUPER_ADMIN: "Super Administrator",
    ADMIN: "Administrator",
    WORKER: "Worker",
    CLIENT_VIEWER: "Client",
    CLIENT_VIEWER_PENDING: "Pending Client",
  };
  return displayNames[role] || role;
}
