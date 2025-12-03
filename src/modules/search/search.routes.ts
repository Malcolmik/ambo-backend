import { Router } from "express";
import { globalSearch } from "./search.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

// Global search endpoint
router.get("/", authRequired, globalSearch);

export default router;
