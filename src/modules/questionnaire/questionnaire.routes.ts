import { Router } from "express";
import { submitQuestionnaire, submitQuestionnaireForAll, getQuestionnaire, getMyQuestionnaires } from "./questionnaire.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

// IMPORTANT: Specific routes must come BEFORE parameterized routes
router.post("/submit-all", authRequired, submitQuestionnaireForAll);
router.get("/my", authRequired, getMyQuestionnaires); // Workers get their questionnaires
router.post("/", authRequired, submitQuestionnaire);
router.get("/:contractId", authRequired, getQuestionnaire);

export default router;
