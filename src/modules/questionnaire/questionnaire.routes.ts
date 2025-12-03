import { Router } from "express";
import { submitQuestionnaire, submitQuestionnaireForAll, getQuestionnaire } from "./questionnaire.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

// IMPORTANT: /submit-all must come BEFORE / or it won't match
router.post("/submit-all", authRequired, submitQuestionnaireForAll);
router.post("/", authRequired, submitQuestionnaire);
router.get("/:contractId", authRequired, getQuestionnaire);

export default router;
