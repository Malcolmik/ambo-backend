import { Router } from "express";
import { listActivity } from "./activity.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

router.get("/", authRequired, listActivity);

export default router;
