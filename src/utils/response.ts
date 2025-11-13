import { Response } from "express";

export function success(res: Response, data: any, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res: Response, message: string, status = 400) {
  return res.status(status).json({ success: false, message });
}
