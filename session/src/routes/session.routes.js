import express from "express";
import {
    endSessionController,
    getStatsController,
    getHistoryController,
    getChartDataController,
    getActiveSessionController,
} from "../controllers/session.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
    endSessionValidation,
    historyValidation,
    chartValidation,
} from "../middlewares/validator.middleware.js";

const router = express.Router();

router.use(authMiddleware);

// POST /api/sessions/end           → manual session end
// GET  /api/sessions/active        → is user currently in a session?
// GET  /api/sessions/stats         → streak, total minutes, today's minutes
// GET  /api/sessions/history       → paginated past sessions
// GET  /api/sessions/charts?range= → week or month chart data for Recharts

router.post("/end", endSessionValidation, endSessionController);
router.get("/active", getActiveSessionController);
router.get("/stats", getStatsController);
router.get("/history", historyValidation, getHistoryController);
router.get("/charts", chartValidation, getChartDataController);

export default router;