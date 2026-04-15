// src/routes/withdrawal.routes.js

import express from "express";
import { withdraw } from "../controllers/withdrawal.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", authMiddleware, withdraw);

export default router;
