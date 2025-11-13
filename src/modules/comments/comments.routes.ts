import { Router } from "express";
import { listComments, addComment } from "./comments.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

router.get("/:taskId/comments", authRequired, listComments);
router.post("/:taskId/comments", authRequired, addComment);

export default router;
