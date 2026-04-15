// src/routes/escrow.routes.js

import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  create,
  release,
  cancel,
} from "../controllers/escrow.controller.js";

const router = express.Router();

router.post("/create", authMiddleware, create);
router.post("/release", authMiddleware, release);
router.post("/cancel", authMiddleware, cancel);

export default router;
