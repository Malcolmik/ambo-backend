import { Router } from "express";
import { submitQuestionnaire, getQuestionnaire } from "./questionnaire.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

router.post("/", authRequired, submitQuestionnaire);
router.get("/:contractId", authRequired, getQuestionnaire);

export default router;
